import { stableHash } from '../../core/stableHash.js';
import { buildIndexOverlayScene } from '../../ui/indexResultOverlay.js';
import { buildIndexResultVisuals } from '../../ui/indexResultVisuals.js';
import { assertReportSnapshotCurrent } from './reportSnapshot.js';
import { buildEvidenceManifest, createCaptureSpec } from './visualCapture.js';

export const P11_SCENE_PLAN_VERSION = 'p11-required-scene-plan-v1';
export const P11_FIGURE_MANIFEST_VERSION = 'p11-figure-manifest-v1';

const REQUIRED_SCENE_DEFINITIONS = [
  scene('model-isometric', 'model', ['base'], { yaw: -Math.PI / 4, pitch: Math.PI / 6 }),
  scene('model-plan-elevation', 'model', ['base'], { yaw: 0, pitch: Math.PI / 2 }),
  scene('load-gravity', 'loads', ['base', 'loads'], { yaw: -Math.PI / 4, pitch: Math.PI / 6 }),
  scene('load-lateral', 'loads', ['base', 'loads'], { yaw: -Math.PI / 4, pitch: Math.PI / 6 }),
  scene('deformed-governing', 'analysis', ['base', 'deformed'], { yaw: -Math.PI / 4, pitch: Math.PI / 6 }),
  scene('reactions-governing', 'analysis', ['base', 'reactions'], { yaw: -Math.PI / 4, pitch: Math.PI / 6 }),
  scene('utilization-governing', 'analysis', ['base', 'utilization'], { yaw: -Math.PI / 4, pitch: Math.PI / 6 }),
];
export const P11_REQUIRED_SCENES = Object.freeze(REQUIRED_SCENE_DEFINITIONS.map((value, index) => deepFreeze({
  ...value,
  ordinal: index + 1,
})));

export function createRequiredScenePlan(snapshot, model, analysis, options = {}) {
  assertReportSnapshotCurrent(snapshot, model, analysis);
  const governingComboId = selectGoverningCombo(snapshot);
  const governingMemberId = snapshot.analysis.governing?.memberId || null;
  const gravityCaseIds = selectGravityCases(model);
  const lateralCaseIds = selectLateralCases(model, governingComboId);
  if (!gravityCaseIds.length) throw sceneError('P11_SCENE_GRAVITY_SOURCE_MISSING', 'No gravity load case is available.');
  if (!lateralCaseIds.length) throw sceneError('P11_SCENE_LATERAL_SOURCE_MISSING', 'No lateral load case is available.');
  if (!governingComboId) throw sceneError('P11_SCENE_GOVERNING_COMBO_MISSING', 'No governing combination is available.');
  if (!governingMemberId) throw sceneError('P11_SCENE_GOVERNING_MEMBER_MISSING', 'No governing member is available.');

  const deformScale = positive(options.deformScale, 1);
  const rows = P11_REQUIRED_SCENES.map((definition) => {
    const selection = selectionFor(definition.kind, {
      governingComboId,
      governingMemberId,
      gravityCaseIds,
      lateralCaseIds,
      deformScale,
    });
    const captureSpec = createCaptureSpec({
      kind: definition.kind,
      reportSnapshotHash: snapshot.reportSnapshotHash,
      modelDomainHash: snapshot.sourceBinding.modelDomainHash,
      resultHash: snapshot.sourceBinding.resultHash,
      comboId: selection.comboId,
      camera: { projection: 'orthographic', ...definition.camera },
      layers: definition.layers,
      deformScale: selection.deformScale,
    });
    return deepFreeze({
      ordinal: definition.ordinal,
      kind: definition.kind,
      placement: definition.placement,
      required: true,
      sourceIds: selection.sourceIds,
      comboId: selection.comboId,
      memberId: selection.memberId,
      deformScale: selection.deformScale,
      captureSpec,
    });
  });
  const core = {
    version: P11_SCENE_PLAN_VERSION,
    reportSnapshotHash: snapshot.reportSnapshotHash,
    modelDomainHash: snapshot.sourceBinding.modelDomainHash,
    resultHash: snapshot.sourceBinding.resultHash,
    governingComboId,
    governingMemberId,
    scenes: rows,
  };
  return deepFreeze({ ...core, scenePlanHash: stableHash(core) });
}

