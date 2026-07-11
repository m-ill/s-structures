export const RESULT_CHARTS_VERSION = 'p7-m11-elastic-result-charts-v2';

const SERIES_COLORS = ['#005a8d', '#1f8a58', '#d88716', '#8a5fb8', '#c34747', '#4f7c8f'];

export function buildCapacityChart(curve = [], options = {}) {
  const points = (curve || []).map((point, index) => ({
    x: finite(point.controlDisplacement ?? point.displacement ?? index),
    y: finite(point.baseShear ?? point.shear ?? point.loadFactor),
  }));
  return buildSvgLineChart(points, {
    id: options.id || 'ssChartCapacitySvg',
    title: options.title || 'Capacity curve',
    xLabel: options.xLabel || 'd',
    yLabel: options.yLabel || 'V',
    marker: options.firstYield ? {
      x: finite(options.firstYield.controlDisplacement ?? options.firstYield.displacement),
      y: finite(options.firstYield.baseShear ?? options.firstYield.shear),
    } : null,
  });
}

export function buildTimeHistoryChart(rows = [], options = {}) {
  const points = (rows || []).map((row, index) => ({
    x: finite(row.time ?? index),
    y: finite(row.displacement ?? row.value ?? row.response),
  }));
  return buildSvgLineChart(points, {
    id: options.id || 'ssChartTimeHistorySvg',
    title: options.title || 'Time history',
    xLabel: options.xLabel || 't',
    yLabel: options.yLabel || 'd',
    signedY: true,
  });
}

export function buildSpectrumChart(payload = {}, options = {}) {
  const combined = Object.entries(payload?.combined || {});
  if (combined.length && options.view !== 'input') {
    const baseShearAvailable = combined.some(([, row]) => finiteOrNull(row?.baseShear ?? row?.rsaBaseShear) != null);
    return buildBarChart(combined.map(([direction, row]) => ({
      label: direction.toUpperCase(),
      value: baseShearAvailable
        ? finite(row?.baseShear ?? row?.rsaBaseShear)
        : finite(row?.participatingMassRatio),
    })), {
      id: options.id || 'ssChartSpectrumSvg',
      title: options.title || (baseShearAvailable ? 'RSA combined base shear' : 'RSA participating mass'),
      yLabel: options.yLabel || (baseShearAvailable ? 'V' : 'ratio'),
    });
  }
  const spectrumPoints = payload?.spectrum?.points || payload?.points || [];
  if (spectrumPoints.length) {
    return buildSvgLineChart(spectrumPoints.map((point, index) => ({
      x: finite(point.period ?? point.t ?? point.x ?? index),
      y: finite(point.acceleration ?? point.sa ?? point.y),
    })), {
      id: options.id || 'ssChartSpectrumSvg',
      title: options.title || 'Response spectrum',
      xLabel: options.xLabel || 'T',
      yLabel: options.yLabel || 'Sa',
    });
  }
  return buildBarChart(combined.map(([direction, row]) => ({
    label: direction,
    value: finite(row?.baseShear ?? row?.storyShear ?? row?.participatingMassRatio),
  })), {
    id: options.id || 'ssChartSpectrumSvg',
    title: options.title || 'Response spectrum',
    yLabel: options.yLabel || 'RSA',
  });
}

export function buildModalParticipationChart(modes = [], options = {}) {
  const directions = options.directions || ['x', 'y', 'z'];
  const hasDirectionalParticipation = (modes || []).some((mode) => (
    directions.some((direction) => finiteOrNull(mode?.participation?.[direction]?.massRatio) != null)
  ));
  if (hasDirectionalParticipation) {
    return buildGroupedBarChart((modes || []).map((mode, index) => ({
      label: String(mode.index ?? mode.id ?? index + 1),
      values: directions.map((direction) => ({
        label: direction.toUpperCase(),
        value: finite(mode?.participation?.[direction]?.massRatio),
      })),
    })), {
      id: options.id || 'ssChartModalSvg',
      title: options.title || 'Modal participating mass ratio',
      yLabel: options.yLabel || 'ratio',
      series: directions.map((direction) => direction.toUpperCase()),
    });
  }
  return buildBarChart((modes || []).map((mode, index) => ({
    label: String(mode.index ?? mode.id ?? index + 1),
    value: finite(mode.participatingMassRatio ?? mode.massRatio ?? mode.effectiveMassRatio),
  })), {
    id: options.id || 'ssChartModalSvg',
    title: options.title || 'Modal participation',
    yLabel: options.yLabel || 'ratio',
  });
}

