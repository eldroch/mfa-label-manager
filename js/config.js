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

window.LM_CONFIG.hasRest = function () {
  return typeof window.LM_CONFIG.APP_KEY === 'string' && window.LM_CONFIG.APP_KEY.length > 0;
};
