export const POINT_CLOUD_STORY_DETECT_VERSION = 'p3-m9-pointcloud-story-v1';

export function detectStoryLevels(points, options = {}) {
  const tol = options.tolerance ?? 0.08;
  const sorted = [...points].sort((a, b) => a.z - b.z);
  const clusters = [];
  for (const p of sorted) {
    const last = clusters.at(-1);
    if (!last || Math.abs(last.z - p.z) > tol) clusters.push({ z: p.z, count: 1 });
    else { last.z = (last.z * last.count + p.z) / (last.count + 1); last.count += 1; }
  }
  const minPoints = options.minPoints ?? Math.max(2, Math.ceil(Math.max(...clusters.map((c) => c.count), 0) * 0.4));
  return clusters
    .filter((c, i) => c.count >= minPoints || i === 0 || i === clusters.length - 1)
    .map((c, i) => ({ id: `S${i}`, z: round(c.z), confidence: Math.min(1, c.count / (options.strongCount ?? 12)) }));
}

function round(value) { return Math.round(value * 1000) / 1000; }
