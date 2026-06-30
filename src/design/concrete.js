import { materialOf, sectionOf } from '../core/catalogs.js';
import { attachMemberDemandTrace } from './designDemandTraceAttach.js';

export function runConcreteDesign(model, analysis, options = {}) {
  const resultSet = options.resultSet || analysis?.envelope || firstSolvedResult(analysis);
  const memberResults = {};
  const warnings = [];
  const summary = {
    checkedMembers: 0,
    skippedMembers: 0,
    okCount: 0,
    warnCount: 0,
    ngCount: 0,
    maxUtilization: 0,
    governing: null,
  };

  if (!resultSet?.memberResults) {
    return {
      ok: false,
      type: 'rc_preliminary',
      memberResults,
      summary,
      warnings: [{ code: 'NO_ANALYSIS_RESULT', message: 'No solved analysis result is available for RC design.' }],
    };
  }

  for (const member of model.members || []) {
    const demand = resultSet.memberResults[member.id];
    if (!demand) {
      summary.skippedMembers += 1;
      continue;
    }
    const material = materialOf(model, member.matId);
    const section = sectionOf(model, member.secId);
    if (!isConcreteMember(member, material, section)) {
      summary.skippedMembers += 1;
      continue;
    }

    const check = attachMemberDemandTrace(
      checkConcreteMember(member, demand, section, material, model.designParams || {}, resultSet),
      options.demandPackage,
      member.id,
    );
    memberResults[member.id] = check;
    summary.checkedMembers += 1;
    if (check.status === 'NG') summary.ngCount += 1;
    else if (check.status === 'WARN') summary.warnCount += 1;
    else summary.okCount += 1;

    if (check.utilization > summary.maxUtilization) {
      summary.maxUtilization = check.utilization;
      summary.governing = {
        memberId: member.id,
        checkId: check.governingCheck,
        status: check.status,
        ratio: check.utilization,
        comboId: check.comboId,
        x: check.x,
      };
    }
    for (const item of check.messages) warnings.push({ memberId: member.id, ...item });
  }

  return {
    ok: summary.ngCount === 0,
    type: 'rc_preliminary',
    memberResults,
    summary,
    warnings,
  };
}

export function checkConcreteMember(member, demand, section, material, designParams = {}, resultSet = {}) {
  const rc = designParams.rc || {};
  const local = designParams.members?.[member.id] || {};
  const warnAt = finite(local.warnAtRatio, rc.warnAtRatio, designParams.global?.warnAtRatio, 0.7);
  const props = concreteSectionProps(section, local, rc);
  const role = memberRole(demand);
  const combo = demand.governing?.utilization || {};
  const x = finite(combo.x, 0);
  const fy = finite(local.rebarFy, rc.defaultRebarFy, 400);
  const fc = concreteStrengthMpa(material);
  const phiFlexure = finite(local.phiFlexure, rc.phiFlexure, 0.85);
  const phiShear = finite(local.phiShear, rc.phiShear, 0.75);
  const phiCompression = finite(local.phiCompression, rc.phiCompression, 0.65);
  const provided = providedRebarAreas(role, props, local, rc);
  const flexureZ = flexureCheck('rc-flexure-z', 'Strong-axis flexure', demand.Mzmax, props.bz, props.dz, provided.AsZ, fy, phiFlexure, fc);
  const flexureY = flexureCheck('rc-flexure-y', 'Weak-axis flexure', demand.Mymax, props.by, props.dy, provided.AsY, fy, phiFlexure, fc);
  const shearZ = shearCheck('rc-shear-z', 'Shear local-z', demand.Vzmax, props.bz, props.dz, fy, phiShear, fc);
  const shearY = shearCheck('rc-shear-y', 'Shear local-y', demand.Vymax, props.by, props.dy, fy, phiShear, fc);
  const axial = axialCheck(demand.Nmax, props, provided.AsTotal, fy, phiCompression, fc);
  const interaction = {
    id: 'rc-column-interaction',
    name: 'Axial + flexure',
    demand: axial.ratio + Math.max(flexureZ.ratio, flexureY.ratio),
    capacity: 1,
    ratio: role === 'column' ? axial.ratio + Math.max(flexureZ.ratio, flexureY.ratio) : 0,
    expression: 'P/Pn + max(Mz/Mnz, My/Mny)',
    required: null,
    provided: provided.AsTotal,
  };

  const checks = [flexureZ, flexureY, shearZ, shearY, axial, interaction].map((item) => ({
    ...item,
    ratio: cleanRatio(item.ratio),
    status: statusForRatio(item.ratio, warnAt),
    comboId: combo.comboId || demand.check?.comboId || resultSet.combo?.id || null,
    x,
  }));
  const governing = checks.reduce((best, item) => (!best || item.ratio > best.ratio ? item : best), null);
  const messages = rebarMessages(provided, props, rc).concat(
    checks
      .filter((item) => item.status !== 'OK')
      .map((item) => ({ code: item.id.toUpperCase().replace(/-/g, '_'), level: item.status === 'NG' ? 'error' : 'warning', message: `${item.name} ratio ${item.ratio.toFixed(3)}.` })),
  );

  return {
    memberId: member.id,
    materialId: member.matId,
    sectionId: member.secId,
    type: 'concrete',
    role,
    method: 'rc_preliminary_strength',
    ok: governing?.status !== 'NG',
    status: governing?.status || 'OK',
    utilization: governing?.ratio || 0,
    governingCheck: governing?.id || null,
    comboId: governing?.comboId || null,
    x: governing?.x || 0,
    checks,
    demands: {
      N: demand.Nmax,
      Vy: demand.Vymax,
      Vz: demand.Vzmax,
      My: demand.Mymax,
      Mz: demand.Mzmax,
    },
    requiredRebar: {
      AsZ: flexureZ.required,
      AsY: flexureY.required,
      AvsZ: shearZ.required,
      AvsY: shearY.required,
    },
    providedRebar: provided,
    section: props,
    material: { fc, fy },
    messages,
  };
}

