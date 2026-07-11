import assert from 'node:assert/strict';
import { clampFloatingRect, dockFloatingRect, snapFloatingRectToPeers } from '../src/ui/floatingPanel.js';
import {
  createWorkspaceState,
  loadWorkspaceState,
  resetWorkspaceState,
  saveWorkspaceState,
  switchWorkspacePreset,
  updateWorkspacePanel,
} from '../src/ui/workspaceState.js';

const tiny = clampFloatingRect(
  { left: 500, top: 500, width: 480, height: 400 },
  { left: 8, top: 8, width: 180, height: 120 },
  { minWidth: 240, minHeight: 160 },
);
assert.deepEqual(tiny, { left: 8, top: 8, width: 180, height: 120 });

const snapped = snapFloatingRectToPeers(
  { left: 311, top: 102, width: 180, height: 160 },
  [{ left: 100, top: 100, width: 200, height: 160 }],
  { left: 0, top: 0, width: 1000, height: 700 },
  { snapThreshold: 18, minWidth: 100, minHeight: 100 },
);
assert.equal(snapped.left, 300);
assert.equal(snapped.top, 100);

const docked = dockFloatingRect({ left: 0, top: 0, width: 1000, height: 700 }, 'right', { dockRatio: 0.3 });
assert.equal(docked.left, 700);
assert.equal(docked.width, 300);
assert.equal(docked.height, 700);

let state = createWorkspaceState({ preset: 'modeling', activeCaseId: 'AC1' });
state = updateWorkspacePanel(state, 'properties', { mode: 'docked', dock: 'right', visible: true, order: 2 });
assert.equal(state.panels.properties.dock, 'right');
state = switchWorkspacePreset(state, 'analysis');
assert.deepEqual(state.visiblePanels, ['analysis-center', 'results']);
assert.equal(state.activeCaseId, 'AC1');

const memory = new Map();
const storage = { setItem: (key, value) => memory.set(key, value), getItem: (key) => memory.get(key) };
assert.equal(saveWorkspaceState(storage, 'workspace', state), true);
assert.deepEqual(loadWorkspaceState(storage, 'workspace'), state);
assert.equal(resetWorkspaceState('loads').preset, 'loads');

console.log(JSON.stringify({ ok: true, tiny, snapped, docked, preset: state.preset }, null, 2));