export function buildMultiSeriesLineChart(series = [], options = {}) {
  const width = positive(options.width, 440);
  const height = positive(options.height, 180);
  const pad = { left: 40, right: 12, top: 16, bottom: 34 };
  const cleanSeries = (series || []).map((item, seriesIndex) => ({
    label: String(item.label ?? `Series ${seriesIndex + 1}`),
    color: item.color || SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
    dash: item.dash || '',
    points: (item.points || []).map((point, index) => ({
      x: finite(point.x ?? index),
      y: finite(point.y),
    })),
  })).filter((item) => item.points.length);
  const allPoints = cleanSeries.flatMap((item) => item.points);
  const xValues = allPoints.map((point) => point.x);
  const yValues = allPoints.map((point) => point.y);
  const xMin = Math.min(0, ...xValues);
  const xMax = Math.max(1e-9, ...xValues);
  const yAbs = Math.max(1e-9, ...yValues.map((value) => Math.abs(value)));
  const yMin = options.signedY || yValues.some((value) => value < 0) ? -yAbs : 0;
  const yMax = Math.max(yAbs, ...yValues);
  const xSpan = Math.max(1e-9, xMax - xMin);
  const ySpan = Math.max(1e-9, yMax - yMin);
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const sx = (value) => pad.left + ((value - xMin) / xSpan) * plotWidth;
  const sy = (value) => pad.top + ((yMax - value) / ySpan) * plotHeight;
  const grid = [0, 0.5, 1].map((ratio) => {
    const y = pad.top + ratio * plotHeight;
    return `<line x1="${pad.left}" y1="${round(y)}" x2="${width - pad.right}" y2="${round(y)}" stroke="currentColor" stroke-opacity="0.10"/>`;
  }).join('');
  const lines = cleanSeries.map((item) => {
    const points = item.points.map((point) => `${round(sx(point.x))},${round(sy(point.y))}`).join(' ');
    const circles = item.points.length <= 16
      ? item.points.map((point) => `<circle cx="${round(sx(point.x))}" cy="${round(sy(point.y))}" r="2.2" fill="${escapeAttr(item.color)}"><title>${escapeText(item.label)}: ${formatChartNumber(point.y)}</title></circle>`).join('')
      : '';
    return `<polyline points="${points}" fill="none" stroke="${escapeAttr(item.color)}" stroke-width="2"${item.dash ? ` stroke-dasharray="${escapeAttr(item.dash)}"` : ''}/>${circles}`;
  }).join('');
  const legends = cleanSeries.slice(0, 6).map((item, index) => {
    const x = pad.left + index * Math.max(54, plotWidth / Math.max(1, Math.min(6, cleanSeries.length)));
    return `<line x1="${round(x)}" y1="${height - 11}" x2="${round(x + 12)}" y2="${height - 11}" stroke="${escapeAttr(item.color)}" stroke-width="3"/><text x="${round(x + 16)}" y="${height - 8}" fill="currentColor" font-size="9">${escapeText(item.label)}</text>`;
  }).join('');
  const axes = `<line x1="${pad.left}" y1="${round(sy(0))}" x2="${width - pad.right}" y2="${round(sy(0))}" stroke="currentColor" stroke-opacity="0.28"/><line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="currentColor" stroke-opacity="0.28"/>`;
  const labels = `<text x="${width - pad.right}" y="${height - pad.bottom + 14}" text-anchor="end" fill="currentColor" font-size="9">${escapeText(options.xLabel || '')}</text><text x="4" y="${pad.top + 5}" fill="currentColor" font-size="9">${escapeText(options.yLabel || '')}</text>`;
  return {
    version: RESULT_CHARTS_VERSION,
    kind: 'multi-line',
    pointCount: allPoints.length,
    seriesCount: cleanSeries.length,
    xMax,
    yMax,
    svg: `<svg id="${escapeAttr(options.id || 'ssResultMultiLineSvg')}" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeAttr(options.title || 'Result chart')}" preserveAspectRatio="xMidYMid meet">${grid}${axes}${lines}${labels}${legends}</svg>`,
  };
}

