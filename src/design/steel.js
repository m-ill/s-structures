import { materialOf, sectionOf } from '../core/catalogs.js';
import { runConcreteDesign } from './concrete.js';

export function runDesignChecks(model, analysis, options = {}) {
  const resultSet = options.resultSet;
  const steel = runSteelDesign(model, analysis, { ...(options.steel || {}), resultSet });
  const concrete = runConcreteDesign(model, analysis, { ...(options.concrete || {}), resultSet });
  const governing = [steel.summary.governing, concrete.summary.governing]
    .filter(Boolean)
    .reduce((best, item) => (!best || item.ratio > best.ratio ? item : best), null);
  return {
    ok: steel.ok && concrete.ok,
    steel,
    concrete,
    summary: {
      ok: steel.ok && concrete.ok,
      maxUtilization: Math.max(steel.summary.maxUtilization, concrete.summary.maxUtilization),
      governing,
      checkedMembers: steel.summary.checkedMembers + concrete.summary.checkedMembers,
      skippedMembers: steel.summary.skippedMembers + concrete.summary.skippedMembers,
      ngCount: steel.summary.ngCount + concrete.summary.ngCount,
      warnCount: steel.summary.warnCount + concrete.summary.warnCount,
    },
  };
}

export function runSteelDesign(model, analysis, options = {}) {
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
      type: 'steel_allowable_preliminary',
      memberResults,
      summary,
      warnings: [{ code: 'NO_ANALYSIS_RESULT', message: 'No solved analysis result is available for steel design.' }],
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
    if (!isSteelMember(member, material, section)) {
      summary.skippedMembers += 1;
      continue;
    }

    const check = checkSteelMember(member, demand, section, material, model.designParams || {}, resultSet);
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
    type: 'steel_allowable_preliminary',
    memberResults,
    summary,
    warnings,
  };
}

