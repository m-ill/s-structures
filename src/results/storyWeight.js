import { factorFor, finite } from './resultUtils.js';

export function storyWeight(model, story, factors = {}) {
  const row = (model?.loadEstimation?.storyLoads?.gravity || [])
    .find((item) => item.story === story);
  if (!row) return 0;
  const dead = finite(row.deadTotal) * factorFor(factors, 'D');
  const live = finite(row.liveTotal) * factorFor(factors, 'L');
  return Math.abs(dead + live);
}
