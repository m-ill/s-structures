import assert from 'node:assert/strict';
import { KS_H_SECTIONS, computeSectionProperties, resolveSectionRecord } from '../src/index.js';

for (const row of KS_H_SECTIONS) {
  const computed = computeSectionProperties(row.shape, row.params);
  const resolved = resolveSectionRecord(null, `${row.id}@${row.version}`);
  assert.ok(resolved.A > 0);
  close(resolved.A, computed.A, 1e-12, `${row.id} A`);
  close(resolved.Iy, computed.Iy, 1e-12, `${row.id} Iy`);
  close(resolved.Iz, computed.Iz, 1e-12, `${row.id} Iz`);
}

console.log(JSON.stringify({ ok: true, version: 'p3-section-properties', sections: KS_H_SECTIONS.length }, null, 2));

function close(a, b, tol, label) {
  assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} != ${b}`);
}
