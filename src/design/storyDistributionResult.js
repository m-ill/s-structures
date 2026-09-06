import { distributePlanForce } from './eccentricDistributionMath.js';
import { torsionMz } from './torsionMoment.js';

export function buildStoryDistributionResult(story, nodes, totalForce, dir, ecc, force) {
  return {
    story: story.story,
    storyId: story.storyId,
    caseId: force.caseId || force.case || null,
    dir,
    totalForce,
    massCenter: story.massCenter,
    diaphragmCenter: story.diaphragmCenter,
    baseEccentricity: ecc.base,
    accidentalEccentricity: ecc.accidental,
    eccentricity: ecc.effective,
    torsionMz: torsionMz(totalForce, dir, ecc.effective),
    nodeForces: distributePlanForce(nodes, {
      mass: story.massCenter,
      diaphragm: story.diaphragmCenter,
      eccentricity: ecc.effective,
    }, totalForce, dir),
  };
}
