import {
  createPhase7WorkspaceController,
  PHASE7_WORKSPACE_CONTROLLER_VERSION,
} from './phase7WorkspaceController.js';

export const INDEX_FLOATING_PANELS_VERSION = 'p5-floating-panels';

export function installIndexFloatingPanels(target = globalThis, options = {}) {
  const doc = target?.document;
  if (!doc?.getElementById) return null;
  if (target.SStructuresFloatingPanels) {
    target.SStructuresFloatingPanels.refresh?.();
    return target.SStructuresFloatingPanels;
  }
  const controller = createPhase7WorkspaceController(target, options);
  if (!controller) return null;
  const controllerGetState = controller.getState.bind(controller);
  controller.version = INDEX_FLOATING_PANELS_VERSION;
  controller.workspaceVersion = PHASE7_WORKSPACE_CONTROLLER_VERSION;
  controller.getState = () => {
    const state = controllerGetState();
    const propertyPanel = state.panels.properties || {
      available: !!doc.getElementById?.('propPanel'),
      floating: doc.getElementById?.('propPanel')?.getAttribute?.('data-ss-floating-panel') === '1',
    };
    return { ...state, version: INDEX_FLOATING_PANELS_VERSION, propertyPanel };
  };
  target.SStructuresFloatingPanels = controller;
  controller.refresh();
  return controller;
}
