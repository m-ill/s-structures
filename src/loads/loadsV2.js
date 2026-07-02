export const LOADS_V2_VERSION = 'p3-m13-loads-v2-trace';

export function buildLoadsV2Trace(model = {}, basis = {}) {
  const stories = model.stories?.length ? model.stories : inferStories(model.nodes || []);
  const windBase = Number(basis.windPressure || 0.8);
  const seismicBase = Number(basis.seismicBaseShear || 100);
  return {
    version: LOADS_V2_VERSION,
    wind: stories.map((story, i) => ({ story: story.id || `S${i + 1}`, force: windBase * Number(story.height || 3), formula: 'qz*height' })),
    seismic: stories.map((story, i) => ({ story: story.id || `S${i + 1}`, force: seismicBase * (i + 1) / sumN(stories.length), formula: 'V*wi*hi/sum(wi*hi)' })),
    other: { snow: basis.snowLoad || 0, soil: basis.soilPressure || 0, water: basis.waterPressure || 0, uplift: basis.uplift || 0 },
  };
}

function inferStories(nodes) {
  return [...new Set(nodes.map((node) => Number(node.z || 0)).sort((a, b) => a - b))].map((z, i, arr) => ({ id: `S${i + 1}`, z, height: i ? z - arr[i - 1] : 0 }));
}

function sumN(n) {
  return (n * (n + 1)) / 2 || 1;
}
