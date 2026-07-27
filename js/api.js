/*
 * Thin Trello REST helper used by the picker (toggle labels on a card) and
 * the manager (label CRUD). All calls go through the per-user token issued
 * by t.getRestApi().authorize(); nothing here works until the member has
 * authorized the Power-Up.
 *
 * Requests deliberately pass everything as query parameters (no JSON body):
 * Trello accepts that for these endpoints and it keeps the requests CORS
 * "simple", avoiding preflights inside Trello's sandboxed iframes.
 */
(function () {
  'use strict';

  var API_BASE = 'https://api.trello.com/1';

  function AuthError(message) {
    var e = new Error(message || 'Not authorized');
    e.isAuth = true;
    return e;
  }

  function restAvailable() {
    return window.LM_CONFIG.hasRest();
  }

  function isAuthorized(t) {
    if (!restAvailable()) return Promise.resolve(false);
    return t.getRestApi().isAuthorized();
  }

  // Must be called from a click handler (browser popup rules).
  function authorize(t) {
    if (!restAvailable()) return Promise.reject(new Error('No API key configured'));
    return t.getRestApi().authorize({ scope: 'read,write', expiration: 'never' });
  }

  function clearToken(t) {
    if (!restAvailable()) return Promise.resolve();
    return t.getRestApi().clearToken();
  }

  function request(t, method, path, params) {
    return t.getRestApi().getToken().then(function (token) {
      if (!token) throw AuthError();
      var url = new URL(API_BASE + path);
      url.searchParams.set('key', window.LM_CONFIG.APP_KEY);
      url.searchParams.set('token', token);
      Object.keys(params || {}).forEach(function (k) {
        if (params[k] !== undefined && params[k] !== null) {
          url.searchParams.set(k, params[k]);
        }
      });
      return fetch(url.toString(), { method: method }).then(function (res) {
        if (res.status === 401) {
          // Token revoked or expired — forget it so the UI re-prompts.
          return clearToken(t).then(function () { throw AuthError('Authorization expired'); });
        }
        if (!res.ok) {
          return res.text().then(function (body) {
            throw new Error('Trello API ' + res.status + ': ' + (body || res.statusText));
          });
        }
        return res.text().then(function (body) {
          try { return body ? JSON.parse(body) : null; } catch (e) { return null; }
        });
      });
    });
  }

  window.LM_API = {
    AuthError: AuthError,
    restAvailable: restAvailable,
    isAuthorized: isAuthorized,
    authorize: authorize,
    clearToken: clearToken,

    // Reads
    getBoardLabels: function (t, boardId) {
      return request(t, 'GET', '/boards/' + boardId + '/labels', { fields: 'id,name,color', limit: 1000 });
    },

    // Card label toggling
    addLabelToCard: function (t, cardId, labelId) {
      return request(t, 'POST', '/cards/' + cardId + '/idLabels', { value: labelId });
    },
    removeLabelFromCard: function (t, cardId, labelId) {
      return request(t, 'DELETE', '/cards/' + cardId + '/idLabels/' + labelId, {});
    },

    // Label CRUD
    createLabel: function (t, boardId, name, color) {
      return request(t, 'POST', '/labels', { idBoard: boardId, name: name, color: color || '' });
    },
    updateLabel: function (t, labelId, fields) {
      return request(t, 'PUT', '/labels/' + labelId, fields);
    },
    deleteLabel: function (t, labelId) {
      return request(t, 'DELETE', '/labels/' + labelId, {});
    },
  };
})();
