import assert from 'node:assert/strict';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { buildImportCandidate } from '../src/import/candidate.js';
import { summarizeImportEntry } from '../src/app/importReviewModel.js';
import { buildImportReviewOverlay, IMPORT_REVIEW_OVERLAY_VERSION } from '../src/app/importReviewOverlay.js';
import { mountImportReviewView } from '../src/app/views/importReview.js';

const candidate = buildImportCandidate({
  source: { type: 'dxf', fileId: 'overlay-plan' },
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0 }, { id: 'N2', x: 4, y: 0, z: 0 }],
  members: [{ id: 'B1', kind: 'beam', from: 'N1', to: 'N2', confidence: 0.85 }],
});
const summary = summarizeImportEntry({ id: 'job-overlay', status: 'pending', candidate });
const overlayState = buildImportReviewOverlay(summary, { selectedId: 'B1' });

assert.equal(overlayState.version, IMPORT_REVIEW_OVERLAY_VERSION);
assert.equal(overlayState.modelLayer.nodes.length, 2);
assert.equal(overlayState.modelLayer.members.length, 1);
assert.equal(overlayState.picking.count, 3);
assert.deepEqual(overlayState.selected, { type: 'member', id: 'B1' });

const document = createFakeIndexDocument();
const container = document.createElement('div');
document.body.appendChild(container);
const api = {
  async get() {
    return { import: { id: 'job-overlay', status: 'pending', candidate } };
  },
  async patch(_path, { body }) {
    return { import: { id: 'job-overlay', status: body.status, candidate, resolvedCandidate: body.resolvedCandidate } };
  },
};

const view = mountImportReviewView(container, {
  document,
  api,
  params: { projectId: 'project-overlay', jobId: 'job-overlay' },
});
await view.refresh();

const overlay = container.querySelector('[data-role="import-overlay"]');
assert.equal(overlay.getAttribute('data-overlay-version'), IMPORT_REVIEW_OVERLAY_VERSION);
assert.equal(overlay.getAttribute('data-overlay-node-count'), '2');
assert.equal(overlay.getAttribute('data-overlay-member-count'), '1');
assert.equal(overlay.getAttribute('data-overlay-pick-count'), '3');
assert.equal(container.querySelectorAll('[data-role="import-overlay-item"]').length, 3);

view.selectOverlayEntity('B1');
assert.equal(container.querySelector('[data-entity-id="B1"]').getAttribute('data-selected'), 'true');
assert.match(container.querySelector('[data-role="audit"]').textContent, /"selected"/);

console.log(JSON.stringify({ ok: true, version: 'p4-import-review-overlay' }, null, 2));
