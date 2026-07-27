/*
 * Settings popup: authorization status + reset of the stored custom order.
 */
(function () {
  'use strict';

  var API = window.LM_API;
  var ORDER = window.LM_ORDER;

  var t = null;
  var $ = function (id) { return document.getElementById(id); };

  function setStatus(msg, kind, autoclearMs) {
    var node = $('status');
    node.textContent = msg || '';
    node.className = 'status' + (kind ? ' ' + kind : '');
    if (node._timer) clearTimeout(node._timer);
    if (msg && autoclearMs) node._timer = setTimeout(function () { setStatus(''); }, autoclearMs);
  }

  function renderAuth(authorized) {
    var state = $('auth-state');
    if (!API.restAvailable()) {
      state.textContent = 'No API key configured (see README) — label editing disabled.';
      $('btn-authorize').hidden = true;
      $('btn-revoke').hidden = true;
      return;
    }
    state.textContent = authorized ? 'Connected ✓' : 'Not connected';
    $('btn-authorize').hidden = authorized;
    $('btn-revoke').hidden = !authorized;
    if (typeof t.sizeTo === 'function') t.sizeTo('#settings').catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    window.LM_IFRAME().then(function (_t) {
      t = _t;
      return API.isAuthorized(t);
    }).then(function (authorized) {
      renderAuth(authorized);

      $('btn-authorize').addEventListener('click', function () {
        API.authorize(t).then(function () {
          renderAuth(true);
          setStatus('Authorized ✓', 'ok', 2500);
        }).catch(function () {
          setStatus('Authorization was cancelled or blocked.', 'error', 4000);
        });
      });

      $('btn-revoke').addEventListener('click', function () {
        API.clearToken(t).then(function () {
          renderAuth(false);
          setStatus('Disconnected. You can revoke the token fully at trello.com → Settings → Applications.', 'ok', 6000);
        });
      });

      $('btn-clear-order').addEventListener('click', function () {
        ORDER.clearOrder(t).then(function () {
          setStatus('Custom order cleared — labels follow Trello’s native order again.', 'ok', 4000);
        }).catch(function (err) {
          setStatus('Could not clear: ' + (err && err.message || err), 'error');
        });
      });

      if (typeof t.sizeTo === 'function') t.sizeTo('#settings').catch(function () {});
    }).catch(function (err) {
      setStatus('Failed to start: ' + (err && err.message || err), 'error');
    });
  });
})();
