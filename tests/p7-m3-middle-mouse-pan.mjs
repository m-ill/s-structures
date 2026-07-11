import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/ui/indexMiddleMousePan.js', import.meta.url), 'utf8');
const listeners = new Map();
const captures = [];
const releases = [];
const canvas = {
  dataset: {},
  addEventListener(type, listener, options) {
    listeners.set(type, { listener, options });
  },
  hasPointerCapture(pointerId) {
    return captures.includes(pointerId) && !releases.includes(pointerId);
  },
  releasePointerCapture(pointerId) {
    releases.push(pointerId);
  },
  setPointerCapture(pointerId) {
    captures.push(pointerId);
  },
};
const state = {
  cam: { dist: 10, target: [1, 2, 3] },
  drag: { kind: 'legacy-pan' },
};
let drawCount = 0;

vm.runInNewContext(source, {
  document: { getElementById: (id) => (id === 'cv' ? canvas : null) },
  ST: state,
  FOCAL: 100,
  camBasis: () => ({ r: [1, 0, 0], u: [0, 1, 0] }),
  vadd: (a, b) => a.map((value, index) => value + b[index]),
  vscale: (vector, scale) => vector.map((value) => value * scale),
  draw: () => { drawCount += 1; },
});

assert.equal(canvas.dataset.middlePanDirection, 'camera-x-reversed');
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
  assert.equal(listeners.get(type).options.capture, true, `${type} must precede the legacy listener`);
  assert.equal(listeners.get(type).options.passive, false);
}

const leftDown = pointerEvent({ button: 0, pointerId: 3, clientX: 10, clientY: 10 });
listeners.get('pointerdown').listener(leftDown);
assert.equal(leftDown.stopped, false, 'left-button modeling input must remain untouched');
assert.deepEqual(state.drag, { kind: 'legacy-pan' });

const middleDown = pointerEvent({ button: 1, pointerId: 7, clientX: 100, clientY: 200 });
listeners.get('pointerdown').listener(middleDown);
assert.equal(middleDown.prevented, true);
assert.equal(middleDown.stopped, true);
assert.deepEqual(captures, [7]);
assert.equal(state.drag, null);

const middleMove = pointerEvent({ pointerId: 7, clientX: 120, clientY: 190 });
listeners.get('pointermove').listener(middleMove);
assert.deepEqual([...state.cam.target], [-1, 1, 3]);
assert.equal(drawCount, 1);
assert.equal(middleMove.stopped, true);

const unrelatedMove = pointerEvent({ pointerId: 8, clientX: 200, clientY: 200 });
listeners.get('pointermove').listener(unrelatedMove);
assert.deepEqual([...state.cam.target], [-1, 1, 3]);
assert.equal(unrelatedMove.stopped, false);

const middleUp = pointerEvent({ button: 1, pointerId: 7, clientX: 120, clientY: 190 });
listeners.get('pointerup').listener(middleUp);
assert.deepEqual(releases, [7]);
assert.equal(middleUp.stopped, true);

listeners.get('pointermove').listener(pointerEvent({ pointerId: 7, clientX: 140, clientY: 190 }));
assert.deepEqual([...state.cam.target], [-1, 1, 3], 'movement after pointerup must be ignored');
assert.equal(drawCount, 1);

console.log(JSON.stringify({
  ok: true,
  direction: canvas.dataset.middlePanDirection,
  target: state.cam.target,
  drawCount,
}, null, 2));

function pointerEvent(values) {
  return {
    button: -1,
    pointerId: 0,
    clientX: 0,
    clientY: 0,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...values,
  };
}
