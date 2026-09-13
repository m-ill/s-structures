// Phase26 M2 — is the archived Phase20 numeric baseline stale in value, or only
// in shape?
//
// p20-m3 freezes the Phase20 elastic results and compares them exactly. The
// comparison now fails, and the question that decides how to fix it is whether
// the keys that existed in Phase20 still hold the same numbers, or whether the
// solver drifted. This walks both trees and separates the two.
//
//   node verification/evidence/phase26/baseline-20260913/p20-numeric-drift.mjs [--write]

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as facade from '../../../../src/solver/linear3d.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const contracts = read('verification/specs/phase20/contracts.json');
const excluded = new Set(contracts.numericalComparison.executionOnlyKeys);
const fixtures = read('verification/evidence/phase20/m0/fixtures.json');
const archived = read('verification/evidence/phase20/m0/elastic-results.json');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !excluded.has(key))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

const addedKeys = new Set();
const removedKeys = new Set();
const valueDrift = [];

function compare(live, archivedValue, at) {
  if (Array.isArray(live) || Array.isArray(archivedValue)) {
    if (!Array.isArray(live) || !Array.isArray(archivedValue) || live.length !== archivedValue.length) {
      valueDrift.push({ at, live: describe(live), archived: describe(archivedValue) });
      return;
    }
    live.forEach((item, index) => compare(item, archivedValue[index], `${at}[${index}]`));
    return;
  }
  if (live && archivedValue && typeof live === 'object' && typeof archivedValue === 'object') {
    for (const key of Object.keys(live)) if (!(key in archivedValue)) addedKeys.add(`${at}.${key}`);
    for (const key of Object.keys(archivedValue)) if (!(key in live)) removedKeys.add(`${at}.${key}`);
    for (const key of Object.keys(archivedValue)) {
      if (key in live) compare(live[key], archivedValue[key], `${at}.${key}`);
    }
    return;
  }
  if (live !== archivedValue) valueDrift.push({ at, live: describe(live), archived: describe(archivedValue) });
}

const describe = (value) => (typeof value === 'object' && value !== null
  ? (Array.isArray(value) ? `array(${value.length})` : 'object')
  : value);

for (const [index, fixture] of fixtures.entries()) {
  const live = canonical(JSON.parse(JSON.stringify(facade.analyzeModel(fixture.model))));
  compare(live, canonical(archived[index].result), `${fixture.name}$`);
}

const report = {
  version: 'p26-m2-p20-numeric-drift-v1',
  capturedAt: '2026-09-13',
  fixtures: fixtures.length,
  addedKeyCount: addedKeys.size,
  removedKeyCount: removedKeys.size,
  valueDriftCount: valueDrift.length,
  addedLeafNames: [...new Set([...addedKeys].map((key) => key.split('.').pop().replace(/\[\d+\]$/, '')))].sort(),
  addedKeySample: [...addedKeys].sort().slice(0, 20),
  removedKeys: [...removedKeys].sort(),
  valueDrift: valueDrift.slice(0, 40),
  verdict: valueDrift.length === 0 && removedKeys.size === 0
    ? 'SHAPE_ONLY — every key archived in Phase20 still holds the identical value'
    : 'VALUE_DRIFT — archived values changed; do not re-archive without investigation',
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--write')) {
  const file = path.join(HERE, 'p20-numeric-drift.json');
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`recorded ${file}`);
}
