import { finite, traceStatus } from './advancedTraceUtils.js';

export function buildModalTrace(analysis) {
  const dynamics = analysis?.dynamics || null;
  const modes = (dynamics?.modes || []).map((mode) => ({
    id: mode.id,
    period: mode.period,
    frequencyHz: mode.frequencyHz,
    massX: finite(mode.participation?.x?.massRatio),
    massY: finite(mode.participation?.y?.massRatio),
    massZ: finite(mode.participation?.z?.massRatio),
  }));
  return {
    enabled: !!dynamics,
    status: traceStatus(!!dynamics, !!dynamics?.ok),
    method: dynamics?.type || 'modal_lumped_mass',
    mass: dynamics?.mass || null,
    modes,
    summary: {
      modeCount: modes.length,
      firstPeriod: modes[0]?.period || null,
      maxMassX: Math.max(0, ...modes.map((mode) => mode.massX)),
      maxMassY: Math.max(0, ...modes.map((mode) => mode.massY)),
    },
  };
}
