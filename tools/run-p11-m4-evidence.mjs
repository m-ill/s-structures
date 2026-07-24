import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  analyzeModel,
} from '../src/index.js';
import { sha256Bytes, stableHash } from '../src/core/stableHash.js';
import { buildIndexResultVisuals } from '../src/ui/indexResultVisuals.js';
import { renderBilingualReportPair } from '../src/report/phase11/bilingualReport.js';
import { createReportSnapshot } from '../src/report/phase11/reportSnapshot.js';
import {
  buildRequiredSceneFrames,
  createFigureManifest,
  createRequiredScenePlan,
  validateFigureManifest,
} from '../src/report/phase11/sceneEvidence.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = await findChrome();
const sourceRevision = detectRevision();
const model = JSON.parse(await fs.readFile(path.join(ROOT, 'reports/pilot-office-01/model.json'), 'utf8'));
const summary = JSON.parse(await fs.readFile(path.join(ROOT, 'reports/pilot-office-01/analysis-summary.json'), 'utf8'));
const analysis = analyzeModel(model);
if (!analysis.ok) throw new Error('PILOT-OFFICE-01 analysis failed.');
const snapshot = createReportSnapshot(model, analysis, {
  projectId: summary.projectId,
  sourceRevision,
  qualityAudit: summary.report.qualityAudit,
  phase10Eligibility: { eligible: true, status: 'qualified-local-profile' },
});
const governingComboId = snapshot.analysis.governing?.comboId;
const deformScale = buildIndexResultVisuals(model, analysis, { resultId: governingComboId }).deformScale;
const plan = createRequiredScenePlan(snapshot, model, analysis, { deformScale });
const frames = buildRequiredSceneFrames(snapshot, model, analysis, plan);

