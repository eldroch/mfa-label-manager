/*
 * Card-back section: shows THIS card's labels in the board's custom order.
 *
 * Trello's own "Labels" row on the card back is sorted by color and cannot be
 * changed by a Power-Up, so this renders the same labels in the order the
 * board actually chose. Editing happens through the section's "Edit" action
 * (see the card-back-section capability in js/connector.js).
 */
(function () {
  'use strict';

  var LABELS = window.LM_LABELS;
  var ORDER = window.LM_ORDER;

  var t = null;
  var chipsEl, statusEl;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function resize() {
    if (typeof t.sizeTo === 'function') {
      t.sizeTo('#root').catch(function () { /* card closing */ });
    }
  }

  function chipFor(label, isPriority) {
    var info = LABELS.colorInfo(label.color);
    var chip = el('span', 'chip small' + (isPriority ? ' is-priority' : ''));
    chip.style.background = info.bg;
    chip.style.color = info.fg;
    if (isPriority) chip.title = 'Priority label';
    var text = el('span', 'chip-text', label.name || info.name);
    if (!label.name) text.style.fontStyle = 'italic';
    chip.appendChild(text);
    return chip;
  }

  function render(labels, prioritySet) {
    chipsEl.textContent = '';
    if (!labels.length) {
      chipsEl.appendChild(el('span', 'muted', 'No labels on this card yet.'));
      resize();
      return;
    }
    // Starred labels lead, so "needs attention" is never buried mid-row.
    var split = ORDER.partition(labels, prioritySet);
    split[0].forEach(function (l) { chipsEl.appendChild(chipFor(l, true)); });
    if (split[0].length && split[1].length) {
      chipsEl.appendChild(el('span', 'chip-divider'));
    }
    split[1].forEach(function (l) { chipsEl.appendChild(chipFor(l, false)); });
    resize();
  }

  function refresh() {
    return Promise.all([
      t.card('labels'),
      ORDER.loadOrder(t),
      ORDER.loadPriority(t),
    ]).then(function (res) {
      var onCard = res[0].labels || [];
      // applyOrder ranks against the board-wide order; labels not in it fall
      // to the end in Trello's native order.
      render(ORDER.applyOrder(onCard, res[1]), res[2]);
    }).catch(function (err) {
      statusEl.textContent = 'Could not load labels: ' + (err && err.message || err);
      statusEl.className = 'status error';
      resize();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    chipsEl = document.getElementById('chips');
    statusEl = document.getElementById('status');

    window.LM_IFRAME().then(function (_t) {
      t = _t;
      if (typeof t.render === 'function') t.render(function () { refresh(); });
      return refresh();
    }).catch(function (err) {
      statusEl.textContent = 'Failed to start: ' + (err && err.message || err);
      statusEl.className = 'status error';
    });
  });
})();
