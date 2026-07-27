/*
 * Label palette + native-order helpers.
 *
 * Trello's current label palette is 10 hues x 3 shades (subtle / normal /
 * bold) plus "no color". The REST API encodes shades as `<hue>_light`
 * (subtle), `<hue>` (normal) and `<hue>_dark` (bold).
 *
 * NATIVE_HUE_ORDER / shade order define how Trello itself sorts labels in
 * its own UI (label picker, card chips): fixed color order first, then by
 * name. Users cannot change that order natively — which is the whole reason
 * this Power-Up exists. We reproduce it so "reset to Trello order" and the
 * placement of not-yet-ordered labels match what users see natively.
 */
(function () {
  'use strict';

  var NATIVE_HUE_ORDER = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'];
  var SHADE_SUFFIX_ORDER = ['_light', '', '_dark']; // subtle, normal, bold

  // Approximate hex values of Trello's current (Atlassian Design System) label
  // palette: [background, text] pairs chosen for readable chips.
  var PALETTE = {
    green_light:  { bg: '#BAF3DB', fg: '#164B35', name: 'subtle green' },
    green:        { bg: '#4BCE97', fg: '#164B35', name: 'green' },
    green_dark:   { bg: '#1F845A', fg: '#FFFFFF', name: 'bold green' },
    yellow_light: { bg: '#F8E6A0', fg: '#533F04', name: 'subtle yellow' },
    yellow:       { bg: '#F5CD47', fg: '#533F04', name: 'yellow' },
    yellow_dark:  { bg: '#946F00', fg: '#FFFFFF', name: 'bold yellow' },
    orange_light: { bg: '#FFE2BD', fg: '#5F3811', name: 'subtle orange' },
    orange:       { bg: '#FAA53D', fg: '#5F3811', name: 'orange' },
    orange_dark:  { bg: '#B65C02', fg: '#FFFFFF', name: 'bold orange' },
    red_light:    { bg: '#FFD2CC', fg: '#601E16', name: 'subtle red' },
    red:          { bg: '#F87462', fg: '#601E16', name: 'red' },
    red_dark:     { bg: '#CA3521', fg: '#FFFFFF', name: 'bold red' },
    purple_light: { bg: '#DFD8FD', fg: '#352C63', name: 'subtle purple' },
    purple:       { bg: '#9F8FEF', fg: '#352C63', name: 'purple' },
    purple_dark:  { bg: '#6E5DC6', fg: '#FFFFFF', name: 'bold purple' },
    blue_light:   { bg: '#CCE0FF', fg: '#09326C', name: 'subtle blue' },
    blue:         { bg: '#579DFF', fg: '#09326C', name: 'blue' },
    blue_dark:    { bg: '#0C66E4', fg: '#FFFFFF', name: 'bold blue' },
    sky_light:    { bg: '#C6EDFB', fg: '#164555', name: 'subtle sky' },
    sky:          { bg: '#6CC3E0', fg: '#164555', name: 'sky' },
    sky_dark:     { bg: '#227D9B', fg: '#FFFFFF', name: 'bold sky' },
    lime_light:   { bg: '#D3F1A7', fg: '#37471F', name: 'subtle lime' },
    lime:         { bg: '#94C748', fg: '#37471F', name: 'lime' },
    lime_dark:    { bg: '#5B7F24', fg: '#FFFFFF', name: 'bold lime' },
    pink_light:   { bg: '#FDD0EC', fg: '#50253F', name: 'subtle pink' },
    pink:         { bg: '#E774BB', fg: '#50253F', name: 'pink' },
    pink_dark:    { bg: '#AE4787', fg: '#FFFFFF', name: 'bold pink' },
    black_light:  { bg: '#DCDFE4', fg: '#091E42', name: 'subtle black' },
    black:        { bg: '#8590A2', fg: '#091E42', name: 'black' },
    black_dark:   { bg: '#626F86', fg: '#FFFFFF', name: 'bold black' },
  };

  var NO_COLOR = { bg: '#E4E6EA', fg: '#44546F', name: 'no color' };

  // Full color list in Trello's native picker order (hue-major, subtle→bold),
  // used by the color chooser grid and the native comparator.
  var COLOR_ORDER = [];
  NATIVE_HUE_ORDER.forEach(function (hue) {
    SHADE_SUFFIX_ORDER.forEach(function (suffix) {
      COLOR_ORDER.push(hue + suffix);
    });
  });

  var COLOR_RANK = {};
  COLOR_ORDER.forEach(function (c, i) { COLOR_RANK[c] = i; });

  function colorInfo(color) {
    if (!color) return NO_COLOR;
    return PALETTE[color] || NO_COLOR;
  }

  function colorRank(color) {
    if (!color) return COLOR_ORDER.length; // colorless labels sort last natively
    var rank = COLOR_RANK[color];
    return typeof rank === 'number' ? rank : COLOR_ORDER.length;
  }

  // Trello's own ordering: fixed color order, then case-insensitive name,
  // then id as a stable tiebreaker.
  function nativeCompare(a, b) {
    var d = colorRank(a.color) - colorRank(b.color);
    if (d !== 0) return d;
    var an = (a.name || '').toLowerCase();
    var bn = (b.name || '').toLowerCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  window.LM_LABELS = {
    COLOR_ORDER: COLOR_ORDER,
    HUES: NATIVE_HUE_ORDER,
    SHADES: SHADE_SUFFIX_ORDER,
    colorInfo: colorInfo,
    colorRank: colorRank,
    nativeCompare: nativeCompare,
  };
})();
