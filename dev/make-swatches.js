/*
 * Generates icons/swatches/<color>.svg — one small square per label color.
 *
 * Card badges only accept 10 base color names (no subtle/bold variants), so
 * the badge itself cannot show a label's true color. Instead each badge gets
 * an icon in the exact palette color, which keeps the card front honest.
 *
 * Run: node dev/make-swatches.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

global.window = global;
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'labels.js'), 'utf8'));
const LABELS = window.LM_LABELS;

const outDir = path.join(__dirname, '..', 'icons', 'swatches');
fs.mkdirSync(outDir, { recursive: true });

function svg(fill) {
  // Badge icons render small; a filled rounded square with a faint border
  // stays legible against both light and dark card backgrounds.
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16">' +
    '<rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="' + fill + '" ' +
    'stroke="rgba(9,30,66,0.20)" stroke-width="1"/></svg>\n';
}

const colors = LABELS.COLOR_ORDER.slice();
let count = 0;
colors.forEach((c) => {
  fs.writeFileSync(path.join(outDir, c + '.svg'), svg(LABELS.colorInfo(c).bg));
  count++;
});
// Colorless labels get the neutral swatch.
fs.writeFileSync(path.join(outDir, 'none.svg'), svg(LABELS.colorInfo(null).bg));
count++;

console.log('wrote ' + count + ' swatches to icons/swatches/');