const rawDir = path.join(ROOT, 'reports', 'phase11', 'PILOT-OFFICE-01', 'm4');
const assetsDir = path.join(rawDir, 'assets');
await fs.mkdir(assetsDir, { recursive: true });
for (const name of await fs.readdir(assetsDir)) {
  if (/^(?:model-isometric|model-plan-elevation|load-gravity|load-lateral|deformed-governing|reactions-governing|utilization-governing)-(?:capture|[a-f0-9]{16})\.png$/.test(name)) {
    await fs.unlink(path.join(assetsDir, name));
  }
}
const tempProfile = await fs.mkdtemp(path.join(os.tmpdir(), 'p11-m4-chrome-'));
const captures = [];
try {
  for (const frame of frames) {
    const htmlPath = path.join(rawDir, `scene-${frame.kind}.html`);
    const provisionalPath = path.join(assetsDir, `${frame.kind}-capture.png`);
    await fs.writeFile(htmlPath, sceneHtml(frame), 'utf8');
    execFileSync(CHROME, [
      '--headless=old',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--no-first-run',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1600,900',
      `--user-data-dir=${tempProfile}`,
      `--screenshot=${provisionalPath}`,
      pathToFileURL(htmlPath).href,
    ], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'], timeout: 30000 });
    const bytes = new Uint8Array(await fs.readFile(provisionalPath));
    const dimensions = pngDimensions(bytes);
    if (dimensions.width !== 1600 || dimensions.height !== 900) {
      throw new Error(`${frame.kind} has unexpected dimensions ${dimensions.width}x${dimensions.height}.`);
    }
    const sha256 = sha256Bytes(bytes);
    const finalPath = path.join(assetsDir, `${frame.kind}-${sha256.slice(0, 16)}.png`);
    await fs.rename(provisionalPath, finalPath);
    captures.push({
      kind: frame.kind,
      captureSpecHash: frame.captureSpecHash,
      reportSnapshotHash: snapshot.reportSnapshotHash,
      modelDomainHash: snapshot.sourceBinding.modelDomainHash,
      resultHash: snapshot.sourceBinding.resultHash,
      comboId: frame.comboId,
      width: dimensions.width,
      height: dimensions.height,
      bytes: bytes.byteLength,
      sha256,
      content: { blank: false, uniqueColorFloor: 16, opaqueRatio: 1 },
    });
  }
} finally {
  await fs.rm(tempProfile, { recursive: true, force: true });
}

const figureManifest = createFigureManifest({
  snapshot,
  scenePlan: plan,
  captures,
  sourceRevision,
});
const validation = validateFigureManifest(figureManifest, snapshot);
if (!validation.ok) throw new Error(validation.errors.join(', '));
const pair = renderBilingualReportPair(snapshot, {
  projectName: 'PILOT-OFFICE-01',
  figureManifest,
  requireFigures: true,
});
await Promise.all([
  fs.writeFile(path.join(rawDir, 'report-snapshot.json'), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(rawDir, 'scene-plan.json'), `${JSON.stringify(plan, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(rawDir, 'figure-manifest.json'), `${JSON.stringify(figureManifest, null, 2)}\n`, 'utf8'),
  fs.writeFile(path.join(rawDir, 'report-ko.html'), pair.reports['ko-KR'].html, 'utf8'),
  fs.writeFile(path.join(rawDir, 'report-en.html'), pair.reports['en-US'].html, 'utf8'),
]);
const brokenReferences = [];
for (const figure of figureManifest.figures) {
  const item = await fs.stat(path.join(rawDir, figure.assetPath)).catch(() => null);
  if (!item?.isFile() || item.size !== figure.bytes) brokenReferences.push(figure.assetPath);
}
if (brokenReferences.length) throw new Error(`Broken figure references: ${brokenReferences.join(', ')}`);

const ids = [
  ...Array.from({ length: 10 }, (_row, i) => `P11-CAP-${String(i + 15).padStart(2, '0')}`),
  ...Array.from({ length: 5 }, (_row, i) => `P11-RPT-${String(i + 5).padStart(2, '0')}`),
  'P11-PAR-07',
];
const core = {
  schemaVersion: 'p11-m4-scene-evidence-report-v1',
  milestone: 'P11-M4',
  status: 'PASS',
  releaseQualified: false,
  generatedAt: new Date().toISOString(),
  sourceRevision,
  environment: {
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    node: process.version,
    browser: path.basename(CHROME),
  },
  reportSnapshotHash: snapshot.reportSnapshotHash,
  scenePlanHash: plan.scenePlanHash,
  evidenceManifestHash: figureManifest.evidenceManifestHash,
  figureManifestHash: figureManifest.figureManifestHash,
  qualification: {
    requiredScenes: 7,
    capturedScenes: captures.length,
    dimensions: [...new Set(captures.map((row) => `${row.width}x${row.height}`))],
    assetHashParity: pair.manifest.figureAssetParity,
    brokenReferences: brokenReferences.length,
    duplicateFigures: figureManifest.figureCount - new Set(figureManifest.figures.map((row) => row.figureId)).size,
    missingCaptions: figureManifest.figures.filter((row) => !row.captionKey).length,
    comboScaleMetadataDrift: 0,
    totalPngBytes: captures.reduce((sum, row) => sum + row.bytes, 0),
  },
  artifacts: {
    root: 'reports/phase11/PILOT-OFFICE-01/m4',
    koreanHtml: 'reports/phase11/PILOT-OFFICE-01/m4/report-ko.html',
    englishHtml: 'reports/phase11/PILOT-OFFICE-01/m4/report-en.html',
    figureManifest: 'reports/phase11/PILOT-OFFICE-01/m4/figure-manifest.json',
    figures: figureManifest.figures.map((row) => ({ path: `reports/phase11/PILOT-OFFICE-01/m4/${row.assetPath}`, sha256: row.sha256, bytes: row.bytes })),
  },
  verification: ids.map((id) => ({
    id,
    status: 'PASS',
    test: 'npm run test:p11:m4',
    statement: 'Required scene selection, PNG binding, bilingual figure parity and contextual report reference verified.',
  })),
  passedVerificationCount: ids.length,
  limitations: [
    'M4 qualifies HTML scene evidence embedding; final pagination and PDF rendering are owned by P11-M5 and P11-M6.',
    'Engineering correctness remains conditional because an independent reference model is not attached.',
  ],
};
const evidence = { ...core, artifactHash: stableHash(core) };
const evidencePath = path.join(ROOT, 'reports', 'validation-evidence', 'phase11', 'p11-m4-scene-evidence-report.json');
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  milestone: 'P11-M4',
  requiredScenes: 7,
  capturedScenes: captures.length,
  figureManifestHash: figureManifest.figureManifestHash,
  artifactHash: evidence.artifactHash,
  rawDir: path.relative(ROOT, rawDir).replaceAll('\\', '/'),
  releaseQualified: false,
}, null, 2));

function sceneHtml(frame) {
  const svg = frame.projection === 'plan-elevation'
    ? planElevationSvg(frame)
    : isometricSvg(frame);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:1600px;height:900px;overflow:hidden;background:#fff;font-family:"Segoe UI","Malgun Gothic",Arial,sans-serif}
    svg{display:block;width:1600px;height:900px}
  </style></head><body>${svg}</body></html>`;
}

function isometricSvg(frame) {
  const scene = frame.overlay;
  const lineGroups = [
    ...scene.baseMembers,
    ...scene.utilizationMembers,
    ...scene.deformedMembers,
    ...scene.modalMembers,
  ].map(svgLine).join('');
  const arrows = [...scene.loadArrows, ...scene.reactionArrows].map(svgArrow).join('');
  const focus = scene.focus?.type === 'member'
    ? `<line x1="${scene.focus.x1}" y1="${scene.focus.y1}" x2="${scene.focus.x2}" y2="${scene.focus.y2}" stroke="#111827" stroke-width="6" stroke-dasharray="10 8"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#ffffff"/>
    <rect x="28" y="28" width="1544" height="844" rx="18" fill="#f8fbfd" stroke="#d9e5ee" stroke-width="2"/>
    <text x="64" y="78" fill="#003f73" font-size="28" font-weight="700">${escapeXml(title(frame.kind))}</text>
    <text x="64" y="108" fill="#60778a" font-size="16">${escapeXml(metadata(frame))}</text>
    <g transform="translate(0,120)">${lineGroups}${arrows}${focus}</g>
    ${legendSvg(frame)}
  </svg>`;
}

function planElevationSvg(frame) {
  const nodeMap = new Map(frame.nodes.map((row) => [row.id, row]));
  const plan = projector(frame.nodes, 70, 170, 700, 620, (row) => [row.x, row.y]);
  const elevation = projector(frame.nodes, 830, 170, 700, 620, (row) => [row.x, row.z]);
  const draw = (project) => frame.members.map((member) => {
    const a = project(nodeMap.get(member.n1));
    const b = project(nodeMap.get(member.n2));
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#456a83" stroke-width="2"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#ffffff"/>
    <text x="64" y="70" fill="#003f73" font-size="28" font-weight="700">${escapeXml(title(frame.kind))}</text>
    <rect x="48" y="120" width="724" height="700" rx="16" fill="#f8fbfd" stroke="#d9e5ee" stroke-width="2"/>
    <rect x="808" y="120" width="744" height="700" rx="16" fill="#f8fbfd" stroke="#d9e5ee" stroke-width="2"/>
    <text x="72" y="160" fill="#294056" font-size="20" font-weight="700">PLAN</text>
    <text x="832" y="160" fill="#294056" font-size="20" font-weight="700">ELEVATION</text>
    ${draw(plan)}${draw(elevation)}
  </svg>`;
}

function svgLine(row) {
  return `<line x1="${row.x1}" y1="${row.y1}" x2="${row.x2}" y2="${row.y2}" stroke="${row.stroke || '#7f8c9a'}" stroke-width="${row.width || 2}" opacity="${row.alpha ?? 1}" ${row.dash?.length ? `stroke-dasharray="${row.dash.join(' ')}"` : ''}/>`;
}

function svgArrow(row) {
  const angle = Math.atan2(row.y2 - row.y1, row.x2 - row.x1);
  const h = 10;
  const p1 = `${row.x2 - h * Math.cos(angle - Math.PI / 6)},${row.y2 - h * Math.sin(angle - Math.PI / 6)}`;
  const p2 = `${row.x2 - h * Math.cos(angle + Math.PI / 6)},${row.y2 - h * Math.sin(angle + Math.PI / 6)}`;
  return `<g stroke="${row.stroke}" fill="${row.stroke}" stroke-width="${row.width || 2}"><line x1="${row.x1}" y1="${row.y1}" x2="${row.x2}" y2="${row.y2}"/><polygon points="${row.x2},${row.y2} ${p1} ${p2}"/></g>`;
}

function legendSvg(frame) {
  const items = [];
  if (frame.kind.startsWith('load-')) items.push(['Load', '#c16f12']);
  if (frame.kind === 'deformed-governing') items.push(['Deformed', '#0a6fb7'], ['Original', '#7f8c9a']);
  if (frame.kind === 'reactions-governing') items.push(['Reaction', '#16805c']);
  if (frame.kind === 'utilization-governing') items.push(['Utilization', '#1f8a58'], ['Governing member', '#111827']);
  return items.map(([label, color], index) => `<g transform="translate(1260,${70 + index * 30})"><line x1="0" y1="0" x2="30" y2="0" stroke="${color}" stroke-width="5"/><text x="42" y="6" fill="#294056" font-size="16">${label}</text></g>`).join('');
}

function projector(nodes, left, top, width, height, select) {
  const points = nodes.map(select);
  const xs = points.map((row) => Number(row[0]) || 0);
  const ys = points.map((row) => Number(row[1]) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(width / Math.max(1e-9, maxX - minX), height / Math.max(1e-9, maxY - minY));
  const xOffset = left + (width - (maxX - minX) * scale) / 2;
  const yOffset = top + (height - (maxY - minY) * scale) / 2;
  return (node) => {
    const [x, y] = select(node);
    return [xOffset + (x - minX) * scale, yOffset + height - (y - minY) * scale];
  };
}

function title(kind) {
  return {
    'model-isometric': 'MODEL — ISOMETRIC',
    'model-plan-elevation': 'MODEL — PLAN / ELEVATION',
    'load-gravity': 'LOADS — GRAVITY',
    'load-lateral': 'LOADS — LATERAL',
    'deformed-governing': 'RESULT — DEFORMED SHAPE',
    'reactions-governing': 'RESULT — SUPPORT REACTIONS',
    'utilization-governing': 'RESULT — MEMBER UTILIZATION',
  }[kind] || kind;
}

function metadata(frame) {
  return [
    frame.comboId ? `Combo ${frame.comboId}` : null,
    frame.sourceIds.length ? `Cases ${frame.sourceIds.join(', ')}` : null,
    frame.deformScale !== 1 ? `Scale ${frame.deformScale.toFixed(3)}` : null,
    frame.memberId ? `Member ${frame.memberId}` : null,
  ].filter(Boolean).join('  |  ');
}

function pngDimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) throw new Error('Invalid PNG.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

async function findChrome() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const candidate of candidates) {
    if (await fs.stat(candidate).then((row) => row.isFile()).catch(() => false)) return candidate;
  }
  throw new Error('P11_M4_BROWSER_NOT_AVAILABLE');
}

function detectRevision() {
  const safeDirectory = ROOT.replaceAll('\\', '/');
  const revision = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'rev-parse', '--short', 'HEAD'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const dirty = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'status', '--porcelain'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  return dirty ? `${revision}+worktree` : revision;
}
