/*
 * Ordered label picker (card button popup).
 * Shows every board label in the member's custom order; clicking a label
 * adds/removes it on the current card through the REST API.
 */
(function () {
  'use strict';

  var LABELS = window.LM_LABELS;
  var ORDER = window.LM_ORDER;
  var API = window.LM_API;

  var t = null;
  var cardId = null;
  var ordered = [];                 // board labels in custom order
  var onCard = new Set();           // label ids currently on the card
  var busy = new Set();             // label ids with an in-flight toggle
  var authorized = false;
  var filterText = '';

  var $ = function (id) { return document.getElementById(id); };
  var listEl, statusEl, authPanelEl;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setStatus(msg, kind, autoclearMs) {
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
    if (statusEl._timer) clearTimeout(statusEl._timer);
    if (msg && autoclearMs) {
      statusEl._timer = setTimeout(function () { setStatus(''); }, autoclearMs);
    }
  }

  function resize() {
    if (typeof t.sizeTo === 'function') {
      t.sizeTo('#picker').catch(function () { /* popup may be closing */ });
    }
  }

  function matchesFilter(label) {
    if (!filterText) return true;
    var name = (label.name || LABELS.colorInfo(label.color).name).toLowerCase();
    return name.indexOf(filterText) !== -1;
  }

  function render() {
    listEl.textContent = '';
    var shown = ordered.filter(matchesFilter);
    if (!shown.length) {
      listEl.appendChild(el('div', 'empty-state', ordered.length ? 'No labels match.' : 'No labels on this board yet.'));
    }
    shown.forEach(function (label) {
      var row = el('button', 'pick-row');
      row.type = 'button';
      if (onCard.has(label.id)) row.classList.add('on');
      if (busy.has(label.id)) row.classList.add('busy');

      var info = LABELS.colorInfo(label.color);
      var chip = el('span', 'chip small');
      chip.style.background = info.bg;
      chip.style.color = info.fg;
      var text = el('span', 'chip-text', label.name || info.name);
      if (!label.name) text.style.fontStyle = 'italic';
      chip.appendChild(text);
      row.appendChild(chip);

      row.appendChild(el('span', 'check', '✓'));
      row.addEventListener('click', function () { toggle(label); });
      listEl.appendChild(row);
    });
    resize();
  }

  function toggle(label) {
    if (busy.has(label.id)) return;
    if (!API.restAvailable()) {
      setStatus('No API key configured — this list is read-only. See the README.', 'error');
      return;
    }
    if (!authorized) {
      authPanelEl.hidden = false;
      resize();
      return;
    }
    var removing = onCard.has(label.id);
    busy.add(label.id);
    // Optimistic UI: flip immediately, revert on failure.
    if (removing) onCard.delete(label.id); else onCard.add(label.id);
    render();

    var op = removing
      ? API.removeLabelFromCard(t, cardId, label.id)
      : API.addLabelToCard(t, cardId, label.id);

    op.then(function () {
      busy.delete(label.id);
      render();
    }).catch(function (err) {
      busy.delete(label.id);
      if (removing) onCard.add(label.id); else onCard.delete(label.id);
      render();
      if (err && err.isAuth) {
        authorized = false;
        authPanelEl.hidden = false;
        setStatus('Authorization expired — click “Allow…” and try again.', 'error');
      } else {
        setStatus('Could not update the card: ' + (err && err.message || err), 'error', 5000);
      }
      resize();
    });
  }

  function refresh() {
    return Promise.all([
      t.card('id', 'labels'),
      t.board('labels'),
      ORDER.loadOrder(t),
    ]).then(function (res) {
      cardId = res[0].id;
      onCard = new Set((res[0].labels || []).map(function (l) { return l.id; }));
      ordered = ORDER.applyOrder(res[1].labels || [], res[2]);
      render();
    }).catch(function (err) {
      setStatus('Could not load labels: ' + (err && err.message || err), 'error');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    listEl = $('list');
    statusEl = $('status');
    authPanelEl = $('auth-panel');

    window.LM_IFRAME().then(function (_t) {
      t = _t;
      return API.isAuthorized(t);
    }).then(function (isAuth) {
      authorized = isAuth;
      if (!authorized && API.restAvailable()) authPanelEl.hidden = false;

      $('btn-authorize').addEventListener('click', function () {
        API.authorize(t).then(function () {
          authorized = true;
          authPanelEl.hidden = true;
          setStatus('Authorized ✓', 'ok', 2000);
          resize();
        }).catch(function () {
          setStatus('Authorization was cancelled or blocked.', 'error', 4000);
        });
      });

      $('filter').addEventListener('input', function (e) {
        filterText = e.target.value.trim().toLowerCase();
        render();
      });

      $('btn-manage').addEventListener('click', function () {
        t.modal({
          url: window.LM_CONFIG.propagate('./manager.html'),
          title: 'Label Manager — custom label order',
          fullscreen: false,
          height: 680,
        }).catch(function () {
          setStatus('Open the board button “Label Order” to edit.', '', 4000);
        });
      });

      if (typeof t.render === 'function') t.render(function () { refresh(); });
      return refresh();
    }).catch(function (err) {
      setStatus('Failed to start: ' + (err && err.message || err), 'error');
    });
  });
})();
