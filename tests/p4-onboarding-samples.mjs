import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const rows = [
  ['samples/onboarding/office-frame-sample.json', 'T1-drawing-to-calculation'],
  ['samples/onboarding/pointcloud-frame-sample.json', 'T2-pointcloud-to-model'],
  ['samples/onboarding/steel-plant-sample.json', 'T3-pushover-review'],
];

for (const [file, tutorial] of rows) {
  assert.ok((await stat(file)).isFile(), file);
  const sample = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(sample.version, 'p4-onboarding-sample-v1');
  assert.equal(sample.tutorial, tutorial);
  assert.ok(sample.expected && typeof sample.expected === 'object');
  assert.ok((await stat(`docs/user-manual/tutorials/${tutorial}.md`)).isFile());
}

console.log(JSON.stringify({ ok: true, version: 'p4-onboarding-samples', samples: rows.length }, null, 2));
