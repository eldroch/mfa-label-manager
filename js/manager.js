/*
 * Label Manager modal.
 *
 * - Drag & drop (or ▲/▼) to define a custom label order; autosaved to
 *   board-shared pluginData, so every board member sees the same order.
 * - Reordering needs no REST authorization. Creating / renaming / recoloring /
 *   deleting labels goes through the REST API and asks for authorization once.
 * - "Sync" tools optionally rename labels with number prefixes so Trello's own
 *   alphabetical-within-color sorting mirrors the custom order.
 */
(function () {
  'use strict';

  var LABELS = window.LM_LABELS;
  var ORDER = window.LM_ORDER;
  var API = window.LM_API;

  var t = null;
  var boardId = null;
  var ordered = [];          // label objects in working order
  var priority = new Set();  // suffixes of labels starred as priority
  var authorized = false;
  var saveTimer = null;
  var savePending = false;
  var dragState = null;

  var $ = function (id) { return document.getElementById(id); };
  var listEl, saveStatusEl, globalStatusEl, syncStatusEl, authPanelEl;

  /* ---------------- tiny DOM helpers (textContent only — label names are user data) */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(node, msg, kind, autoclearMs) {
    node.textContent = msg || '';
    node.className = 'status' + (kind ? ' ' + kind : '');
    if (node._clearTimer) clearTimeout(node._clearTimer);
    if (msg && autoclearMs) {
      node._clearTimer = setTimeout(function () {
        node.textContent = '';
        node.className = 'status';
      }, autoclearMs);
    }
  }

  function chipFor(label, extraClass) {
    var info = LABELS.colorInfo(label.color);
    var chip = el('span', 'chip' + (extraClass ? ' ' + extraClass : ''));
    chip.style.background = info.bg;
    chip.style.color = info.fg;
    var text = el('span', 'chip-text', label.name || info.name);
    if (!label.name) text.style.fontStyle = 'italic';
    chip.appendChild(text);
    return chip;
  }

  /* ---------------- data loading ---------------- */

  function fetchLabels() {
    // Prefer REST (returns up to 1000 labels); fall back to the client library.
    if (authorized) {
      return API.getBoardLabels(t, boardId).catch(function () {
        return t.board('labels').then(function (b) { return b.labels; });
      });
    }
    return t.board('labels').then(function (b) { return b.labels; });
  }

  function refresh() {
    if (dragState || savePending) return Promise.resolve(); // don't clobber in-flight edits
    return Promise.all([
      fetchLabels(), ORDER.loadOrder(t), API.isAuthorized(t), ORDER.loadPriority(t),
    ]).then(function (res) {
      ordered = ORDER.applyOrder(res[0] || [], res[1]);
      authorized = res[2];
      priority = res[3];
      updateAuthPanel();
      render();
    }).catch(function (err) {
      setStatus(globalStatusEl, 'Could not load labels: ' + err.message, 'error');
    });
  }

  /* ---------------- saving ---------------- */

  function scheduleSave() {
    savePending = true;
    setStatus(saveStatusEl, 'Saving…');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 500);
  }

  function doSave() {
    ORDER.saveOrder(t, ordered).then(function (res) {
      savePending = false;
      if (res && res.kept < res.total) {
        setStatus(saveStatusEl, 'Order saved for the first ' + res.kept + ' of ' + res.total + ' labels (Trello storage limit)', 'error');
      } else {
        setStatus(saveStatusEl, 'Order saved ✓', 'ok', 2500);
      }
    }).catch(function (err) {
      savePending = false;
      setStatus(saveStatusEl, 'Could not save order: ' + err.message, 'error');
    });
  }

  /* ---------------- rendering ---------------- */

  function render() {
    listEl.textContent = '';
    if (!ordered.length) {
      var empty = el('div', 'empty-state', 'No labels on this board yet.');
      empty.appendChild(el('div', 'muted', 'Create one with “+ New label” above.'));
      listEl.appendChild(empty);
      return;
    }
    ordered.forEach(function (label, i) {
      listEl.appendChild(buildRow(label, i));
    });
  }

  function buildRow(label, index) {
    var row = el('div', 'row');
    row.dataset.id = label.id;

    row.appendChild(el('span', 'index', String(index + 1)));

    var handle = el('span', 'handle', '⠿');
    handle.title = 'Drag to reorder';
    handle.addEventListener('pointerdown', function (e) { startDrag(e, row); });
    row.appendChild(handle);

    var chip = chipFor(label);
    chip.title = 'Click to rename';
    chip.style.cursor = 'text';
    chip.addEventListener('click', function () { enterEdit(row, label); });
    row.appendChild(chip);

    var actions = el('div', 'row-actions');

    var isHi = ORDER.hasId(priority, label.id);
    var star = el('button', 'icon-btn star' + (isHi ? ' on' : ''), isHi ? '★' : '☆');
    star.title = isHi ? 'Priority label — click to unstar' : 'Mark as priority (kept front and centre)';
    star.addEventListener('click', function () { togglePriority(label); });
    actions.appendChild(star);

    var up = el('button', 'icon-btn', '▲');
    up.title = 'Move up';
    up.disabled = index === 0;
    up.addEventListener('click', function () { move(index, index - 1); });
    actions.appendChild(up);

    var down = el('button', 'icon-btn', '▼');
    down.title = 'Move down';
    down.disabled = index === ordered.length - 1;
    down.addEventListener('click', function () { move(index, index + 1); });
    actions.appendChild(down);

    var swatch = el('button', 'icon-btn');
    swatch.title = authorized ? 'Change color' : 'Change color (requires authorization)';
    var sq = el('span');
    sq.style.cssText = 'display:inline-block;width:18px;height:18px;border-radius:3px;border:1px solid #091e4224;';
    sq.style.background = LABELS.colorInfo(label.color).bg;
    swatch.appendChild(sq);
    swatch.addEventListener('click', function (e) { openColorPop(e, row, label); });
    actions.appendChild(swatch);

    var del = el('button', 'icon-btn', '✕');
    del.title = authorized ? 'Delete label' : 'Delete label (requires authorization)';
    del.addEventListener('click', function () { confirmDelete(row, label, del); });
    actions.appendChild(del);

    row.appendChild(actions);
    return row;
  }

  /*
   * Priority is stored independently of the order, so starring a label never
   * moves it — it just marks it for the surfaces that show a short list.
   */
  function togglePriority(label) {
    var suffix = label.id.slice(-8);
    if (priority.has(suffix)) priority.delete(suffix); else priority.add(suffix);
    render();
    var starred = ordered.filter(function (l) { return ORDER.hasId(priority, l.id); });
    ORDER.savePriority(t, starred).then(function () {
      setStatus(saveStatusEl, 'Priority labels saved ✓', 'ok', 2000);
    }).catch(function (err) {
      setStatus(saveStatusEl, 'Could not save priority: ' + err.message, 'error');
    });
  }

  function move(from, to) {
    if (to < 0 || to >= ordered.length) return;
    var item = ordered.splice(from, 1)[0];
    ordered.splice(to, 0, item);
    render();
    scheduleSave();
  }

  /* ---------------- drag & drop ---------------- */

  function rows() { return Array.prototype.slice.call(listEl.querySelectorAll('.row')); }

  function startDrag(e, row) {
    if (dragState || e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    var allRows = rows();
    var index = allRows.indexOf(row);
    if (index < 0) return;
    var rowH = row.offsetHeight;
    dragState = {
      row: row,
      index: index,          // original index
      target: index,         // current drop index
      startY: e.clientY,
      startScroll: listEl.scrollTop,
      rowH: rowH,
      pointerId: e.pointerId,
      scrollRAF: null,
      lastClientY: e.clientY,
    };
    row.classList.add('dragging');
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
    e.target.addEventListener('pointermove', onDragMove);
    e.target.addEventListener('pointerup', endDrag);
    e.target.addEventListener('pointercancel', endDrag);
    autoScrollLoop();
  }

  function dragDelta() {
    return (dragState.lastClientY - dragState.startY) + (listEl.scrollTop - dragState.startScroll);
  }

  function onDragMove(e) {
    if (!dragState) return;
    dragState.lastClientY = e.clientY;
    positionDrag();
  }

  function positionDrag() {
    var dy = dragDelta();
    var steps = Math.round(dy / dragState.rowH);
    var target = Math.max(0, Math.min(ordered.length - 1, dragState.index + steps));
    dragState.target = target;
    dragState.row.style.transform = 'translateY(' + dy + 'px)';
    rows().forEach(function (r, i) {
      if (r === dragState.row) return;
      var shift = 0;
      if (dragState.index < target && i > dragState.index && i <= target) shift = -dragState.rowH;
      if (dragState.index > target && i < dragState.index && i >= target) shift = dragState.rowH;
      r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
    });
  }

  function autoScrollLoop() {
    if (!dragState) return;
    var rect = listEl.getBoundingClientRect();
    var y = dragState.lastClientY;
    var zone = 40;
    var delta = 0;
    if (y < rect.top + zone) delta = -Math.ceil((rect.top + zone - y) / 4);
    else if (y > rect.bottom - zone) delta = Math.ceil((y - (rect.bottom - zone)) / 4);
    if (delta) {
      listEl.scrollTop += delta;
      positionDrag();
    }
    dragState.scrollRAF = requestAnimationFrame(autoScrollLoop);
  }

  function endDrag(e) {
    if (!dragState) return;
    var state = dragState;
    dragState = null;
    if (state.scrollRAF) cancelAnimationFrame(state.scrollRAF);
    e.target.removeEventListener('pointermove', onDragMove);
    e.target.removeEventListener('pointerup', endDrag);
    e.target.removeEventListener('pointercancel', endDrag);
    state.row.classList.remove('dragging');
    rows().forEach(function (r) { r.style.transform = ''; });
    if (state.target !== state.index) {
      var item = ordered.splice(state.index, 1)[0];
      ordered.splice(state.target, 0, item);
      scheduleSave();
    }
    render();
  }

  /* ---------------- rename ---------------- */

  function enterEdit(row, label) {
    if (!requireAuth()) return;
    if (row.classList.contains('editing')) return;
    row.classList.add('editing');
    row.textContent = '';

    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 1024;
    input.value = label.name || '';
    input.placeholder = 'Label name';

    var save = el('button', 'primary', 'Save');
    var cancel = el('button', null, 'Cancel');

    function commit() {
      var name = input.value.trim();
      if (name === (label.name || '')) { render(); return; }
      save.disabled = cancel.disabled = true;
      API.updateLabel(t, label.id, { name: name }).then(function () {
        label.name = name;
        render();
        setStatus(globalStatusEl, 'Label renamed ✓', 'ok', 2000);
      }).catch(function (err) { failOp(err, 'rename the label'); render(); });
    }

    save.addEventListener('click', commit);
    cancel.addEventListener('click', function () { render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') render();
    });

    row.appendChild(input);
    row.appendChild(save);
    row.appendChild(cancel);
    input.focus();
    input.select();
  }

  /* ---------------- recolor ---------------- */

  function closeColorPop() {
    var pop = document.querySelector('.color-pop');
    if (pop) pop.remove();
    document.removeEventListener('click', outsideColorPop, true);
  }

  function outsideColorPop(e) {
    if (!e.target.closest('.color-pop')) closeColorPop();
  }

  function openColorPop(e, row, label) {
    if (!requireAuth()) return;
    e.stopPropagation();
    closeColorPop();

    var pop = el('div', 'color-pop');
    var grid = el('div', 'color-grid');
    LABELS.COLOR_ORDER.forEach(function (color) {
      var info = LABELS.colorInfo(color);
      var b = el('button', 'color-swatch');
      b.style.background = info.bg;
      b.title = info.name;
      if (label.color === color) b.classList.add('selected');
      b.addEventListener('click', function () { pickColor(label, color); });
      grid.appendChild(b);
    });
    pop.appendChild(grid);

    var none = el('button', 'no-color-btn', 'No color');
    if (!label.color) none.classList.add('selected');
    none.addEventListener('click', function () { pickColor(label, null); });
    pop.appendChild(none);

    // Position under the row, inside the scroll container.
    pop.style.top = (row.offsetTop + row.offsetHeight) + 'px';
    pop.style.right = '12px';
    listEl.appendChild(pop);
    setTimeout(function () { document.addEventListener('click', outsideColorPop, true); }, 0);
  }

  function pickColor(label, color) {
    closeColorPop();
    // Trello's API expects the string "null" to clear a label's color.
    API.updateLabel(t, label.id, { color: color === null ? 'null' : color }).then(function () {
      label.color = color;
      render();
      setStatus(globalStatusEl, 'Color updated ✓', 'ok', 2000);
    }).catch(function (err) { failOp(err, 'change the color'); });
  }

  /* ---------------- create / delete ---------------- */

  function createLabel() {
    if (!requireAuth()) return;
    var name = '';
    var existingNew = listEl.querySelector('.row.new-label');
    if (existingNew) { existingNew.querySelector('input').focus(); return; }

    var row = el('div', 'row editing new-label');
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 1024;
    input.placeholder = 'New label name (color: pick after creating)';
    var save = el('button', 'primary', 'Create');
    var cancel = el('button', null, 'Cancel');

    function commit() {
      name = input.value.trim();
      save.disabled = cancel.disabled = true;
      API.createLabel(t, boardId, name, 'null').then(function (created) {
        ordered.unshift({ id: created.id, name: created.name, color: created.color || null });
        render();
        scheduleSave();
        setStatus(globalStatusEl, 'Label created — click its swatch to pick a color', 'ok', 4000);
      }).catch(function (err) { failOp(err, 'create the label'); render(); });
    }

    save.addEventListener('click', commit);
    cancel.addEventListener('click', function () { render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') render();
    });

    row.appendChild(input);
    row.appendChild(save);
    row.appendChild(cancel);
    listEl.prepend(row);
    input.focus();
  }

  function confirmDelete(row, label, btn) {
    if (!requireAuth()) return;
    if (btn.dataset.confirming) {
      API.deleteLabel(t, label.id).then(function () {
        ordered = ordered.filter(function (l) { return l.id !== label.id; });
        render();
        scheduleSave();
        setStatus(globalStatusEl, 'Label deleted (removed from all cards)', 'ok', 3000);
      }).catch(function (err) { failOp(err, 'delete the label'); });
      return;
    }
    btn.dataset.confirming = '1';
    btn.textContent = 'Delete?';
    btn.style.color = '#ca3521';
    btn.style.fontWeight = '600';
    setTimeout(function () {
      delete btn.dataset.confirming;
      btn.textContent = '✕';
      btn.style.color = '';
      btn.style.fontWeight = '';
    }, 3000);
  }

  /* ---------------- prefix sync ---------------- */

  var PREFIX_RE = /^\d{1,3}·\s/;

  function stripPrefix(name) { return (name || '').replace(PREFIX_RE, ''); }

  function prefixPlan(addPrefixes) {
    // Group the current custom order by color; number labels within each group.
    var groups = new Map();
    ordered.forEach(function (label) {
      var key = label.color || 'none';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(label);
    });
    var renames = [];
    groups.forEach(function (labels) {
      labels.forEach(function (label, i) {
        var base = stripPrefix(label.name);
        if (!base.trim() && addPrefixes) return; // leave unnamed labels alone
        var next = addPrefixes && labels.length > 1 ? (i + 1) + '· ' + base : base;
        if (next !== label.name) renames.push({ label: label, name: next });
      });
    });
    return renames;
  }

  function runPrefixSync(addPrefixes) {
    if (!requireAuth()) return;
    var renames = prefixPlan(addPrefixes);
    if (!renames.length) {
      setStatus(syncStatusEl, 'Nothing to change.', 'ok', 2500);
      return;
    }
    var applyBtn = $('btn-prefix-apply');
    var removeBtn = $('btn-prefix-remove');
    applyBtn.disabled = removeBtn.disabled = true;

    var done = 0;
    // Sequential to stay well inside Trello's rate limits.
    var chain = renames.reduce(function (p, r) {
      return p.then(function () {
        setStatus(syncStatusEl, 'Renaming ' + (++done) + '/' + renames.length + '…');
        return API.updateLabel(t, r.label.id, { name: r.name }).then(function () {
          r.label.name = r.name;
        });
      });
    }, Promise.resolve());

    chain.then(function () {
      setStatus(syncStatusEl, 'Done — renamed ' + renames.length + ' label' + (renames.length === 1 ? '' : 's') + ' ✓', 'ok', 4000);
    }).catch(function (err) {
      setStatus(syncStatusEl, 'Stopped after ' + (done - 1) + ': ' + err.message, 'error');
    }).then(function () {
      applyBtn.disabled = removeBtn.disabled = false;
      render();
    });
  }

  /* ---------------- recolor sync ---------------- */

  var BACKUP_KEY = 'colorBackup';

  function suffix8(id) { return id.slice(-8); }

  function runRecolor() {
    if (!requireAuth()) return;
    var statusEl = $('recolor-status');
    var applyBtn = $('btn-recolor-apply');

    // Two-step confirm: first click arms the button.
    var targets = ordered.slice(0, LABELS.COLOR_ORDER.length);
    if (!applyBtn.dataset.armed) {
      applyBtn.dataset.armed = '1';
      applyBtn.textContent = 'Really recolor ' + targets.length + ' labels?';
      applyBtn.classList.add('danger');
      setTimeout(function () {
        delete applyBtn.dataset.armed;
        applyBtn.textContent = 'Recolor to match order';
        applyBtn.classList.remove('danger');
      }, 4000);
      return;
    }
    delete applyBtn.dataset.armed;
    applyBtn.textContent = 'Recolor to match order';
    applyBtn.classList.remove('danger');

    // Back up current colors (only labels we are about to touch) for undo.
    var backup = '1:' + targets.map(function (l) {
      return suffix8(l.id) + '=' + (l.color || '');
    }).join(',');

    var changes = targets.map(function (label, i) {
      return { label: label, color: LABELS.COLOR_ORDER[i] };
    }).filter(function (c) { return c.label.color !== c.color; });

    if (!changes.length) {
      setStatus(statusEl, 'Colors already match this order.', 'ok', 3000);
      return;
    }

    var over = ordered.length - targets.length;
    applyBtn.disabled = $('btn-recolor-undo').disabled = true;

    t.set('board', 'shared', BACKUP_KEY, backup).then(function () {
      var done = 0;
      return changes.reduce(function (p, c) {
        return p.then(function () {
          setStatus(statusEl, 'Recoloring ' + (++done) + '/' + changes.length + '…');
          return API.updateLabel(t, c.label.id, { color: c.color }).then(function () {
            c.label.color = c.color;
          });
        });
      }, Promise.resolve());
    }).then(function () {
      var msg = 'Done — native Trello order now matches ✓';
      if (over > 0) msg += ' (first ' + targets.length + ' labels only; the palette has ' + LABELS.COLOR_ORDER.length + ' slots)';
      setStatus(statusEl, msg, 'ok', 6000);
    }).catch(function (err) {
      setStatus(statusEl, 'Stopped: ' + (err && err.message || err) + ' — “Undo recolor” restores the backup.', 'error');
    }).then(function () {
      applyBtn.disabled = $('btn-recolor-undo').disabled = false;
      render();
    });
  }

  function undoRecolor() {
    if (!requireAuth()) return;
    var statusEl = $('recolor-status');
    t.get('board', 'shared', BACKUP_KEY, '').then(function (backup) {
      if (!backup || backup.indexOf('1:') !== 0) {
        setStatus(statusEl, 'No color backup found on this board.', 'error', 4000);
        return;
      }
      var map = new Map();
      backup.slice(2).split(',').forEach(function (entry) {
        var kv = entry.split('=');
        if (kv.length === 2) map.set(kv[0], kv[1] || null);
      });
      var changes = ordered.filter(function (l) { return map.has(suffix8(l.id)); })
        .map(function (l) { return { label: l, color: map.get(suffix8(l.id)) }; })
        .filter(function (c) { return c.label.color !== c.color; });
      if (!changes.length) {
        setStatus(statusEl, 'Colors already match the backup.', 'ok', 3000);
        return t.remove('board', 'shared', BACKUP_KEY);
      }
      var done = 0;
      return changes.reduce(function (p, c) {
        return p.then(function () {
          setStatus(statusEl, 'Restoring ' + (++done) + '/' + changes.length + '…');
          return API.updateLabel(t, c.label.id, { color: c.color === null ? 'null' : c.color }).then(function () {
            c.label.color = c.color;
          });
        });
      }, Promise.resolve()).then(function () {
        setStatus(statusEl, 'Original colors restored ✓', 'ok', 4000);
        render();
        return t.remove('board', 'shared', BACKUP_KEY);
      });
    }).catch(function (err) {
      setStatus(statusEl, 'Could not restore: ' + (err && err.message || err), 'error');
    });
  }

  /* ---------------- auth ---------------- */

  function requireAuth() {
    if (!API.restAvailable()) {
      setStatus(globalStatusEl, 'This deployment has no API key configured, so label editing is disabled (reordering still works). See the README.', 'error');
      return false;
    }
    if (!authorized) {
      authPanelEl.hidden = false;
      setStatus(globalStatusEl, 'Please click “Allow…” above first.', 'error');
      return false;
    }
    return true;
  }

  function failOp(err, what) {
    if (err && err.isAuth) {
      authorized = false;
      updateAuthPanel();
      setStatus(globalStatusEl, 'Authorization expired — click “Allow…” and try again.', 'error');
    } else {
      setStatus(globalStatusEl, 'Could not ' + what + ': ' + (err && err.message || err), 'error');
    }
  }

  function updateAuthPanel() {
    if (!API.restAvailable()) {
      authPanelEl.hidden = false;
      $('auth-text').innerHTML = 'Reordering works and is saved for everyone on this board. ' +
        'Label <strong>editing</strong> is disabled because no API key is configured for this deployment — see the README.';
      $('btn-authorize').style.display = 'none';
      return;
    }
    authPanelEl.hidden = authorized;
  }

  /* ---------------- boot ---------------- */

  document.addEventListener('DOMContentLoaded', function () {
    listEl = $('label-list');
    saveStatusEl = $('save-status');
    globalStatusEl = $('global-status');
    syncStatusEl = $('sync-status');
    authPanelEl = $('auth-panel');

    window.LM_IFRAME().then(function (_t) {
      t = _t;
      return Promise.all([
        t.board('id'),
        API.isAuthorized(t),
      ]);
    }).then(function (res) {
      boardId = res[0].id;
      authorized = res[1];
      updateAuthPanel();

      $('btn-authorize').addEventListener('click', function () {
        API.authorize(t).then(function () {
          authorized = true;
          updateAuthPanel();
          setStatus(globalStatusEl, 'Authorized ✓ — label editing enabled.', 'ok', 3000);
          return refresh();
        }).catch(function () {
          setStatus(globalStatusEl, 'Authorization was cancelled or blocked.', 'error');
        });
      });

      $('btn-new').addEventListener('click', createLabel);
      $('btn-sort-native').addEventListener('click', function () {
        ordered = ordered.slice().sort(LABELS.nativeCompare);
        render();
        scheduleSave();
      });
      $('btn-sort-name').addEventListener('click', function () {
        ordered = ordered.slice().sort(function (a, b) {
          return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
        });
        render();
        scheduleSave();
      });
      $('btn-prefix-apply').addEventListener('click', function () { runPrefixSync(true); });
      $('btn-prefix-remove').addEventListener('click', function () { runPrefixSync(false); });
      $('btn-recolor-apply').addEventListener('click', runRecolor);
      $('btn-recolor-undo').addEventListener('click', undoRecolor);

      if (typeof t.render === 'function') t.render(function () { refresh(); });
      return refresh();
    }).catch(function (err) {
      setStatus($('global-status'), 'Failed to start: ' + (err && err.message || err), 'error');
    });
  });
})();
