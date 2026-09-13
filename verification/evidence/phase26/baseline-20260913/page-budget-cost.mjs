// Phase26 M1 — cost of the drawing page budget.
//
// buildDetailDrawings defaults to maxPages=60 while every product caller
// already passes 600 (drawingWorker, pdfVolumeBundle). This measures the full
// 600-page budget on the largest synthetic snapshot in the suite so the default
// change is backed by numbers rather than assumption.
//
//   node verification/evidence/phase26/baseline-20260913/page-budget-cost.mjs [--write]

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModel } from '../../../../src/core/model.js';
import { stagePracticalDesignInput } from '../../../../src/modeling/practicalDesignInputs.js';
import { buildDetailDrawings } from '../../../../src/report/phase24/detailDrawings.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function snapshot() {
  const model = createModel();
  model.nodes = [{ id: 'A', x: 0, y: 0, z: 0 }, { id: 'B', x: 4, y: 0, z: 0 }];
  model.members = [{ id: 'M', n1: 'A', n2: 'B', type: 'frame', matId: 'concrete', secId: 'S@1' }];
  stagePracticalDesignInput(model, {
    type: 'section-record', id: 'S', name: 'synthetic', version: 1,
    shape: 'RECT', B: 2000, H: 2000, dimensionUnit: 'mm', sourceNote: 'pagination only',
  }, []);
  model.designDetails = {
    reinforcement: [{
      id: 'R', version: 1, memberId: 'M', start: 0, end: 1, cover: 0.04,
      bars: Array.from({ length: 52 }, (_, i) => ({
        y: -0.7 + Math.floor(i / 13) * 0.45,
        z: -0.84 + (i % 13) * 0.14,
        diameter: 0.012,
        area: Math.PI * 0.012 ** 2 / 4,
      })),
    }],
    splices: [{
      id: 'SP', version: 1, memberId: 'M', reinforcementId: 'R@1',
      barIndices: Array.from({ length: 52 }, (_, i) => String(i + 1)),
      start: 0.2, end: 0.6, offsetY: 0.02, offsetZ: 0, spliceType: 'tension-B',
    }],
  };
  return {
    id: 'PAGE-BUDGET-COST',
    inputHash: 'a'.repeat(64),
    model,
    sets: [],
    checks: [{
      entityId: 'M', checkId: 'rc-splices', comboId: 'SYNTHETIC-U', status: 'NG',
      reason: 'SYNTHETIC_REPORT_VALUES_ONLY',
      checks: Array.from({ length: 52 }, (_, i) => ({
        spliceId: 'SP', barIndex: i + 1,
        requiredLength: i === 51 ? 2 : 1.5, providedLength: 1.6,
        ratio: i === 51 ? 1.25 : 0.9375, status: i === 51 ? 'NG' : 'OK',
        units: { length: 'm' },
      })),
    }],
  };
}

function measure(label, options) {
  const input = snapshot();
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  const started = performance.now();
  let pages = null;
  let error = null;
  try {
    pages = buildDetailDrawings(input, options).pages.length;
  } catch (caught) {
    error = caught.message;
  }
  const elapsedMs = Number((performance.now() - started).toFixed(1));
  const heapDeltaMb = Number(((process.memoryUsage().heapUsed - before) / 1024 / 1024).toFixed(2));
  return { label, options, pages, error, elapsedMs, heapDeltaMb };
}

const rows = [
  measure('default-before (maxPages=60)', {}),
  measure('product-worker budget (maxPages=600)', { maxPages: 600 }),
  measure('volume window (maxPages=600, 60-page window)', { maxPages: 600, pageOffset: 0, pageLimit: 60 }),
  measure('reference-retention (maxPages=600)', { maxPages: 600, checkRetention: 'reference' }),
];

const report = {
  version: 'p26-m1-page-budget-cost-v1',
  capturedAt: '2026-09-13',
  note: 'Synthetic pagination snapshot. The retained page window, not the budget ceiling, governs memory.',
  rows,
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes('--write')) {
  const file = path.join(HERE, 'page-budget-cost.json');
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`recorded ${file}`);
}
