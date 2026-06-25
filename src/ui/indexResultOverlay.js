import { buildIndexResultVisuals } from './indexResultVisuals.js';

export const INDEX_RESULT_OVERLAY_VERSION = 'm18-result-overlay';

export const DEFAULT_OVERLAY_STATE = {
  showDeformed: false,
  showUtilization: false,
  showLoads: false,
  showReactions: false,
  showModal: false,
  showPDelta: false,
  modeIndex: 0,
  pDeltaStep: 0,
  focus: null,
};

const COLORS = {
  base: '#7f8c9a',
  deform: '#0a6fb7',
  load: '#c16f12',
  reaction: '#16805c',
  modal: '#684fc6',
  focus: '#111827',
  text: '#243447',
};

export function createDefaultOverlayState(overrides = {}) {
  return {
    ...DEFAULT_OVERLAY_STATE,
    ...overrides,
  };
}

export function buildIndexOverlayScene(visuals, state = {}, size = {}) {
  const overlayState = createDefaultOverlayState(state);
  const width = Math.max(240, Number(size.width) || 900);
  const height = Math.max(180, Number(size.height) || 560);
  const project = createProjector(visuals, { width, height });
  const nodes = new Map((visuals?.nodes || []).map((node) => [node.id, node]));
  const deformedNodes = new Map((visuals?.deformedNodes || []).map((node) => [node.id, node]));
  const members = visuals?.members || [];

  const baseMembers = members.map((member) => lineCommand(member, nodes, project, {
    stroke: COLORS.base,
    width: 1,
    alpha: 0.45,
  })).filter(Boolean);

  const utilizationMembers = overlayState.showUtilization
    ? members.map((member) => lineCommand(member, nodes, project, {
      stroke: member.color || COLORS.base,
      width: 2 + Math.min(4, Math.max(0, Number(member.ratio) || 0) * 3),
      alpha: 0.9,
      label: member.ratio > 0 ? `${member.id} ${formatRatio(member.ratio)}` : member.id,
      memberId: member.id,
    })).filter(Boolean)
    : [];

  const deformedMembers = overlayState.showDeformed
    ? members.map((member) => lineCommand(member, deformedNodes, project, {
      stroke: COLORS.deform,
      width: 2,
      alpha: 0.8,
      dash: [6, 4],
      memberId: member.id,
    })).filter(Boolean)
    : [];

  const modalMembers = overlayState.showModal
    ? modeMemberCommands(visuals, overlayState, project)
    : [];

  const loadArrows = overlayState.showLoads
    ? loadArrowCommands(visuals, nodes, project)
    : [];

  const reactionArrows = overlayState.showReactions
    ? reactionArrowCommands(visuals, nodes, project)
    : [];

  return {
    version: INDEX_RESULT_OVERLAY_VERSION,
    state: overlayState,
    size: { width, height },
    resultId: visuals?.resultId || null,
    deformScale: visuals?.deformScale || 1,
    maxDisplacement: visuals?.maxDisplacement || 0,
    baseMembers,
    utilizationMembers,
    deformedMembers,
    modalMembers,
    loadArrows,
    reactionArrows,
    focus: focusCommand(overlayState.focus, nodes, members, project),
    badges: buildBadges(visuals, overlayState),
    legend: buildLegend(overlayState),
  };
}

