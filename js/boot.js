/*
 * Loads the Power-Up client library, then hands back window.TrelloPowerUp.
 *
 * Real Trello: loads https://p.trellocdn.com/power-up.min.js.
 * Local development: append ?mock=1 (the dev harness does this) and the stub
 * in dev/mock-trello.js is loaded instead, so every page runs outside Trello.
 */
(function () {
  'use strict';

  var params = new URLSearchParams(window.location.search);
  var useMock = params.has('mock');

  window.LM_BOOT = new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = useMock ? './dev/mock-trello.js' : 'https://p.trellocdn.com/power-up.min.js';
    script.onload = function () {
      if (window.TrelloPowerUp) {
        resolve(window.TrelloPowerUp);
      } else {
        reject(new Error('Power-Up client library failed to initialize'));
      }
    };
    script.onerror = function () {
      reject(new Error('Could not load ' + script.src));
    };
    document.head.appendChild(script);
  });

  // For pages that run inside popups/modals: resolve a ready-to-use `t`.
  window.LM_IFRAME = function () {
    return window.LM_BOOT.then(function (TrelloPowerUp) {
      var opts = {};
      if (window.LM_CONFIG.hasRest()) {
        opts.appKey = window.LM_CONFIG.APP_KEY;
        opts.appName = window.LM_CONFIG.APP_NAME;
      }
      return TrelloPowerUp.iframe(opts);
    });
  };
})();
