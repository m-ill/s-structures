export const POINT_CLOUD_LOADER_VERSION = 'p3-m8-pointcloud-loader-v1';

export function parsePointCloudText(text, options = {}) {
  return parsePointCloudWithAudit(text, options).points;
}

export function parsePointCloudWithAudit(text, options = {}) {
  const format = (options.format || detectFormat(text)).toLowerCase();
  let points = null;
  if (format === 'xyz' || format === 'txt') points = parseXyz(text);
  else if (format === 'ply') points = parsePlyAscii(text);
  else if (format === 'pcd') points = parsePcdAscii(text);
  else throw new Error(`Unsupported point cloud format: ${format}`);
  const dataLineCount = countDataLines(text, format);
  return {
    version: POINT_CLOUD_LOADER_VERSION,
    format,
    points,
    audit: {
      loaderVersion: POINT_CLOUD_LOADER_VERSION,
      format,
      lineCount: String(text || '').split(/\r?\n/).length,
      dataLineCount,
      parsedCount: points.length,
      rejectedCount: Math.max(0, dataLineCount - points.length),
      colorCount: points.filter((point) => point.color).length,
    },
  };
}

export function detectFormat(text) {
  const head = String(text || '').trimStart().slice(0, 128).toLowerCase();
  if (head.startsWith('ply')) return 'ply';
  if (head.includes('.pcd') || (head.includes('fields') && head.includes('points'))) return 'pcd';
  return 'xyz';
}

function parseXyz(text) {
  return rows(text).map(partsToPoint).filter(Boolean);
}

function parsePlyAscii(text) {
  const lines = String(text).split(/\r?\n/);
  const end = lines.findIndex((line) => line.trim() === 'end_header');
  const count = Number((lines.find((line) => line.startsWith('element vertex')) || '').split(/\s+/)[2] || 0);
  return lines.slice(end + 1, end + 1 + count).map(partsToPoint).filter(Boolean);
}

function parsePcdAscii(text) {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim().toLowerCase() === 'data ascii');
  return lines.slice(start + 1).map(partsToPoint).filter(Boolean);
}

function rows(text) {
  return String(text).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

function countDataLines(text, format) {
  if (format === 'ply') {
    const lines = String(text).split(/\r?\n/);
    const end = lines.findIndex((line) => line.trim() === 'end_header');
    const count = Number((lines.find((line) => line.startsWith('element vertex')) || '').split(/\s+/)[2] || 0);
    return end >= 0 ? count : 0;
  }
  if (format === 'pcd') {
    const lines = String(text).split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim().toLowerCase() === 'data ascii');
    return start >= 0 ? rows(lines.slice(start + 1).join('\n')).length : 0;
  }
  return rows(text).length;
}

function partsToPoint(line) {
  const [x, y, z, r, g, b] = String(line).trim().split(/[\s,]+/).map(Number);
  if (![x, y, z].every(Number.isFinite)) return null;
  const point = { x, y, z };
  if ([r, g, b].every(Number.isFinite)) point.color = [r, g, b];
  return point;
}