export function installIndexResultOverlay(target, bridge, options = {}) {
  const doc = target?.document;
  if (!doc || target.__SStructuresIndexResultOverlayInstalled) return null;

  injectOverlayStyles(doc);
  const host = doc.getElementById(options.hostId || 'canvasWrap') || doc.body;
  const canvas = createOverlayCanvas(doc, host);
  const controls = createOverlayControls(doc, host);
  const state = createDefaultOverlayState(options.state || {});

  const overlay = {
    version: INDEX_RESULT_OVERLAY_VERSION,
    canvas,
    controls,
    state,
    scene: null,
    setOption(key, value) {
      if (!Object.prototype.hasOwnProperty.call(state, key)) throw new Error(`Unsupported overlay option: ${key}`);
      state[key] = typeof state[key] === 'boolean' ? Boolean(value) : value;
      return overlay.render();
    },
    setMode(index) {
      state.modeIndex = Math.max(0, Math.trunc(Number(index) || 0));
      state.showModal = true;
      return overlay.render();
    },
    setPDeltaStep(step) {
      state.pDeltaStep = Math.max(0, Math.trunc(Number(step) || 0));
      state.showPDelta = true;
      return overlay.render();
    },
    focusEntity(type, id) {
      state.focus = type && id ? { type, id } : null;
      return overlay.render();
    },
    getState() {
      return { ...state, focus: state.focus ? { ...state.focus } : null };
    },
    render(analysis = bridge?.getLastResult?.(), model = bridge?.getCurrentModel?.()) {
      resizeOverlayCanvas(canvas, host);
      const visuals = model ? buildIndexResultVisuals(model, analysis || bridge?.analyzeModel?.(model), state) : null;
      overlay.scene = buildIndexOverlayScene(visuals, state, {
        width: canvas.width / (target.devicePixelRatio || 1),
        height: canvas.height / (target.devicePixelRatio || 1),
      });
      drawOverlayScene(canvas, overlay.scene, target.devicePixelRatio || 1);
      updateControlState(controls, state);
      target.SStructuresOverlayScene = overlay.scene;
      return overlay.scene;
    },
  };

  bindOverlayControls(controls, overlay);
  const originalAnalyze = bridge.analyzeModel.bind(bridge);
  bridge.analyzeModel = (model, analysisOptions) => {
    const result = originalAnalyze(model, analysisOptions);
    overlay.render(result, model);
    return result;
  };
  bridge.renderResultOverlay = () => overlay.render();
  target.analyzeModel = bridge.analyzeModel;
  target.SStructuresResultVisuals = overlay;
  target.__SStructuresIndexResultOverlayInstalled = true;

  if (typeof target.ResizeObserver === 'function') {
    const observer = new target.ResizeObserver(() => overlay.render());
    observer.observe(host);
    overlay.resizeObserver = observer;
  }

  queueMicrotask(() => overlay.render());
  return overlay;
}

function lineCommand(member, nodeMap, project, options) {
  const a = nodeMap.get(member.n1);
  const b = nodeMap.get(member.n2);
  if (!a || !b) return null;
  const p1 = project(a);
  const p2 = project(b);
  return {
    type: 'line',
    id: member.id,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    ...options,
  };
}

function modeMemberCommands(visuals, state, project) {
  const mode = visuals?.modal?.modes?.[state.modeIndex] || visuals?.modal?.modes?.[0];
  if (!mode) return [];
  const shapeNodes = new Map(mode.shape.map((node) => [node.nodeId, node]));
  return (visuals.members || []).map((member) => lineCommand(member, shapeNodes, project, {
    stroke: COLORS.modal,
    width: 2,
    alpha: 0.75,
    dash: [3, 3],
    memberId: member.id,
  })).filter(Boolean);
}

function loadArrowCommands(visuals, nodeMap, project) {
  const maxMagnitude = Math.max(1, ...(visuals?.loads || []).map((load) => Math.abs(Number(load.magnitude) || 0)));
  return (visuals?.loads || []).map((load) => {
    const anchor = load.at || midPointForMember(load.memberNodes, nodeMap);
    if (!anchor) return null;
    const point = project(anchor);
    const dir = projectDirection(load.direction || [0, 0, -1]);
    const length = 18 + 42 * Math.min(1, Math.abs(Number(load.magnitude) || 0) / maxMagnitude);
    return arrowCommand(load.id, point, dir, length, COLORS.load, `L ${load.case || ''}`.trim());
  }).filter(Boolean);
}