export function createFigureManifest({ snapshot, scenePlan, captures, sourceRevision = null }) {
  assertScenePlanCurrent(scenePlan, snapshot);
  const capturesByKind = uniqueByKind(captures);
  const figures = scenePlan.scenes.map((planned, index) => {
    const capture = capturesByKind.get(planned.kind);
    assertCaptureMatchesPlan(capture, planned, snapshot);
    return {
      figureId: `figure-${String(index + 1).padStart(2, '0')}`,
      number: index + 1,
      sceneKind: planned.kind,
      placement: planned.placement,
      captionKey: `figure.caption.${planned.kind}`,
      assetPath: `assets/${planned.kind}-${capture.sha256.slice(0, 16)}.png`,
      sha256: capture.sha256,
      bytes: capture.bytes,
      width: capture.width,
      height: capture.height,
      captureSpecHash: capture.captureSpecHash,
      comboId: planned.comboId,
      sourceIds: [...planned.sourceIds],
      memberId: planned.memberId,
      deformScale: planned.deformScale,
      reportSnapshotHash: snapshot.reportSnapshotHash,
    };
  });
  if (capturesByKind.size !== figures.length) {
    throw sceneError('P11_FIGURE_UNEXPECTED_CAPTURE', 'Unexpected capture is present.');
  }
  const evidence = buildEvidenceManifest({ snapshot, captures, sourceRevision });
  const core = {
    version: P11_FIGURE_MANIFEST_VERSION,
    status: 'complete',
    reportSnapshotHash: snapshot.reportSnapshotHash,
    modelDomainHash: snapshot.sourceBinding.modelDomainHash,
    resultHash: snapshot.sourceBinding.resultHash,
    scenePlanHash: scenePlan.scenePlanHash,
    evidenceManifestHash: evidence.evidenceManifestHash,
    requiredCount: P11_REQUIRED_SCENES.length,
    figureCount: figures.length,
    figures,
  };
  return deepFreeze({ ...core, figureManifestHash: stableHash(core) });
}

export function buildRequiredSceneFrames(snapshot, model, analysis, scenePlan) {
  assertReportSnapshotCurrent(snapshot, model, analysis);
  assertScenePlanCurrent(scenePlan, snapshot);
  return scenePlan.scenes.map((planned) => {
    const scopedModel = planned.kind.startsWith('load-')
      ? { ...model, loads: (model?.loads || []).filter((row) => planned.sourceIds.includes(String(row.case))) }
      : model;
    const visuals = buildIndexResultVisuals(scopedModel, analysis, {
      resultId: planned.comboId,
      deformScale: planned.deformScale,
    });
    const state = {
      showDeformed: planned.kind === 'deformed-governing',
      showUtilization: planned.kind === 'utilization-governing',
      showLoads: planned.kind.startsWith('load-'),
      showReactions: planned.kind === 'reactions-governing',
      focus: planned.memberId ? { type: 'member', id: planned.memberId } : null,
    };
    const overlay = buildIndexOverlayScene(visuals, state, { width: 1600, height: 740 });
    return deepFreeze({
      version: 'p11-required-scene-frame-v1',
      kind: planned.kind,
      placement: planned.placement,
      projection: planned.kind === 'model-plan-elevation' ? 'plan-elevation' : 'isometric',
      captureSpecHash: planned.captureSpec.captureSpecHash,
      comboId: planned.comboId,
      sourceIds: [...planned.sourceIds],
      memberId: planned.memberId,
      deformScale: planned.deformScale,
      nodes: visuals.nodes,
      members: visuals.members,
      overlay,
    });
  });
}

export function validateFigureManifest(manifest, snapshot) {
  const errors = [];
  if (manifest?.version !== P11_FIGURE_MANIFEST_VERSION) errors.push('version');
  if (manifest?.status !== 'complete') errors.push('status');
  if (manifest?.reportSnapshotHash !== snapshot?.reportSnapshotHash) errors.push('reportSnapshotHash');
  if (manifest?.modelDomainHash !== snapshot?.sourceBinding?.modelDomainHash) errors.push('modelDomainHash');
  if (manifest?.resultHash !== snapshot?.sourceBinding?.resultHash) errors.push('resultHash');
  if (manifest?.requiredCount !== P11_REQUIRED_SCENES.length) errors.push('requiredCount');
  if (manifest?.figureCount !== P11_REQUIRED_SCENES.length) errors.push('figureCount');
  const figures = Array.isArray(manifest?.figures) ? manifest.figures : [];
  const kinds = new Set();
  const ids = new Set();
  for (const [index, figure] of figures.entries()) {
    if (figure?.number !== index + 1) errors.push(`number:${index}`);
    if (figure?.figureId !== `figure-${String(index + 1).padStart(2, '0')}`) errors.push(`figureId:${index}`);
    if (!P11_REQUIRED_SCENES.some((row) => row.kind === figure?.sceneKind)) errors.push(`sceneKind:${index}`);
    if (kinds.has(figure?.sceneKind)) errors.push(`duplicateScene:${figure?.sceneKind}`);
    if (ids.has(figure?.figureId)) errors.push(`duplicateFigure:${figure?.figureId}`);
    kinds.add(figure?.sceneKind);
    ids.add(figure?.figureId);
    if (!/^assets\/[a-z0-9-]+-[a-f0-9]{16}\.png$/.test(figure?.assetPath || '')) errors.push(`assetPath:${index}`);
    if (!/^[a-f0-9]{64}$/.test(figure?.sha256 || '')) errors.push(`sha256:${index}`);
    if (!(figure?.width >= 1600 && figure?.height >= 900 && figure?.bytes > 0)) errors.push(`asset:${index}`);
    if (figure?.reportSnapshotHash !== snapshot?.reportSnapshotHash) errors.push(`figureSnapshot:${index}`);
  }
  for (const required of P11_REQUIRED_SCENES) if (!kinds.has(required.kind)) errors.push(`missingScene:${required.kind}`);
  const { figureManifestHash, ...core } = manifest || {};
  if (figureManifestHash && stableHash(core) !== figureManifestHash) errors.push('figureManifestHash');
  return { ok: errors.length === 0, errors };
}

