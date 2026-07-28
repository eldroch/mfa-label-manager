/*
 * Custom-order persistence.
 *
 * The order is stored in board-level shared pluginData (t.set/t.get), which
 * Trello caps at 8192 characters for the whole scope. To stay comfortably
 * inside that cap we store 8-character id suffixes instead of full 24-char
 * ids (Mongo ObjectIds — the tail bytes are counter+random, so suffixes are
 * unique in practice; on the freak chance of a collision we fall back to the
 * full id for the colliding labels).
 *
 * Format: "1:<entry>,<entry>,..." where an entry is either an 8-char id
 * suffix or a full 24-char id. Labels missing from the stored order (created
 * after the last save) are appended in Trello's native order.
 */
(function () {
  'use strict';

  var VERSION_PREFIX = '1:';
  var SUFFIX_LEN = 8;
  var STORAGE_KEY = 'order';

  function suffix(id) {
    return id.slice(-SUFFIX_LEN);
  }

  // labelsInOrder: array of label objects in the desired order -> storage string
  function encode(labelsInOrder) {
    var counts = {};
    labelsInOrder.forEach(function (l) {
      var s = suffix(l.id);
      counts[s] = (counts[s] || 0) + 1;
    });
    var entries = labelsInOrder.map(function (l) {
      var s = suffix(l.id);
      return counts[s] > 1 ? l.id : s;
    });
    return VERSION_PREFIX + entries.join(',');
  }

  // storage string -> Map(entry -> rank)
  function decode(str) {
    var ranks = new Map();
    if (typeof str !== 'string' || str.indexOf(VERSION_PREFIX) !== 0) return ranks;
    var body = str.slice(VERSION_PREFIX.length);
    if (!body) return ranks;
    body.split(',').forEach(function (entry, i) {
      if (entry && !ranks.has(entry)) ranks.set(entry, i);
    });
    return ranks;
  }

  function rankOf(ranks, id) {
    // Full ids win over suffixes so collision fallbacks resolve correctly.
    if (ranks.has(id)) return ranks.get(id);
    var s = suffix(id);
    if (ranks.has(s)) return ranks.get(s);
    return null;
  }

  /*
   * Merge live board labels with a stored order string.
   * Returns labels sorted by: stored rank, then (for labels not in the
   * stored order) native Trello order appended at the end.
   */
  function applyOrder(labels, orderStr) {
    var ranks = decode(orderStr);
    var known = [];
    var unknown = [];
    labels.forEach(function (l) {
      var r = rankOf(ranks, l.id);
      if (r === null) {
        unknown.push(l);
      } else {
        known.push({ label: l, rank: r });
      }
    });
    known.sort(function (a, b) { return a.rank - b.rank; });
    unknown.sort(window.LM_LABELS.nativeCompare);
    return known.map(function (k) { return k.label; }).concat(unknown);
  }

  function loadOrder(t) {
    return t.get('board', 'shared', STORAGE_KEY, '');
  }

  /*
   * Board-scope pluginData officially allows 8192 chars (4096 is the
   * documented floor and still applies to card/member scope). Boards can hold
   * ~1000 labels, which would not fit — so the order is truncated to a budget
   * and the caller is told how many entries were kept. 7200 chars ≈ 790
   * labels, far beyond any board that a human actually reorders by hand.
   */
  var SOFT_BUDGET = 7200;
  var FLOOR_BUDGET = 3600;

  function encodeWithin(labelsInOrder, budget) {
    var full = encode(labelsInOrder);
    if (full.length <= budget) return { str: full, kept: labelsInOrder.length };
    var kept = labelsInOrder.length;
    while (kept > 0) {
      var attempt = encode(labelsInOrder.slice(0, kept));
      if (attempt.length <= budget) return { str: attempt, kept: kept };
      // Jump straight to an estimate instead of shrinking one by one.
      kept = Math.min(kept - 1, Math.floor(budget / (attempt.length / kept)));
    }
    return { str: VERSION_PREFIX, kept: 0 };
  }

  function saveOrder(t, labelsInOrder) {
    var fit = encodeWithin(labelsInOrder, SOFT_BUDGET);
    return t.set('board', 'shared', STORAGE_KEY, fit.str).then(function () {
      return { kept: fit.kept, total: labelsInOrder.length };
    }).catch(function (err) {
      // A board still on the old 4096 limit: retry with the smaller budget.
      if (!/PluginData length/i.test((err && err.message) || '')) throw err;
      var small = encodeWithin(labelsInOrder, FLOOR_BUDGET);
      return t.set('board', 'shared', STORAGE_KEY, small.str).then(function () {
        return { kept: small.kept, total: labelsInOrder.length };
      });
    });
  }

  function clearOrder(t) {
    return t.remove('board', 'shared', STORAGE_KEY);
  }

  /*
   * Priority labels — a small, board-shared set the team wants kept front and
   * centre (e.g. "needs attention" reds), independent of the custom order.
   *
   * Stored as bare 8-char id suffixes; unlike the order there is no full-id
   * fallback, because the worst case of a suffix collision here is one label
   * wrongly starred rather than a scrambled order.
   */
  var PRIORITY_KEY = 'priority';

  function encodeIds(labels) {
    return VERSION_PREFIX + labels.map(function (l) { return suffix(l.id); }).join(',');
  }

  function decodeIds(str) {
    var set = new Set();
    if (typeof str !== 'string' || str.indexOf(VERSION_PREFIX) !== 0) return set;
    str.slice(VERSION_PREFIX.length).split(',').forEach(function (e) {
      if (e) set.add(e);
    });
    return set;
  }

  function hasId(set, id) {
    return set.has(suffix(id));
  }

  function loadPriority(t) {
    return t.get('board', 'shared', PRIORITY_KEY, '').then(decodeIds);
  }

  function savePriority(t, labels) {
    return t.set('board', 'shared', PRIORITY_KEY, encodeIds(labels));
  }

  // Splits labels into [priority, rest], each keeping its incoming order.
  function partition(labels, prioritySet) {
    var hi = [], lo = [];
    labels.forEach(function (l) {
      (hasId(prioritySet, l.id) ? hi : lo).push(l);
    });
    return [hi, lo];
  }

  window.LM_ORDER = {
    STORAGE_KEY: STORAGE_KEY,
    PRIORITY_KEY: PRIORITY_KEY,
    encodeIds: encodeIds,
    decodeIds: decodeIds,
    hasId: hasId,
    loadPriority: loadPriority,
    savePriority: savePriority,
    partition: partition,
    encode: encode,
    decode: decode,
    applyOrder: applyOrder,
    loadOrder: loadOrder,
    saveOrder: saveOrder,
    clearOrder: clearOrder,
  };
})();