export function buildGroupedBarChart(groups = [], options = {}) {
  const width = positive(options.width, 440);
  const height = positive(options.height, 180);
  const pad = { left: 38, right: 12, top: 16, bottom: 36 };
  const clean = (groups || []).map((group, groupIndex) => ({
    label: String(group.label ?? groupIndex + 1),
    values: (group.values || []).map((row, seriesIndex) => ({
      label: String(row.label ?? options.series?.[seriesIndex] ?? seriesIndex + 1),
      value: finite(row.value),
      color: row.color || SERIES_COLORS[seriesIndex % SERIES_COLORS.length],
    })),
  })).filter((group) => group.values.length);
  const allValues = clean.flatMap((group) => group.values.map((row) => row.value));
  const maxValue = Math.max(1e-9, ...allValues.map((value) => Math.abs(value)));
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const groupWidth = plotWidth / Math.max(1, clean.length);
  const bars = clean.map((group, groupIndex) => {
    const innerWidth = Math.max(2, groupWidth - 6);
    const barWidth = Math.max(2, innerWidth / Math.max(1, group.values.length) - 2);
    const rows = group.values.map((row, seriesIndex) => {
      const h = Math.abs(row.value) / maxValue * plotHeight;
      const x = pad.left + groupIndex * groupWidth + 3 + seriesIndex * (barWidth + 2);
      const y = height - pad.bottom - h;
      return `<rect x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(h)}" fill="${escapeAttr(row.color)}"><title>${escapeText(group.label)} ${escapeText(row.label)}: ${formatChartNumber(row.value)}</title></rect>`;
    }).join('');
    const labelEvery = Math.max(1, Math.ceil(clean.length / 8));
    const label = groupIndex % labelEvery === 0
      ? `<text x="${round(pad.left + groupIndex * groupWidth + groupWidth / 2)}" y="${height - pad.bottom + 13}" text-anchor="middle" fill="currentColor" font-size="8">${escapeText(group.label)}</text>`
      : '';
    return rows + label;
  }).join('');
  const labels = [...new Set(clean.flatMap((group) => group.values.map((row) => row.label)))];
  const legend = labels.slice(0, 6).map((label, index) => {
    const x = pad.left + index * Math.max(54, plotWidth / Math.max(1, Math.min(6, labels.length)));
    return `<rect x="${round(x)}" y="${height - 10}" width="8" height="8" fill="${SERIES_COLORS[index % SERIES_COLORS.length]}"/><text x="${round(x + 11)}" y="${height - 3}" fill="currentColor" font-size="9">${escapeText(label)}</text>`;
  }).join('');
  const axes = `<line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="currentColor" stroke-opacity="0.28"/><line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="currentColor" stroke-opacity="0.28"/>`;
  return {
    version: RESULT_CHARTS_VERSION,
    kind: 'grouped-bar',
    pointCount: allValues.length,
    groupCount: clean.length,
    yMax: maxValue,
    svg: `<svg id="${escapeAttr(options.id || 'ssResultGroupedBarSvg')}" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${escapeAttr(options.title || 'Result chart')}" preserveAspectRatio="xMidYMid meet">${axes}${bars}<text x="4" y="${pad.top + 5}" fill="currentColor" font-size="9">${escapeText(options.yLabel || '')}</text>${legend}</svg>`,
  };
}