export function assertFigureManifestComplete(manifest, snapshot) {
  const validation = validateFigureManifest(manifest, snapshot);
  if (!validation.ok) throw sceneError('P11_FIGURE_MANIFEST_INVALID', validation.errors.join(', '));
  return true;
}

function scene(kind, placement, layers, camera) {
  return { kind, placement, layers, camera };
}

function selectionFor(kind, input) {
  if (kind === 'load-gravity') {
    return { sourceIds: input.gravityCaseIds, comboId: null, memberId: null, deformScale: 1 };
  }
  if (kind === 'load-lateral') {
    return { sourceIds: input.lateralCaseIds, comboId: input.governingComboId, memberId: null, deformScale: 1 };
  }
  if (kind.startsWith('model-')) {
    return { sourceIds: [], comboId: null, memberId: null, deformScale: 1 };
  }
  return {
    sourceIds: [input.governingComboId],
    comboId: input.governingComboId,
    memberId: kind === 'utilization-governing' ? input.governingMemberId : null,
    deformScale: kind === 'deformed-governing' ? input.deformScale : 1,
  };
}

function selectGoverningCombo(snapshot) {
  if (snapshot?.analysis?.governing?.comboId) return snapshot.analysis.governing.comboId;
  return [...(snapshot?.analysis?.combinations || [])]
    .sort((a, b) => (b.maxRatio || 0) - (a.maxRatio || 0)
      || (b.dmax || 0) - (a.dmax || 0)
      || a.id.localeCompare(b.id))[0]?.id || null;
}

function selectGravityCases(model) {
  return (model?.loadCases || [])
    .filter((row) => /^(?:dead|live|snow)$/i.test(row.type || '') || /^(?:D|DL|L|LL|S)$/i.test(row.id || ''))
    .map((row) => String(row.id))
    .sort();
}

function selectLateralCases(model, comboId) {
  const cases = (model?.loadCases || [])
    .filter((row) => /^(?:wind|seismic|earthquake)$/i.test(row.type || '') || /^(?:W|E|EQ|WX|WY|EX|EY)/i.test(row.id || ''))
    .map((row) => String(row.id))
    .sort();
  const combination = (model?.loadCombinations || []).find((row) => row.id === comboId);
  const active = cases.filter((id) => Math.abs(Number(combination?.factors?.[id]) || 0) > 0);
  if (active.length) {
    return active.sort((a, b) => Math.abs(Number(combination.factors[b])) - Math.abs(Number(combination.factors[a]))
      || a.localeCompare(b)).slice(0, 1);
  }
  const named = cases.filter((id) => comboId?.toUpperCase().includes(id.toUpperCase()));
  return (named.length ? named : cases).slice(0, 1);
}

function assertScenePlanCurrent(plan, snapshot) {
  if (plan?.version !== P11_SCENE_PLAN_VERSION
    || plan?.reportSnapshotHash !== snapshot?.reportSnapshotHash
    || plan?.modelDomainHash !== snapshot?.sourceBinding?.modelDomainHash
    || plan?.resultHash !== snapshot?.sourceBinding?.resultHash) {
    throw sceneError('P11_SCENE_PLAN_STALE', 'Scene plan does not match the report snapshot.');
  }
  const { scenePlanHash, ...core } = plan;
  if (stableHash(core) !== scenePlanHash) throw sceneError('P11_SCENE_PLAN_INVALID', 'Scene plan hash is invalid.');
}

function uniqueByKind(captures = []) {
  const rows = new Map();
  for (const capture of captures) {
    if (rows.has(capture?.kind)) throw sceneError('P11_FIGURE_DUPLICATE_CAPTURE', `Duplicate capture: ${capture?.kind}`);
    rows.set(capture?.kind, capture);
  }
  return rows;
}

function assertCaptureMatchesPlan(capture, planned, snapshot) {
  if (!capture) throw sceneError('P11_FIGURE_REQUIRED_CAPTURE_MISSING', `Missing capture: ${planned.kind}`);
  if (capture.captureSpecHash !== planned.captureSpec.captureSpecHash
    || capture.reportSnapshotHash !== snapshot.reportSnapshotHash
    || capture.modelDomainHash !== snapshot.sourceBinding.modelDomainHash
    || capture.resultHash !== snapshot.sourceBinding.resultHash) {
    throw sceneError('P11_FIGURE_CAPTURE_STALE', `Stale capture: ${planned.kind}`);
  }
  if (!/^[a-f0-9]{64}$/.test(capture.sha256 || '') || !(capture.bytes > 0)
    || capture.width < 1600 || capture.height < 900) {
    throw sceneError('P11_FIGURE_CAPTURE_INVALID', `Invalid capture: ${planned.kind}`);
  }
}

function positive(value, fallback) {
  const number = Number(value);
  return number > 0 && Number.isFinite(number) ? number : fallback;
}

function sceneError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
