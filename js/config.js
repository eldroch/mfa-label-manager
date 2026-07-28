/*
 * Label Manager — configuration.
 *
 * APP_KEY is the API key of YOUR Power-Up. Create the Power-Up at
 * https://trello.com/power-ups/admin, open its "API Key" tab, click
 * "Generate a new API Key", and paste the key here. Also add your hosting
 * origin (e.g. https://<you>.github.io) to the key's "Allowed Origins".
 *
 * The key is a public identifier (the secret is the per-user token that
 * Trello issues during authorization), so committing it is normal practice
 * for client-side Power-Ups.
 *
 * Reordering labels works WITHOUT a key — the order is saved in Trello's
 * Power-Up storage. The key is only needed for features that write through
 * the REST API: toggling labels on cards from the picker, and creating /
 * renaming / recoloring / deleting labels from the manager.
 */
window.LM_CONFIG = {
  APP_KEY: 'f8809778c279ef05744558fd8e030db3', // <-- paste your Power-Up API key here
  APP_NAME: 'Label Manager',
};

/*
 * Serving more than one workspace from a single deployment.
 *
 * Custom Power-Up listings are scoped to one workspace, and each listing has
 * its own API key. Instead of hosting a copy of these files per workspace,
 * point each listing's iframe connector URL at the same index.html and add
 * that listing's key as ?lmKey=..., e.g.
 *
 *   https://you.example.com/index.html?lmKey=<that listing's API key>
 *
 * The key above is used when no ?lmKey is present. Whichever key applies, add
 * this deployment's origin to that key's Allowed Origins in the admin portal.
 */
/*
 * Cache busting. GitHub Pages serves static assets with `Cache-Control:
 * max-age=600`, so for ten minutes browsers reuse them WITHOUT revalidating —
 * long enough that a freshly deployed connector keeps running the old code
 * inside Trello's long-lived iframe (which shows up as
 * "PostMessageIO:UnsupportedCommand" for capabilities the old build lacked).
 *
 * BUMP THIS ON EVERY DEPLOY, and keep the ?v= values on the <script>/<link>
 * tags in the .html files in sync with it.
 */
window.LM_CONFIG.VERSION = '5';

(function () {
  var LM_KEY_PARAM = 'lmKey';
  var override = new URLSearchParams(window.location.search).get(LM_KEY_PARAM);
  if (override) window.LM_CONFIG.APP_KEY = override;

  function addParam(url, key, value) {
    return url + (url.indexOf('?') === -1 ? '?' : '&') +
      key + '=' + encodeURIComponent(value);
  }

  // Carries the key override onto the popup/modal iframes this page opens, and
  // stamps the version so a new build is never served from a stale cache.
  window.LM_CONFIG.propagate = function (url) {
    var out = addParam(url, 'v', window.LM_CONFIG.VERSION);
    return override ? addParam(out, LM_KEY_PARAM, override) : out;
  };
}());

window.LM_CONFIG.hasRest = function () {
  return typeof window.LM_CONFIG.APP_KEY === 'string' && window.LM_CONFIG.APP_KEY.length > 0;
};
