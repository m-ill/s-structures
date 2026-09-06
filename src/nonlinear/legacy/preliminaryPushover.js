import { runPushover } from '../pushover.js';

export const LEGACY_PRELIMINARY_PUSHOVER_ADAPTER_VERSION = 'p8-m0-legacy-pushover-adapter-v1';

export function runLegacyPreliminaryPushover(model, settings = {}) {
  return runPushover(model, {
    ...settings,
    requestedControl: settings.requestedControl || settings.control || 'load-factor',
    control: 'load-factor',
  });
}
