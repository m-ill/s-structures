export const POINT_CLOUD_LOADER_VERSION = 'p3-m8-pointcloud-loader-v1';

export function parsePointCloudText(text, options = {}) {
  const format = (options.format || detectFormat(text)).toLowerCase();
  if (format === 'xyz' || format === 'txt') return parseXyz(text);
  if (format === 'ply') return parsePlyAscii(text);
  if (format === 'pcd') return parsePcdAscii(text);
  throw new Error(`Unsupported point cloud format: ${format}`);
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

function partsToPoint(line) {
  const [x, y, z, r, g, b] = String(line).trim().split(/[\s,]+/).map(Number);
  if (![x, y, z].every(Number.isFinite)) return null;
  const point = { x, y, z };
  if ([r, g, b].every(Number.isFinite)) point.color = [r, g, b];
  return point;
}
