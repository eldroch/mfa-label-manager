/*
 * Unit tests for the order codec (js/order.js).
 * Run: node dev/test-order.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

global.window = global;
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'labels.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'order.js'), 'utf8'));

const ORDER = window.LM_ORDER;
let failures = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log('  ok  ' + name);
  } else {
    failures++;
    console.error('FAIL  ' + name + (detail ? ' — ' + detail : ''));
  }
}

function fakeLabel(i, name, color) {
  // Distinct 24-char hex ids with distinct 8-char suffixes.
  const id = (100000000 + i).toString(16).padStart(8, '0').repeat(3).slice(0, 24);
  return { id, name, color };
}

// 1. encode/decode round trip preserves an arbitrary order
{
  const labels = [fakeLabel(3, 'C', 'red'), fakeLabel(1, 'A', 'green'), fakeLabel(2, 'B', null)];
  const str = ORDER.encode(labels);
  const out = ORDER.applyOrder(labels.slice().reverse(), str);
  check('round trip preserves order',
    out.map(l => l.name).join() === 'C,A,B',
    'got ' + out.map(l => l.name).join());
  check('encoded string is compact', str.length < 3 * 30, 'len=' + str.length);
}

// 2. suffix collision falls back to full ids and still resolves
{
  const a = { id: 'aaaaaaaaaaaaaaaa11111111', name: 'First', color: 'red' };
  const b = { id: 'bbbbbbbbbbbbbbbb11111111', name: 'Second', color: 'blue' }; // same 8-char suffix
  const str = ORDER.encode([b, a]);
  check('collision stores full ids', str.includes(a.id) && str.includes(b.id));
  const out = ORDER.applyOrder([a, b], str);
  check('collision resolves correct order',
    out.map(l => l.name).join() === 'Second,First',
    'got ' + out.map(l => l.name).join());
}

// 3. labels missing from the stored order are appended in native order
{
  const stored = [fakeLabel(1, 'Kept', 'purple')];
  const str = ORDER.encode(stored);
  const extraA = fakeLabel(2, 'zzz', 'green');   // green sorts before purple natively
  const extraB = fakeLabel(3, 'aaa', 'green');
  const out = ORDER.applyOrder([extraA, stored[0], extraB], str);
  check('stored label first, new labels appended in native order',
    out.map(l => l.name).join() === 'Kept,aaa,zzz',
    'got ' + out.map(l => l.name).join());
}

// 3b. priority set: encode/decode, membership, and partitioning
{
  const a = fakeLabel(10, 'Bug', 'red');
  const b = fakeLabel(11, 'Docs', 'blue');
  const c = fakeLabel(12, 'Hotfix', 'red_dark');
  const str = ORDER.encodeIds([a, c]);
  const set = ORDER.decodeIds(str);
  check('priority round trip', ORDER.hasId(set, a.id) && ORDER.hasId(set, c.id));
  check('non-priority excluded', !ORDER.hasId(set, b.id));
  check('empty string decodes to empty set', ORDER.decodeIds('').size === 0);
  check('garbage decodes to empty set', ORDER.decodeIds('nope').size === 0);

  const [hi, lo] = ORDER.partition([a, b, c], set);
  check('partition keeps priority first, order preserved',
    hi.map(l => l.name).join() === 'Bug,Hotfix' && lo.map(l => l.name).join() === 'Docs',
    hi.map(l => l.name).join() + ' | ' + lo.map(l => l.name).join());

  const [hi2, lo2] = ORDER.partition([a, b, c], ORDER.decodeIds(''));
  check('no priorities: everything stays in the low group',
    hi2.length === 0 && lo2.length === 3);

  // 'priority' badge mode shows hi only; 'all' shows hi then lo.
  check('priority mode yields only starred labels', hi.length === 2);
  check('all mode preserves priority-first ordering',
    hi.concat(lo).map(l => l.name).join() === 'Bug,Hotfix,Docs');
}

// 4. saveOrder budget: 1000 labels cannot fit — encodeWithin (via saveOrder) truncates
{
  const many = [];
  for (let i = 0; i < 1000; i++) many.push(fakeLabel(i, 'L' + i, 'green'));
  let saved = null;
  const fakeT = {
    set: (s, v, k, val) => { saved = val; return Promise.resolve(); },
  };
  ORDER.saveOrder(fakeT, many).then(res => {
    check('big board: stored string within 7200 chars', saved.length <= 7200, 'len=' + saved.length);
    check('big board: kept < total and reported', res.kept < 1000 && res.kept > 500, 'kept=' + res.kept);
    const decodedCount = saved.slice(2).split(',').length;
    check('big board: decode count matches kept', decodedCount === res.kept, decodedCount + ' vs ' + res.kept);

    // 5. saveOrder falls back to the 4096-floor budget on PluginData rejection
    let second = null;
    const strictT = {
      set: (s, v, k, val) => {
        if (val.length > 3600 && !second) { return Promise.reject(new Error('PluginData length of 4096 characters exceeded')); }
        second = val;
        return Promise.resolve();
      },
    };
    return ORDER.saveOrder(strictT, many).then(res2 => {
      check('floor fallback: fits 3600', second !== null && second.length <= 3600, second && ('len=' + second.length));
      check('floor fallback: reports smaller kept', res2.kept < res.kept, res2.kept + ' vs ' + res.kept);
      console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nAll order codec tests passed.');
      process.exit(failures ? 1 : 0);
    });
  }).catch(err => {
    console.error('FAIL  unexpected rejection: ' + err.message);
    process.exit(1);
  });
}
