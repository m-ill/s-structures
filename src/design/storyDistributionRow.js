import { distributePlanForce } from './eccentricDistributionMath.js';
import { torsionMz } from './torsionMoment.js';

export function distributionRow(force, stories, nodes) {
  const story = stories.find((row) => row.story === Number(force.story) || row.storyId === force.storyId);
  if (!story) return null;
  const storyNodes = story.nodeIds.map((id) => nodes[id]).filter(Boolean);
  const totalForce = Number(force.force ?? force.P ?? 0);
  const dir = force.dir || '+x';
  return {
    story: story.story,
    storyId: story.storyId,
    caseId: force.caseId || force.case || null,
    dir,
    totalForce,
    massCenter: story.massCenter,
    diaphragmCenter: story.diaphragmCenter,
    eccentricity: story.eccentricity.massToDiaphragm,
    torsionMz: torsionMz(totalForce, dir, story.eccentricity.massToDiaphragm),
    nodeForces: distributePlanForce(storyNodes, { mass: story.massCenter, diaphragm: story.diaphragmCenter }, totalForce, dir),
  };
}
