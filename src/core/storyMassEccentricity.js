import { round6 } from './storyMassValues.js';

export function storyEccentricity(mass, diaphragm, stiffness) {
  return {
    massToDiaphragm: offset(mass, diaphragm),
    massToStiffness: offset(mass, stiffness),
  };
}

function offset(from, to) {
  const value = (key) => (from?.[key] == null || to?.[key] == null ? null : round6(from[key] - to[key]));
  return { x: value('x'), y: value('y') };
}
