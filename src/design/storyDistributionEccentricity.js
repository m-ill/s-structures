import { accidentalEccentricity } from './accidentalEccentricity.js';
import { combineEccentricity } from './combineEccentricity.js';

export function storyDistributionEccentricity(nodes, story, dir, force) {
  const base = story.eccentricity?.massToDiaphragm || {};
  const accidental = accidentalEccentricity(nodes, dir, force.basis || {}, force.options || {});
  return {
    base,
    accidental,
    effective: combineEccentricity(base, accidental),
  };
}