export function buildSvgLineChart(points = [], options = {}) {
  const width = positive(options.width, 220);
  const height = positive(options.height, 84);
  const pad = 10;
  const usableWidth = width - pad * 2;
  const usableHeight = height - pad * 2;
  const clean = (points || []).map((point, index) => ({
    x: finite(point.x ?? index),
    y: finite(point.y),
  }));
  const xMax = Math.max(1e-9, ...clean.map((point) => Math.abs(point.x)));
  const yValues = clean.map((point) => point.y);
  const yMax = Math.max(1e-9, ...yValues.map((value) => Math.abs(value)));
  const yMin = options.signedY ? -yMax : 0;
  const ySpan = Math.max(1e-9, yMax - yMin);
  const polyline = clean.map((point) => {
    const x = pad + (Math.abs(point.x) / xMax) * usableWidth;
    const y = height - pad - ((point.y - yMin) / ySpan) * usableHeight;
    return `${round(x)},${round(y)}`;
  }).join(' ');
  const zeroY = options.signedY ? height - pad - ((0 - yMin) / ySpan) * usableHeight : height - pad;
  const marker = options.marker ? chartMarker(options.marker, { pad, width, height, xMax, yMin, ySpan, usableWidth, usableHeight }) : '';
  const axis = `<line x1="${pad}" y1="${round(zeroY)}" x2="${width - pad}" y2="${round(zeroY)}" stroke="currentColor" stroke-opacity="0.22"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="currentColor" stroke-opacity="0.22"/>`;
  const svg = `<svg id="${escapeAttr(options.id || 'ssResultChartSvg')}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeAttr(options.title || 'Result chart')}">${axis}<polyline points="${polyline}" fill="none" stroke="currentColor" stroke-width="2"/>${marker}</svg>`;
  return {
    version: RESULT_CHARTS_VERSION,
    kind: 'line',
    pointCount: clean.length,
    xMax,
    yMax,
    svg,
  };
}

export function buildBarChart(rows = [], options = {}) {
  const width = positive(options.width, 220);
  const height = positive(options.height, 84);
  const pad = 10;
  const clean = (rows || []).map((row, index) => ({
    label: String(row.label ?? index + 1),
    value: finite(row.value),
  }));
  const maxValue = Math.max(1e-9, ...clean.map((row) => Math.abs(row.value)));
  const barWidth = clean.length ? Math.max(4, (width - pad * 2) / clean.length - 4) : 0;
  const bars = clean.map((row, index) => {
    const h = (Math.abs(row.value) / maxValue) * (height - pad * 2);
    const x = pad + index * ((width - pad * 2) / Math.max(1, clean.length)) + 2;
    const y = height - pad - h;
    return `<rect x="${round(x)}" y="${round(y)}" width="${round(barWidth)}" height="${round(h)}" fill="currentColor" opacity="0.82"><title>${escapeText(row.label)} ${formatChartNumber(row.value)}</title></rect>`;
  }).join('');
  const axis = `<line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="currentColor" stroke-opacity="0.22"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}" stroke="currentColor" stroke-opacity="0.22"/>`;
  const svg = `<svg id="${escapeAttr(options.id || 'ssResultBarChartSvg')}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeAttr(options.title || 'Result chart')}">${axis}${bars}</svg>`;
  return {
    version: RESULT_CHARTS_VERSION,
    kind: 'bar',
    pointCount: clean.length,
    xMax: clean.length,
    yMax: maxValue,
    svg,
  };
}

function chartMarker(marker, scale) {
  const x = scale.pad + (Math.abs(finite(marker.x)) / scale.xMax) * scale.usableWidth;
  const y = scale.height - scale.pad - ((finite(marker.y) - scale.yMin) / scale.ySpan) * scale.usableHeight;
  return `<circle cx="${round(x)}" cy="${round(y)}" r="3" fill="currentColor"/>`;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Number(value).toFixed(1);
}

function formatChartNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const absolute = Math.abs(number);
  if (absolute !== 0 && (absolute < 0.01 || absolute >= 10000)) return number.toExponential(3);
  return number.toFixed(4).replace(/\.?0+$/, '');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
