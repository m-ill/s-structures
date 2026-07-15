import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePhase9M2Evidence, validatePhase9M2Manifest } from '../src/compute/governance/phase9M2.js';

const evidence = JSON.parse(await readFile('reports/validation-evidence/phase9/p9-m2-cpu-wasm.json', 'utf8'));
const manifest = JSON.parse(await readFile('docs/verification/phase9/release-manifest.json', 'utf8'));
assert.deepEqual(validatePhase9M2Evidence(evidence), { ok: true, errors: [] });
assert.deepEqual(validatePhase9M2Manifest(manifest), { ok: true, errors: [] });
console.log('P9-M2 evidence/manifest contract: PASS');