function reactionArrowCommands(visuals, nodeMap, project) {
  const maxMagnitude = Math.max(1, ...(visuals?.reactions || []).map((reaction) => reaction.forceMagnitude || 0));
  return (visuals?.reactions || []).map((reaction) => {
    const node = nodeMap.get(reaction.nodeId);
    if (!node) return null;
    const point = project(node);
    const direction = reaction.forceMagnitude > 0
      ? reaction.force.map((value) => -value / reaction.forceMagnitude)
      : [0, 0, 1];
    const length = 18 + 38 * Math.min(1, reaction.forceMagnitude / maxMagnitude);
    return arrowCommand(reaction.nodeId, point, projectDirection(direction), length, COLORS.reaction, 'R');
  }).filter(Boolean);
}

function arrowCommand(id, point, direction, length, stroke, label) {
  const dx = direction.x * length;
  const dy = direction.y * length;
  return {
    type: 'arrow',
    id,
    x1: point.x - dx,
    y1: point.y - dy,
    x2: point.x,
    y2: point.y,
    stroke,
    width: 2,
    alpha: 0.9,
    label,
  };
}

function focusCommand(focus, nodes, members, project) {
  if (!focus?.type || !focus.id) return null;
  if (focus.type === 'node') {
    const node = nodes.get(focus.id);
    if (!node) return null;
    return { type: 'node', id: focus.id, ...project(node), radius: 9 };
  }
  if (focus.type === 'member') {
    const member = members.find((item) => item.id === focus.id);
    const a = member ? nodes.get(member.n1) : null;
    const b = member ? nodes.get(member.n2) : null;
    if (!a || !b) return null;
    const p1 = project(a);
    const p2 = project(b);
    return { type: 'member', id: focus.id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  return null;
}

function buildBadges(visuals, state) {
  if (!hasVisibleOverlay(state)) return [];
  const badges = [
    `Result ${visuals?.resultId || '-'}`,
    `Scale ${formatRatio(visuals?.deformScale || 1)}`,
  ];
  if (state.showModal) {
    const mode = visuals?.modal?.modes?.[state.modeIndex] || visuals?.modal?.modes?.[0];
    badges.push(mode ? `Mode ${mode.index} / ${formatRatio(mode.period)}s` : 'Mode -');
  }
  if (state.showPDelta) badges.push(`P-Delta step ${state.pDeltaStep}`);
  return badges;
}

function hasVisibleOverlay(state) {
  return !!(
    state.showDeformed ||
    state.showUtilization ||
    state.showLoads ||
    state.showReactions ||
    state.showModal ||
    state.showPDelta ||
    state.focus
  );
}

function buildLegend(state) {
  const legend = [];
  if (state.showUtilization) legend.push({ label: 'Utilization', color: '#1f8a58' });
  if (state.showDeformed) legend.push({ label: 'Deformed', color: COLORS.deform });
  if (state.showLoads) legend.push({ label: 'Loads', color: COLORS.load });
  if (state.showReactions) legend.push({ label: 'Reactions', color: COLORS.reaction });
  if (state.showModal) legend.push({ label: 'Mode shape', color: COLORS.modal });
  return legend;
}

function createProjector(visuals, size) {
  const points = [
    ...(visuals?.nodes || []),
    ...(visuals?.deformedNodes || []),
    ...((visuals?.modal?.modes || []).flatMap((mode) => mode.shape || [])),
  ];
  const projected = points.length ? points.map(rawProject) : [{ x: 0, y: 0 }];
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const margin = 42;
  const spanX = Math.max(1e-9, maxX - minX);
  const spanY = Math.max(1e-9, maxY - minY);
  const scale = Math.min((size.width - margin * 2) / spanX, (size.height - margin * 2) / spanY);
  return (point) => {
    const p = rawProject(point);
    return {
      x: margin + (p.x - minX) * scale,
      y: size.height - margin - (p.y - minY) * scale,
    };
  };
}

function rawProject(point) {
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  const z = Number(point.z) || 0;
  return {
    x: x - y * 0.38,
    y: z + y * 0.24,
  };
}

function projectDirection(vector) {
  const p0 = rawProject({ x: 0, y: 0, z: 0 });
  const p1 = rawProject({ x: vector[0] || 0, y: vector[1] || 0, z: vector[2] || 0 });
  const dx = p1.x - p0.x;
  const dy = -(p1.y - p0.y);
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function midPointForMember(memberNodes, nodeMap) {
  const a = nodeMap.get(memberNodes?.[0]);
  const b = nodeMap.get(memberNodes?.[1]);
  if (!a || !b) return null;
  return {
    x: ((Number(a.x) || 0) + (Number(b.x) || 0)) / 2,
    y: ((Number(a.y) || 0) + (Number(b.y) || 0)) / 2,
    z: ((Number(a.z) || 0) + (Number(b.z) || 0)) / 2,
  };
}

function drawOverlayScene(canvas, scene, ratio = 1) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx || !scene) return;
  const width = scene.size.width;
  const height = scene.size.height;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  drawLines(ctx, scene.utilizationMembers);
  drawLines(ctx, scene.deformedMembers);
  drawLines(ctx, scene.modalMembers);
  drawArrows(ctx, scene.loadArrows);
  drawArrows(ctx, scene.reactionArrows);
  drawFocus(ctx, scene.focus);
  drawBadges(ctx, scene.badges, scene.legend);
}

function drawLines(ctx, lines) {
  for (const line of lines) {
    ctx.save();
    ctx.globalAlpha = line.alpha ?? 1;
    ctx.strokeStyle = line.stroke;
    ctx.lineWidth = line.width || 1;
    ctx.setLineDash(line.dash || []);
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
    if (line.label) {
      ctx.fillStyle = line.stroke;
      ctx.font = '11px Segoe UI, Arial, sans-serif';
      ctx.fillText(line.label, (line.x1 + line.x2) / 2 + 4, (line.y1 + line.y2) / 2 - 4);
    }
    ctx.restore();
  }
}

function drawArrows(ctx, arrows) {
  for (const arrow of arrows) {
    ctx.save();
    ctx.globalAlpha = arrow.alpha ?? 1;
    ctx.strokeStyle = arrow.stroke;
    ctx.fillStyle = arrow.stroke;
    ctx.lineWidth = arrow.width || 1;
    ctx.beginPath();
    ctx.moveTo(arrow.x1, arrow.y1);
    ctx.lineTo(arrow.x2, arrow.y2);
    ctx.stroke();
    const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1);
    const head = 7;
    ctx.beginPath();
    ctx.moveTo(arrow.x2, arrow.y2);
    ctx.lineTo(arrow.x2 - head * Math.cos(angle - Math.PI / 6), arrow.y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(arrow.x2 - head * Math.cos(angle + Math.PI / 6), arrow.y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    if (arrow.label) ctx.fillText(arrow.label, arrow.x2 + 5, arrow.y2 - 5);
    ctx.restore();
  }
}

function drawFocus(ctx, focus) {
  if (!focus) return;
  ctx.save();
  ctx.strokeStyle = COLORS.focus;
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 4]);
  if (focus.type === 'node') {
    ctx.beginPath();
    ctx.arc(focus.x, focus.y, focus.radius, 0, Math.PI * 2);
    ctx.stroke();
  } else if (focus.type === 'member') {
    ctx.beginPath();
    ctx.moveTo(focus.x1, focus.y1);
    ctx.lineTo(focus.x2, focus.y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBadges(ctx, badges, legend) {
  if (!badges.length && !legend.length) return;
  ctx.save();
  ctx.font = '11px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.strokeStyle = 'rgba(120,135,150,.45)';
  ctx.lineWidth = 1;
  const lines = [...badges, ...legend.map((item) => item.label)];
  const width = Math.max(150, ...lines.map((line) => ctx.measureText(line).width + 24));
  const height = 20 + lines.length * 18;
  ctx.beginPath();
  ctx.roundRect?.(10, 10, width, height, 7);
  if (!ctx.roundRect) ctx.rect(10, 10, width, height);
  ctx.fill();
  ctx.stroke();
  let y = 30;
  ctx.fillStyle = COLORS.text;
  for (const badge of badges) {
    ctx.fillText(badge, 22, y);
    y += 18;
  }
  for (const item of legend) {
    ctx.fillStyle = item.color;
    ctx.fillRect(22, y - 9, 10, 3);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(item.label, 38, y);
    y += 18;
  }
  ctx.restore();
}

function createOverlayCanvas(doc, host) {
  let canvas = doc.getElementById('engineVisualOverlay');
  if (canvas) return canvas;
  canvas = doc.createElement('canvas');
  canvas.id = 'engineVisualOverlay';
  canvas.className = 'sse-visual-overlay';
  canvas.setAttribute('data-agent-id', 'engine-visual-overlay');
  canvas.setAttribute('aria-label', 'Result visualization overlay');
  host.appendChild(canvas);
  return canvas;
}

function createOverlayControls(doc, host) {
  let controls = doc.getElementById('engineVisualControls');
  if (controls) return controls;
  controls = doc.createElement('div');
  controls.id = 'engineVisualControls';
  controls.className = 'sse-visual-controls';
  controls.setAttribute('data-agent-id', 'engine-visual-controls');
  controls.innerHTML = [
    controlButton('showDeformed', 'Deform', 'engine-overlay-toggle-deformed'),
    controlButton('showUtilization', 'Ratio', 'engine-overlay-toggle-utilization'),
    controlButton('showLoads', 'Loads', 'engine-overlay-toggle-loads'),
    controlButton('showReactions', 'Reactions', 'engine-overlay-toggle-reactions'),
    controlButton('showModal', 'Mode', 'engine-overlay-toggle-modal'),
    controlButton('showPDelta', 'P-Delta', 'engine-overlay-toggle-pdelta'),
  ].join('');
  host.appendChild(controls);
  return controls;
}

function controlButton(key, label, id) {
  return `<button type="button" data-overlay-key="${key}" data-agent-id="${id}" aria-label="${label} overlay">${label}</button>`;
}

function bindOverlayControls(controls, overlay) {
  for (const button of controls.querySelectorAll('[data-overlay-key]')) {
    button.addEventListener('click', () => {
      const key = button.getAttribute('data-overlay-key');
      overlay.setOption(key, !overlay.state[key]);
    });
  }
}

function updateControlState(controls, state) {
  for (const button of controls.querySelectorAll('[data-overlay-key]')) {
    const key = button.getAttribute('data-overlay-key');
    button.classList.toggle('active', !!state[key]);
    button.setAttribute('aria-pressed', state[key] ? 'true' : 'false');
  }
}

function resizeOverlayCanvas(canvas, host) {
  const ratio = host.ownerDocument?.defaultView?.devicePixelRatio || 1;
  const rect = host.getBoundingClientRect?.() || { width: 900, height: 560 };
  const width = Math.max(240, Math.round(rect.width || 900));
  const height = Math.max(180, Math.round(rect.height || 560));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
}

function injectOverlayStyles(doc) {
  if (doc.getElementById('sseIndexOverlayStyles')) return;
  const style = doc.createElement('style');
  style.id = 'sseIndexOverlayStyles';
  style.textContent = `
    .sse-visual-overlay{position:absolute;inset:0;z-index:18;pointer-events:none}
    .sse-visual-controls{position:absolute;left:12px;top:52px;z-index:25;display:flex;gap:4px;flex-wrap:wrap;max-width:420px}
    .sse-visual-controls button{border:1px solid #cfd9e4;background:rgba(255,255,255,.9);color:#294056;border-radius:6px;padding:5px 7px;font:11px/1.2 "Segoe UI",Arial,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(20,42,62,.08)}
    .sse-visual-controls button.active{background:#00467f;border-color:#00467f;color:white}
  `;
  doc.head?.appendChild(style);
}

function formatRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (Math.abs(number) >= 10000 || (Math.abs(number) > 0 && Math.abs(number) < 0.001)) return number.toExponential(2);
  return number.toFixed(3).replace(/\.?0+$/, '');
}
