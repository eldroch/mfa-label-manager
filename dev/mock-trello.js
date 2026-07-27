/*
 * Mock of the Trello Power-Up client library + REST API for local development.
 * Loaded by js/boot.js when a page runs with ?mock=1 (see dev/index.html).
 *
 * If the page is iframed by the dev harness, state is shared through
 * window.parent.__MOCK__ so the harness, manager, picker and settings all see
 * the same board. Standalone pages fall back to their own in-memory state.
 */
(function () {
  'use strict';

  /* ---------------- shared state ---------------- */

  function genId() {
    var hex = '';
    while (hex.length < 16) hex += Math.floor(Math.random() * 16).toString(16);
    return Math.floor(Date.now() / 1000).toString(16).padStart(8, '0') + hex;
  }

  function seedState() {
    function label(name, color) { return { id: genId(), name: name, color: color }; }
    var labels = [
      label('Bug', 'red'),
      label('Hotfix', 'red_dark'),
      label('Feature', 'green'),
      label('Quick win', 'green'),
      label('Nice to have', 'green_light'),
      label('In review', 'yellow'),
      label('On hold', 'yellow_dark'),
      label('Backend', 'blue'),
      label('Docs', 'blue_light'),
      label('Frontend', 'sky'),
      label('Design', 'purple'),
      label('Ops', 'orange'),
      label('Internal', 'black_light'),
      label("Won't fix", 'black'),
      label('', 'pink'),
      label('Legacy', null),
    ];
    return {
      board: { id: 'mockboard0000000000000001', name: 'Product Roadmap', labels: labels },
      card: {
        id: 'mockcard00000000000000001',
        name: 'Improve login flow',
        idLabels: [labels[0].id, labels[7].id, labels[15].id],
      },
      pluginData: {},   // '<scope>:<visibility>' -> { key: value }
      token: null,
      latencyMs: 150,
      failNext: false,
    };
  }

  var harness = null;
  try {
    if (window.parent && window.parent !== window && window.parent.__MOCK__) {
      harness = window.parent.__MOCK__;
    }
  } catch (e) { /* cross-origin parent — not the harness */ }

  var state = harness ? harness.state : seedState();
  var notify = harness ? harness.notify : function () {};

  // The real deployment needs an API key in js/config.js; the mock supplies a
  // fake one so the full REST code path runs during local development.
  if (window.LM_CONFIG && !window.LM_CONFIG.APP_KEY) {
    window.LM_CONFIG.APP_KEY = 'mock-app-key';
  }

  /* ---------------- helpers ---------------- */

  function delay(value) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(value); }, state.latencyMs || 0);
    });
  }

  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

  function cardLabels() {
    return state.board.labels.filter(function (l) {
      return state.card.idLabels.indexOf(l.id) !== -1;
    });
  }

  var VALID_COLORS = (function () {
    var hues = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'];
    var out = [];
    hues.forEach(function (h) { out.push(h + '_light', h, h + '_dark'); });
    return out;
  })();

  /* ---------------- pluginData (t.get / t.set / t.remove) ---------------- */

  var LIMITS = { board: 8192, organization: 8192, card: 4096, member: 4096 };

  function bucket(scope, visibility) {
    var key = scope + ':' + visibility;
    if (!state.pluginData[key]) state.pluginData[key] = {};
    return state.pluginData[key];
  }

  function tSet(scope, visibility, key, value) {
    var b = bucket(scope, visibility);
    var next = Object.assign({}, b);
    if (typeof key === 'object') Object.assign(next, key);
    else next[key] = value;
    var size = JSON.stringify(next).length;
    var cap = LIMITS[scope] || 4096;
    if (size > cap) {
      return Promise.reject(new Error('PluginData length of ' + cap + ' characters exceeded'));
    }
    state.pluginData[scope + ':' + visibility] = next;
    notify('pluginData');
    return delay();
  }

  function tGet(scope, visibility, key, dflt) {
    var b = bucket(scope, visibility);
    if (key === undefined) return delay(clone(b));
    return delay(b.hasOwnProperty(key) ? clone(b[key]) : dflt);
  }

  function tRemove(scope, visibility, key) {
    var b = bucket(scope, visibility);
    (Array.isArray(key) ? key : [key]).forEach(function (k) { delete b[k]; });
    notify('pluginData');
    return delay();
  }

  /* ---------------- mock REST endpoint ---------------- */

  function response(status, body) {
    return {
      ok: status >= 200 && status < 300,
      status: status,
      statusText: String(status),
      text: function () { return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body || null)); },
      json: function () { return Promise.resolve(body); },
    };
  }

  function mockRest(urlStr, method) {
    var url = new URL(urlStr);
    var q = url.searchParams;
    var path = url.pathname.replace(/^\/1/, '');

    if (state.failNext) {
      state.failNext = false;
      notify('rest');
      return delay(response(500, 'mock: simulated server error'));
    }
    if (q.get('token') !== state.token || !state.token) {
      return delay(response(401, 'invalid token'));
    }

    var m, label;

    // GET /boards/{id}/labels
    if (method === 'GET' && (m = path.match(/^\/boards\/([^/]+)\/labels$/))) {
      var limit = parseInt(q.get('limit') || '50', 10);
      return delay(response(200, clone(state.board.labels.slice(0, limit))));
    }

    // POST /labels
    if (method === 'POST' && path === '/labels') {
      var color = q.get('color');
      color = (!color || color === 'null') ? null : color;
      if (color !== null && VALID_COLORS.indexOf(color) === -1) {
        return delay(response(400, 'invalid value for color'));
      }
      label = { id: genId(), name: q.get('name') || '', color: color };
      state.board.labels.push(label);
      notify('labels');
      return delay(response(200, clone(label)));
    }

    // PUT /labels/{id}
    if (method === 'PUT' && (m = path.match(/^\/labels\/([^/]+)$/))) {
      label = state.board.labels.find(function (l) { return l.id === m[1]; });
      if (!label) return delay(response(404, 'label not found'));
      if (q.has('name')) label.name = q.get('name');
      if (q.has('color')) {
        var c = q.get('color');
        c = (!c || c === 'null') ? null : c;
        if (c !== null && VALID_COLORS.indexOf(c) === -1) {
          return delay(response(400, 'invalid value for color'));
        }
        label.color = c;
      }
      notify('labels');
      return delay(response(200, clone(label)));
    }

    // DELETE /labels/{id}
    if (method === 'DELETE' && (m = path.match(/^\/labels\/([^/]+)$/))) {
      var before = state.board.labels.length;
      state.board.labels = state.board.labels.filter(function (l) { return l.id !== m[1]; });
      if (state.board.labels.length === before) return delay(response(404, 'label not found'));
      state.card.idLabels = state.card.idLabels.filter(function (id) { return id !== m[1]; });
      notify('labels');
      return delay(response(200, {}));
    }

    // POST /cards/{id}/idLabels?value=
    if (method === 'POST' && (m = path.match(/^\/cards\/([^/]+)\/idLabels$/))) {
      var add = q.get('value');
      if (!state.board.labels.some(function (l) { return l.id === add; })) {
        return delay(response(404, 'label not found'));
      }
      if (state.card.idLabels.indexOf(add) !== -1) {
        return delay(response(400, 'that label is already on the card'));
      }
      state.card.idLabels.push(add);
      notify('card');
      return delay(response(200, clone(state.card.idLabels)));
    }

    // DELETE /cards/{id}/idLabels/{labelId}
    if (method === 'DELETE' && (m = path.match(/^\/cards\/([^/]+)\/idLabels\/([^/]+)$/))) {
      if (state.card.idLabels.indexOf(m[2]) === -1) {
        return delay(response(404, 'label is not on the card'));
      }
      state.card.idLabels = state.card.idLabels.filter(function (id) { return id !== m[2]; });
      notify('card');
      return delay(response(200, {}));
    }

    return delay(response(404, 'mock: unhandled route ' + method + ' ' + path));
  }

  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var urlStr = typeof input === 'string' ? input : input.url;
    if (urlStr.indexOf('https://api.trello.com/1') === 0) {
      return mockRest(urlStr, (init && init.method) || 'GET');
    }
    return realFetch ? realFetch(input, init) : Promise.reject(new Error('fetch unavailable'));
  };

  /* ---------------- the mock `t` ---------------- */

  function pickFields(source, extra, fields) {
    if (fields.length === 1 && fields[0] === 'all') {
      return Object.assign({}, clone(source), clone(extra));
    }
    var out = {};
    fields.forEach(function (f) {
      if (extra && extra.hasOwnProperty(f)) out[f] = clone(extra[f]);
      else out[f] = clone(source[f]);
    });
    return out;
  }

  var mockT = {
    board: function () {
      var fields = Array.prototype.slice.call(arguments);
      return delay(pickFields(state.board, { labels: state.board.labels }, fields));
    },
    card: function () {
      var fields = Array.prototype.slice.call(arguments);
      return delay(pickFields(state.card, { labels: cardLabels() }, fields));
    },
    get: tGet,
    set: tSet,
    remove: tRemove,
    arg: function (name, dflt) {
      var v = new URLSearchParams(window.location.search).get(name);
      return v === null ? dflt : v;
    },
    getContext: function () {
      return { board: state.board.id, card: state.card.id, theme: 'light' };
    },
    render: function (fn) {
      window.__mockRender = fn;
    },
    sizeTo: function () { return Promise.resolve(); },
    getRestApi: function () {
      return {
        isAuthorized: function () { return Promise.resolve(state.token !== null); },
        getToken: function () { return Promise.resolve(state.token); },
        authorize: function () {
          state.token = 'mock-token-' + Math.random().toString(36).slice(2, 10);
          notify('auth');
          return Promise.resolve(state.token);
        },
        clearToken: function () {
          state.token = null;
          notify('auth');
          return Promise.resolve();
        },
      };
    },
    modal: function (opts) {
      if (harness && harness.openFrame) harness.openFrame(opts.url, opts.title || 'Modal', 'modal');
      else console.log('[mock] t.modal', opts);
      return Promise.resolve();
    },
    popup: function (opts) {
      if (harness && harness.openFrame) harness.openFrame(opts.url, opts.title || 'Popup', 'popup');
      else console.log('[mock] t.popup', opts);
      return Promise.resolve();
    },
    closeModal: function () {
      if (harness && harness.closeFrame) harness.closeFrame('modal');
      return Promise.resolve();
    },
    closePopup: function () {
      if (harness && harness.closeFrame) harness.closeFrame('popup');
      return Promise.resolve();
    },
    alert: function (opts) {
      console.log('[mock] t.alert', opts);
      return Promise.resolve();
    },
    localizeKey: function (k) { return k; },
  };

  // Exposed so the dev harness (which loads this file directly, not via an
  // iframe) can adopt this state object and share it with its iframes.
  window.__MOCK_STATE__ = state;

  window.TrelloPowerUp = {
    version: 'mock',
    iframe: function () { return mockT; },
    initialize: function (capabilities) {
      window.__mockCapabilities = capabilities;
      console.log('[mock] initialize with capabilities:', Object.keys(capabilities));
      return mockT;
    },
    Promise: window.Promise,
  };
})();
