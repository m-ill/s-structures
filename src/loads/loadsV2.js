export const LOADS_V2_VERSION = 'p3-m13-loads-v2-trace';

export function buildLoadsV2Trace(model = {}, basis = {}) {
  const stories = model.stories?.length ? model.stories : inferStories(model.nodes || []);
  const windBase = Number(basis.windPressure || 0.8);
  const seismicBase = Number(basis.seismicBaseShear || 100);
  const seismicRows = distributeSeismic(stories, seismicBase);
  return {
    version: LOADS_V2_VERSION,
    wind: stories.map((story, i) => ({ story: story.id || `S${i + 1}`, force: windBase * Number(story.height || 3), formula: 'qz*height' })),
    seismic: seismicRows,
    other: { snow: basis.snowLoad || 0, soil: basis.soilPressure || 0, water: basis.waterPressure || 0, uplift: basis.uplift || 0 },
  };
}

function inferStories(nodes) {
  return [...new Set(nodes.map((node) => Number(node.z || 0)).sort((a, b) => a - b))].map((z, i, arr) => ({ id: `S${i + 1}`, z, height: i ? z - arr[i - 1] : 0 }));
}

function distributeSeismic(stories, baseShear) {
  const rows = stories.map((story, i) => {
    const height = finite(story.z ?? story.elevation ?? story.height, i + 1);
    const weight = finite(story.seismicWeight ?? story.weight ?? story.mass, 1);
    const wh = height > 0 && weight > 0 ? weight * height : 0;
    return { story: story.id || `S${i + 1}`, height, weight, wh };
  });
  const denominator = rows.reduce((sum, row) => sum + row.wh, 0) || 1;
  return rows.map((row) => ({
    story: row.story,
    force: row.wh > 0 ? baseShear * row.wh / denominator : 0,
    formula: 'V*wi*hi/sum(wi*hi)',
    weight: row.weight,
    height: row.height,
  }));
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
