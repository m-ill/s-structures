import { forceAxis, round6, signedDir, signedForce } from './forceDirection.js';

export function uniformStoryDistribution(nodes, totalForce, dir, derivation = {}) {
  const total = signedForce(totalForce, dir);
  const axis = forceAxis(dir);
  const share = nodes.length ? total / nodes.length : 0;
  return {
    story: derivation.story || null,
    storyId: derivation.storyId || null,
    dir,
    totalForce,
    torsionMz: 0,
    method: 'uniform',
    nodeForces: nodes.map((node) => ({
      nodeId: node.id,
      P: round6(share),
      dir: signedDir(total, axis),
    })),
  };
}
