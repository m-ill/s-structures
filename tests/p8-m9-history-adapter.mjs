import assert from 'node:assert/strict';
import {
  buildCanonicalAnalysisDomain,
  buildMdofMassDomain,
  recoverNonlinearHistoryEnvelope,
} from '../src/index.js';

const model = {
  nodes: [
    { id: 'B', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'T', x: 0, y: 0, z: 3, mass: [2, 2, 2] },
  ],
  members: [{
    id: 'C', type: 'frame', behavior: 'frame', n1: 'B', n2: 'T', matId: 'MAT', secId: 'SEC',
    localAxis: { refVector: [1, 0, 0], roll: 0, strongAxis: 'z' },
  }],
  materials: [{ id: 'MAT', E: 2e8, G: 8e7, density: 0 }],
  sections: [{ id: 'SEC', A: 0.03, Iy: 2e-4, Iz: 2e-4, J: 5e-5 }],
  loads: [],
  analysisSettings: { includeSelfWeight: false },
};
const domain = buildCanonicalAnalysisDomain(model);
assert.equal(domain.constraint.reducedDofCount, 6);
const massDomain = buildMdofMassDomain(model, domain);

const rows = [
  historyRow(0, 0, 0, 'elastic'),
  historyRow(1, 0.1, 0.01, 'yielded'),
  historyRow(2, 0.2, -0.015, 'capping'),
];
const history = {
  version: 'test-history-v1',
  manifestHash: 'TEST-HISTORY-HASH',
  outputStepCount: rows.length,
  retainedChunks: [{ rows }],
  envelopes: {},
};
const envelope = recoverNonlinearHistoryEnvelope({ domain, history, massDomain });
assert.equal(envelope.outputStepCount, 3);
assert.equal(envelope.complete, true);
assert.equal(envelope.nodes.T[0].absoluteMaximum, 0.015);
assert.equal(envelope.nodes.T[0].absoluteMaximumTime, 0.2);
assert.equal(envelope.members.C.localResistingForce[0].absoluteMaximum, 15);
assert.equal(envelope.members.C.hinges['C:i:z'].state, 'capping');
assert.equal(envelope.members.C.hinges['C:i:z'].stateOutputStep, 2);
assert.equal(envelope.stories.ST1.responseSource, 'absolute-inertia-above-story');
assert.equal(envelope.stories.ST1.shear[0].absoluteMaximum, 4);
assert.ok(envelope.eventProvenance.some((row) => row.state === 'yielded'));
assert.ok(envelope.eventProvenance.some((row) => row.state === 'capping'));

console.log(JSON.stringify({
  ok: true,
  verificationIds: ['NL-INT-15'],
  envelopeHash: envelope.envelopeHash,
  nodePeak: envelope.nodes.T[0],
  memberPeakForce: envelope.members.C.localResistingForce[0],
  finalHingeState: envelope.members.C.hinges['C:i:z'].state,
  eventCount: envelope.eventProvenance.length,
  storyShearPeak: envelope.stories.ST1.shear[0],
  complete: envelope.complete,
}, null, 2));

function historyRow(outputStep, time, displacement, state) {
  return {
    outputStep,
    time,
    q: [displacement, 0, 0, 0, 0, 0],
    a: [outputStep, 0, 0, 0, 0, 0],
    groundAcceleration: [0, 0, 0],
    elements: {
      C: {
        localResistingForce: [-displacement * 1000, 0, 0, 0, 0, 0, displacement * 1000, 0, 0, 0, 0, 0],
        hinges: [{
          id: 'C:i:z', end: 'i', axis: 'z', state,
          rotation: displacement / 3,
          moment: displacement * 100,
        }],
        distributedFiber: null,
      },
    },
  };
}