export function checkSteelMember(member, demand, section, material, designParams = {}, resultSet = {}) {
  const global = designParams.global || {};
  const local = designParams.members?.[member.id] || {};
  const warnAt = finite(local.warnAtRatio, global.warnAtRatio, 0.7);
  const L = demand.L || 0;
  const role = memberRole(demand);
  const ky = finite(local.Ky, global.defaultKy, 1);
  const kz = finite(local.Kz, global.defaultKz, 1);
  const limitKL = finite(local.compressionSlendernessLimit, global.defaultCompressionSlendernessLimit, 200);
  const deflectionLimit = finite(local.deflectionLimitTotal, global.defaultDeflectionLimitTotal, 250);
  const allow = steelAllowables(material, section);
  const combo = demand.governing?.utilization || {};
  const x = finite(combo.x, 0);

  const checks = [
    ratioCheck('steel-axial', 'Axial', demand.Nmax, allow.Pa, 'max |N| / Pa'),
    ratioCheck('steel-flexure-z', 'Strong-axis flexure', demand.Mzmax, allow.Maz, 'max |Mz| / Maz'),
    ratioCheck('steel-flexure-y', 'Weak-axis flexure', demand.Mymax, allow.May, 'max |My| / May'),
    ratioCheck('steel-shear-y', 'Shear local-y', demand.Vymax, allow.Vay, 'max |Vy| / Vay'),
    ratioCheck('steel-shear-z', 'Shear local-z', demand.Vzmax, allow.Vaz, 'max |Vz| / Vaz'),
  ];

  const axial = checks.find((item) => item.id === 'steel-axial');
  const flexureZ = checks.find((item) => item.id === 'steel-flexure-z');
  const flexureY = checks.find((item) => item.id === 'steel-flexure-y');
  checks.push({
    id: 'steel-interaction',
    name: 'Axial + flexure',
    demand: axial.demand + flexureZ.demand + flexureY.demand,
    capacity: 1,
    ratio: axial.ratio + flexureZ.ratio + flexureY.ratio,
    expression: 'N/Pa + Mz/Maz + My/May',
  });

  const slenderness = {
    ky,
    kz,
    KLry: section.ry ? (ky * L) / section.ry : null,
    KLrz: section.rz ? (kz * L) / section.rz : null,
    limit: limitKL,
  };
  const maxKL = Math.max(slenderness.KLry || 0, slenderness.KLrz || 0);
  const needsSlendernessCheck = role === 'column' || role === 'brace' || (demand.Nmax || 0) > allow.Pa * 0.01;
  checks.push({
    id: 'steel-slenderness',
    name: 'Slenderness',
    demand: maxKL,
    capacity: limitKL,
    ratio: needsSlendernessCheck && limitKL > 0 ? maxKL / limitKL : 0,
    expression: 'max(KL/ry, KL/rz) / limit',
  });

  const deflectionAllow = deflectionLimit > 0 && L > 0 ? L / deflectionLimit : Infinity;
  checks.push({
    id: 'steel-deflection',
    name: 'Deflection',
    demand: demand.dmaxM || 0,
    capacity: deflectionAllow,
    ratio: Number.isFinite(deflectionAllow) && deflectionAllow > 0 ? (demand.dmaxM || 0) / deflectionAllow : 0,
    expression: 'member deformation / (L / limit)',
  });

  const normalizedChecks = checks.map((item) => ({
    ...item,
    ratio: cleanRatio(item.ratio),
    status: statusForRatio(item.ratio, warnAt),
    comboId: combo.comboId || demand.check?.comboId || resultSet.combo?.id || null,
    x,
  }));

  const governing = normalizedChecks.reduce((best, item) => (
    !best || item.ratio > best.ratio ? item : best
  ), null);
  const status = governing?.status || 'OK';
  const messages = normalizedChecks
    .filter((item) => item.id === 'steel-slenderness' && item.status !== 'OK')
    .map((item) => ({ code: 'STEEL_SLENDERNESS', level: item.status === 'NG' ? 'error' : 'warning', message: `Slenderness ratio ${item.ratio.toFixed(3)}.` }));

  return {
    memberId: member.id,
    materialId: member.matId,
    sectionId: member.secId,
    type: 'steel',
    role,
    method: 'allowable_stress_preliminary',
    ok: status !== 'NG',
    status,
    utilization: governing?.ratio || 0,
    governingCheck: governing?.id || null,
    comboId: governing?.comboId || null,
    x: governing?.x || 0,
    checks: normalizedChecks,
    demands: {
      N: demand.Nmax,
      Vy: demand.Vymax,
      Vz: demand.Vzmax,
      My: demand.Mymax,
      Mz: demand.Mzmax,
      dmax: demand.dmaxM,
    },
    capacities: allow,
    slenderness,
    deflection: {
      limit: deflectionLimit,
      allowable: deflectionAllow,
      demand: demand.dmaxM || 0,
    },
    messages,
  };
}

export function steelAllowables(material, section) {
  const Fa = material.fa || material.fb;
  const Fb = material.fb;
  const Fv = material.fs;
  return {
    Fa,
    Fb,
    Fv,
    Pa: section.A * Fa,
    Maz: section.Zz * Fb,
    May: section.Zy * Fb,
    Vay: (section.A * Fv) / 1.5,
    Vaz: (section.A * Fv) / 1.5,
  };
}

function ratioCheck(id, name, demand, capacity, expression) {
  const value = Math.abs(Number(demand) || 0);
  return {
    id,
    name,
    demand: value,
    capacity,
    ratio: capacity > 0 ? value / capacity : 0,
    expression,
  };
}

function isSteelMember(member, material, section) {
  const materialText = `${material?.id || member.matId || ''} ${material?.name || ''}`.toLowerCase();
  const sectionType = String(section?.type || '').toUpperCase();
  return materialText.includes('steel') || ['H', 'BOX', 'PIPE', 'TUBE'].includes(sectionType);
}

function memberRole(demand) {
  const z = Math.abs(demand.ax?.x?.[2] || 0);
  if (z > 0.7) return 'column';
  if ((demand.Nmax || 0) > Math.max(demand.Mymax || 0, demand.Mzmax || 0)) return 'brace';
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
