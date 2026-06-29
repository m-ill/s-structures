import {
  createNumberControl,
  createRibbonGroup,
  createSelectControl,
} from './indexNativeRibbonDom.js';

export const PUSHOVER_DIRECTIONS = ['+x', '-x', '+y', '-y'];
export const PUSHOVER_PATTERNS = ['triangular', 'uniform', 'mass'];

export function populateNonlinearRibbon(target) {
  const doc = target?.document;
  const panel = doc?.querySelector?.('[data-ss-ribbon-panel="nonlinear"]');
  if (!panel || panel.querySelector?.('[data-ss-nonlinear-ribbon="1"]')) return;

  const marker = doc.createElement('span');
  marker.setAttribute('data-ss-nonlinear-ribbon', '1');
  marker.style.display = 'none';
  panel.appendChild(marker);

  const setup = createRibbonGroup(doc, 'nonlinear-setup', '설정');
  const setupItems = setup.querySelector('[data-ss-ribbon-items]');
  setupItems.appendChild(createSelectControl(doc, {
    id: 'ssPushoverDirection',
    label: '방향',
    values: PUSHOVER_DIRECTIONS,
  }));
  setupItems.appendChild(createSelectControl(doc, {
    id: 'ssPushoverPattern',
    label: '패턴',
    values: PUSHOVER_PATTERNS,
  }));
  setupItems.appendChild(createNumberControl(doc, {
    id: 'ssPushoverSteps',
    label: '스텝',
    value: 8,
    min: 1,
    max: 80,
  }));
  panel.appendChild(setup);

  const runGroup = createRibbonGroup(doc, 'nonlinear-run', '실행');
  const runItems = runGroup.querySelector('[data-ss-ribbon-items]');
  const runButton = doc.createElement('button');
  runButton.type = 'button';
  runButton.className = 'ss-ribbon-command';
  runButton.id = 'ssRunPushover';
  runButton.setAttribute('data-ss-ribbon-item', 'run-pushover');
  runButton.setAttribute('data-agent-id', 'native-run-pushover');
  runButton.innerHTML = '<span class="ss-ribbon-icon">▶</span><span>Pushover</span>';
  runButton.addEventListener?.('click', () => runNativePushover(target));
  runItems.appendChild(runButton);

  const status = doc.createElement('span');
  status.id = 'ssPushoverStatus';
  status.className = 'ss-ribbon-status';
  status.textContent = '대기';
  status.setAttribute('data-ss-ribbon-item', 'pushover-status');
  status.setAttribute('data-agent-id', 'native-pushover-status');
  runItems.appendChild(status);
  panel.appendChild(runGroup);

  const curveGroup = createRibbonGroup(doc, 'nonlinear-curve', '곡선');
  const curveItems = curveGroup.querySelector('[data-ss-ribbon-items]');
  const curve = doc.createElement('div');
  curve.id = 'ssPushoverCurve';
  curve.className = 'ss-pushover-sparkline';
  curve.setAttribute('data-ss-ribbon-item', 'pushover-curve');
  curve.setAttribute('data-agent-id', 'native-pushover-curve');
  curveItems.appendChild(curve);
  panel.appendChild(curveGroup);
}

export function summarizeNativePushover(target) {
  const view = target?.SStructuresNativePushoverView;
  if (!view) return { available: false, status: 'Not run' };
  return {
    available: !!view.available,
    ok: !!view.ok,
    status: view.status || null,
    summary: view.summary || null,
    options: view.options || null,
  };
}

function runNativePushover(target) {
  const doc = target?.document;
  const status = doc?.getElementById?.('ssPushoverStatus');
  const curve = doc?.getElementById?.('ssPushoverCurve');
  const options = {
    direction: doc?.getElementById?.('ssPushoverDirection')?.value || '+x',
    pattern: doc?.getElementById?.('ssPushoverPattern')?.value || 'triangular',
    steps: Math.max(1, Math.trunc(Number(doc?.getElementById?.('ssPushoverSteps')?.value) || 8)),
  };

  try {
    const result = target?.SStructuresEngine?.runPushover?.(options)
      || target?.SStructuresAgent?.runPushover?.(options)
      || null;
    target.SStructuresNativePushoverView = buildNativePushoverView(result, options);
    if (status) status.textContent = target.SStructuresNativePushoverView.status;
    renderPushoverSparkline(curve, result);
    return target.SStructuresNativePushoverView;
  } catch (error) {
    target.SStructuresNativePushoverView = {
      available: false,
      status: error?.message || '실행 실패',
      options,
    };
    if (status) status.textContent = target.SStructuresNativePushoverView.status;
    if (curve) curve.innerHTML = '';
    return target.SStructuresNativePushoverView;
  }
}

function buildNativePushoverView(result, options) {
  if (!result) {
    return {
      available: false,
      status: '모델 없음',
      options,
    };
  }
  const stepCount = result.summary?.stepCount || result.curve?.length || 0;
  const baseShear = result.summary?.maxBaseShear || 0;
  const displacement = result.summary?.maxControlDisplacement || 0;
  return {
    available: true,
    ok: !!result.ok,
    status: `${result.ok ? 'OK' : 'WARN'} · ${stepCount} step · V=${formatNumber(baseShear)} · Δ=${formatNumber(displacement)}`,
    options,
    summary: {
      stepCount,
      maxBaseShear: baseShear,
      maxControlDisplacement: displacement,
      plasticMemberCount: result.summary?.plasticMemberCount || 0,
    },
    result,
  };
}

function renderPushoverSparkline(container, result) {
  if (!container) return;
  const curve = result?.curve || [];
  if (curve.length < 2) {
    container.innerHTML = '';
    return;
  }
  const width = 132;
  const height = 34;
  const maxX = Math.max(1e-9, ...curve.map((point) => Math.abs(Number(point.controlDisplacement) || 0)));
  const maxY = Math.max(1e-9, ...curve.map((point) => Math.abs(Number(point.baseShear) || 0)));
  const points = curve.map((point) => {
    const x = (Math.abs(Number(point.controlDisplacement) || 0) / maxX) * (width - 8) + 4;
    const y = height - 4 - (Math.abs(Number(point.baseShear) || 0) / maxY) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  if (Math.abs(number) >= 100) return number.toFixed(0);
  if (Math.abs(number) >= 10) return number.toFixed(1);
  return number.toFixed(3);
}
