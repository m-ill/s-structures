import assert from 'node:assert/strict';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { createFakeWindow } from './helpers/fakeAppWindow.mjs';
import { createAppShell } from '../src/app/shell.js';

const document = createFakeIndexDocument();
const window = createFakeWindow();
const mountPoint = document.createElement('div');
document.body.appendChild(mountPoint);

const listeners = new Set();
let currentProjectId = null;
let setCount = 0;
const session = {
  getState() {
    return {
      authenticated: true,
      user: { email: 'route@example.com' },
      currentProjectId,
    };
  },
  onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setCurrentProject(projectId) {
    const next = projectId || null;
    if (next !== currentProjectId) {
      setCount += 1;
      currentProjectId = next;
      for (const listener of listeners) listener(this.getState());
    }
    return this.getState();
  },
};

const shell = createAppShell({
  window,
  document,
  api: {},
  session,
  mountPoint,
  modelerBridgeFactory: () => ({ getModel: async () => ({}), dispose() {} }),
});

window.location.hash = '#/p/reentry-model/modeler';
shell.start();

await Promise.resolve();
await Promise.resolve();

assert.equal(setCount, 1);
assert.equal(currentProjectId, 'reentry-model');
assert.equal(mountPoint.querySelectorAll('[data-view="modeler-host"]').length, 1);
assert.equal(mountPoint.querySelectorAll('[data-role="modeler-frame"]').length, 1);
assert.deepEqual(shell.getRoutingState(), {
  routing: false,
  reroutePending: false,
  rerouteScheduled: false,
});

console.log(JSON.stringify({ ok: true, version: 'p4-shell-route-reentry' }, null, 2));