export function concreteSectionProps(section, local = {}, rc = {}) {
  const dims = section.dims || {};
  const b = finite(local.b, dims.B, 300) / 1000;
  const h = finite(local.h, dims.H, 600) / 1000;
  const cover = finite(local.cover, rc.defaultCover, 0.05);
  return {
    b,
    h,
    cover,
    bz: b,
    hz: h,
    dz: Math.max(h * 0.5, h - cover),
    by: h,
    hy: b,
    dy: Math.max(b * 0.5, b - cover),
    Ag: section.A || b * h,
  };
}

function flexureCheck(id, name, moment, b, d, providedAs, fy, phi, fc) {
  const demand = Math.abs(Number(moment) || 0);
  const z = 0.9 * d * 1000;
  const required = z > 0 && fy > 0 && phi > 0 ? (demand * 1e6) / (phi * fy * z) : 0;
  const capacity = flexureCapacity(providedAs, fy, z, phi);
  return {
    id,
    name,
    demand,
    capacity,
    ratio: capacity > 0 ? demand / capacity : 0,
    expression: 'Mu / phiMn',
    required,
    provided: providedAs,
    fc,
  };
}

function shearCheck(id, name, shear, b, d, fy, phi, fc) {
  const demand = Math.abs(Number(shear) || 0);
  const vc = 0.17 * Math.sqrt(Math.max(fc, 0)) * b * 1000 * d * 1000 / 1000;
  const capacity = phi * vc;
  const required = demand > capacity && fy > 0 && d > 0
    ? ((demand / phi) - vc) * 1000 / (fy * d * 1000)
    : 0;
  return {
    id,
    name,
    demand,
    capacity,
    ratio: capacity > 0 ? demand / capacity : 0,
    expression: 'Vu / phiVc',
    required,
    provided: null,
  };
}

function axialCheck(axialForce, props, providedAs, fy, phi, fc) {
  const demand = Math.abs(Number(axialForce) || 0);
  const ag = props.Ag * 1e6;
  const concreteArea = Math.max(0, ag - providedAs);
  const capacity = phi * (0.85 * fc * concreteArea + fy * providedAs) / 1000;
  return {
    id: 'rc-axial',
    name: 'Axial compression',
    demand,
    capacity,
    ratio: capacity > 0 ? demand / capacity : 0,
    expression: 'Pu / phiPn',
    required: null,
    provided: providedAs,
  };
}

function flexureCapacity(asMm2, fy, zMm, phi) {
  return phi * asMm2 * fy * zMm / 1e6;
}

function providedRebarAreas(role, props, local, rc) {
  const beamRatio = finite(local.beamRebarRatio, rc.defaultBeamRebarRatio, 0.01);
  const columnRatio = finite(local.columnRebarRatio, rc.defaultColumnRebarRatio, 0.015);
  const ratio = role === 'column' ? columnRatio : beamRatio;
  const asZ = finite(local.AsZ, local.As, ratio * props.bz * props.dz * 1e6);
  const asY = finite(local.AsY, local.As, ratio * props.by * props.dy * 1e6);
  const asTotal = finite(local.AsTotal, local.As, role === 'column' ? ratio * props.Ag * 1e6 : Math.max(asZ, asY));
  return {
    AsZ: asZ,
    AsY: asY,
    AsTotal: asTotal,
    ratio: asTotal / Math.max(1, props.Ag * 1e6),
  };
}

function rebarMessages(provided, props, rc) {
  const messages = [];
  const minBeam = finite(rc.minBeamRebarRatio, 0.002);
  const minColumn = finite(rc.minColumnRebarRatio, 0.01);
  const maxColumn = finite(rc.maxColumnRebarRatio, 0.04);
  const beamRatioZ = provided.AsZ / Math.max(1, props.bz * props.dz * 1e6);
  if (beamRatioZ < minBeam) messages.push({ code: 'RC_MIN_BEAM_REBAR', level: 'warning', message: 'Beam reinforcement ratio is below the preliminary minimum.' });
  if (provided.ratio < minColumn) messages.push({ code: 'RC_MIN_COLUMN_REBAR', level: 'warning', message: 'Column reinforcement ratio is below the preliminary minimum.' });
  if (provided.ratio > maxColumn) messages.push({ code: 'RC_MAX_COLUMN_REBAR', level: 'warning', message: 'Column reinforcement ratio is above the preliminary maximum.' });
  return messages;
}

function concreteStrengthMpa(material) {
  return (material.Fy || material.fc || material.fb || 24000) / 1000;
}

function isConcreteMember(member, material, section) {
  const text = `${material?.id || member.matId || ''} ${material?.name || ''}`.toLowerCase();
  return text.includes('concrete') || String(section?.type || '').toUpperCase() === 'RECT';
}

function memberRole(demand) {
  const z = Math.abs(demand.ax?.x?.[2] || 0);
  if (z > 0.7) return 'column';
  if ((demand.Nmax || 0) > Math.max(demand.Mymax || 0, demand.Mzmax || 0)) return 'column';
  return 'beam';
}

function statusForRatio(ratio, warnAt) {
  if (ratio > 1) return 'NG';
  if (ratio >= warnAt) return 'WARN';
  return 'OK';
}

function cleanRatio(value) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function finite(...values) {
  for (const value of values) {
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function firstSolvedResult(analysis) {
  if (!analysis?.byCombo) return null;
  return Object.values(analysis.byCombo).find((result) => result?.ok) || null;
}
