export const POINT_CLOUD_LAYER_VERSION = 'p3-m8-pointcloud-layer-v1';

export function buildPointCloudLayerData(points, options = {}) {
  const zMin = options.zMin ?? -Infinity;
  const zMax = options.zMax ?? Infinity;
  const selected = points.filter((p) => p.z >= zMin && p.z <= zMax);
  const positions = new Float32Array(selected.length * 3);
  const colors = new Uint8Array(selected.length * 3);
  selected.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    const color = p.color || confidenceColor(p.confidence ?? 0.5);
    colors.set(color.map((v) => Math.max(0, Math.min(255, Math.round(v)))), i * 3);
  });
  return {
    version: POINT_CLOUD_LAYER_VERSION,
    count: selected.length,
    positions,
    colors,
    metadata: {
      inputCount: points.length,
      filteredCount: selected.length,
      positionType: 'Float32Array',
      colorType: 'Uint8Array',
      positionBytes: positions.byteLength,
      colorBytes: colors.byteLength,
      zFilter: {
        min: Number.isFinite(zMin) ? zMin : null,
        max: Number.isFinite(zMax) ? zMax : null,
      },
    },
  };
}

function confidenceColor(confidence) {
  return confidence >= 0.8 ? [30, 160, 90] : confidence >= 0.5 ? [230, 170, 40] : [210, 70, 70];
}
