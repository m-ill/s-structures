import { materialOf, sectionOf } from '../core/catalogs.js';
import { attachMemberDemandTrace } from './designDemandTraceAttach.js';
import { validateSectionGeometry } from '../materials/sectionProperties.js';

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
  const getMaterial = options.materialOf || ((id) => materialOf(model, id));
  const getSection = options.sectionOf || ((id) => sectionOf(model, id));

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
    const material = getMaterial(member.matId);
    const section = getSection(member.secId);
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
    else if (check.status === 'NOT_CHECKED') summary.notCheckedCount = (summary.notCheckedCount || 0) + 1;
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
    ok: summary.ngCount === 0 && !summary.notCheckedCount,
    type: 'rc_preliminary',
    memberResults,
    summary,
    warnings,
  };
}

export function checkConcreteMember(member, demand, section, material, designParams = {}, resultSet = {}) {
  try {
    return calculateConcreteMember(member, demand, section, material, designParams, resultSet);
  } catch (error) {
    if (!String(error.code || '').startsWith('RC_')) throw error;
    return { memberId: member.id, materialId: member.matId, sectionId: member.secId, type: 'concrete',
      method: 'rc_preliminary_strength', calculationVersion: 'p21-rc-v2', ok: false, status: 'NOT_CHECKED',
      utilization: null, requiredRebar: { AsZ: null, AsY: null, AvsZ: null, AvsY: null }, role: ['beam','column'].includes(member.design?.role) ? member.design.role : null, governingCheck: 'rc-input', comboId: resultSet.combo?.id || null,
      checks: [{ id: 'rc-input', status: 'NOT_CHECKED', ratio: null, code: error.code, reason: error.message }],
      messages: [{ code: error.code, level: 'warning', message: error.message }],
      designTransferAllowed: false };
  }
}

function calculateConcreteMember(member, demand, section, material, designParams, resultSet) {
  const rc = designParams.rc || {};
  const local = designParams.members?.[member.id] || {};
  validateRcInputs(local, rc, demand);
  const warnAt = finite(local.warnAtRatio, rc.warnAtRatio, designParams.global?.warnAtRatio, 0.7);
  const props = concreteSectionProps(section, local, rc);
  const role = memberRole(member, demand);
  const combo = demand.governing?.utilization || {};
  const x = finite(combo.x, 0);
  const fy = finite(local.rebarFy, rc.defaultRebarFy, 400);
  const fc = concreteStrengthMpa(material);
  if (!(fc > 0 && Number.isFinite(fc))) invalid('RC_MATERIAL_INVALID', 'Concrete strength is required.');
  const phiFlexure = finite(local.phiFlexure, rc.phiFlexure, 0.85);
  const phiShear = finite(local.phiShear, rc.phiShear, 0.75);
  const phiCompression = finite(local.phiCompression, rc.phiCompression, 0.65);
  const provided = providedRebarAreas(role, props, local, rc);
  if (![provided.AsZ, provided.AsY, provided.AsTotal].every(value => value > 0 && value < props.Ag * 1e6)) {
    invalid('RC_REINFORCEMENT_INVALID', 'Positive reinforcement areas smaller than the gross section area are required.');
  }
  const flexureZ = flexureCheck('rc-flexure-z', 'Strong-axis flexure', demand.Mzmax, props.bz, props.dz, provided.AsZ, fy, phiFlexure, fc);
  const flexureY = flexureCheck('rc-flexure-y', 'Weak-axis flexure', demand.Mymax, props.by, props.dy, provided.AsY, fy, phiFlexure, fc);
  const shearZ = shearCheck('rc-shear-z', 'Shear local-z', demand.Vzmax, props.by, props.dy, fy, phiShear, fc);
  const shearY = shearCheck('rc-shear-y', 'Shear local-y', demand.Vymax, props.bz, props.dz, fy, phiShear, fc);
  const signedAxial = Array.isArray(demand.N) && demand.N.length && demand.N.every(Number.isFinite) ? demand.N : null;
  const compression = signedAxial ? Math.max(0, ...signedAxial.map(value => -value)) : Math.abs(demand.Nmax);
  const axial = axialCheck(compression, props, provided.AsTotal, fy, phiCompression, fc);
  if (!signedAxial && demand.Nmax !== 0) Object.assign(axial, { status: 'NOT_CHECKED', ratio: null, reason: 'Signed axial demand required.' });
  const interaction = {
    id: 'rc-column-interaction',
    name: 'Axial + flexure',
    demand: axial.ratio + Math.max(flexureZ.ratio, flexureY.ratio),
    capacity: 1,
    ratio: null,
    status: role === 'column' ? 'NOT_CHECKED' : 'N_A',
    expression: 'P/Pn + max(Mz/Mnz, My/Mny)',
    required: null,
    provided: provided.AsTotal,
  };
  if (role === 'column' && signedAxial && resultSet.combo?.id
      && ['My','Mz','xs'].every(key => Array.isArray(demand[key]) && demand[key].length === signedAxial.length && demand[key].every(Number.isFinite))) {
    const tuples = signedAxial.map((N, i) => ({ x: demand.xs[i], N, My: demand.My[i], Mz: demand.Mz[i],
      ratio: Math.max(0,-N)/axial.capacity + Math.max(Math.abs(demand.Mz[i])/flexureZ.capacity,Math.abs(demand.My[i])/flexureY.capacity) }));
    const concurrent = tuples.reduce((best, item) => !best || item.ratio > best.ratio ? item : best, null);
    Object.assign(interaction, { ratio: concurrent.ratio, status: undefined, x: concurrent.x, concurrentDemand: concurrent,
      comboId: resultSet.combo.id, demand: concurrent.ratio });
  }
  const tension = signedAxial && signedAxial.some(value => value > 1e-9)
    ? [{ id: 'rc-axial-tension', name: 'Axial tension', ratio: null, status: 'NOT_CHECKED', reason: 'Tension reinforcement design is outside this preliminary compression screen.' }] : [];

  for (const [item, quantity] of [[flexureZ,'Mz'],[flexureY,'My'],[shearZ,'Vz'],[shearY,'Vy'],[axial,'N']]) {
    const values = demand[quantity];
    if (resultSet.combo?.id && Array.isArray(values) && values.length && values.every(Number.isFinite)
        && demand.xs?.length === values.length) {
      const magnitude = value => quantity === 'N' ? Math.max(0,-value) : Math.abs(value);
      const station = values.reduce((best, value, i) => magnitude(value) > magnitude(values[best]) ? i : best, 0);
      Object.assign(item, { comboId: resultSet.combo.id, x: demand.xs[station], signedDemand: values[station] });
    } else {
      const source = demand.governing?.quantities?.[`${quantity}max`];
      Object.assign(item, { comboId: source?.comboId || null, x: source?.x ?? null });
    }
  }

  const checks = [flexureZ, flexureY, shearZ, shearY, axial, interaction, ...tension].map((item) => ({
    ...item,
    ratio: item.ratio === null ? null : cleanRatio(item.ratio),
    status: item.status || statusForRatio(item.ratio, warnAt),
    comboId: Object.hasOwn(item, 'comboId') ? item.comboId : resultSet.combo?.id || null,
    x: Object.hasOwn(item, 'x') ? item.x : null,
  }));
  const governing = checks.filter(item => item.ratio !== null).reduce((best, item) => (!best || item.ratio > best.ratio ? item : best), null);
  const incomplete = checks.some(item => item.status === 'NOT_CHECKED');
  const messages = rebarMessages(provided, props, rc, role).concat(
    checks
      .filter((item) => ['NG','WARN','NOT_CHECKED'].includes(item.status))
      .map((item) => ({ code: item.id.toUpperCase().replace(/-/g, '_'), level: item.status === 'NG' ? 'error' : 'warning', message: item.ratio === null ? item.reason || `${item.name} requires concurrent signed demands.` : `${item.name} ratio ${item.ratio.toFixed(3)}.` })),
  );

  return {
    memberId: member.id,
    materialId: member.matId,
    sectionId: member.secId,
    type: 'concrete',
    role,
    method: 'rc_preliminary_strength',
    calculationVersion: 'p21-rc-v2',
    reinforcementBasis: Object.keys(local).some(key => ['As','AsZ','AsY','AsTotal'].includes(key)) ? 'provided-areas-preliminary' : 'assumed-reinforcement-ratio',
    designTransferAllowed: false,
    ok: governing?.status !== 'NG' && !incomplete,
    status: governing?.status === 'NG' ? 'NG' : incomplete ? 'NOT_CHECKED' : governing?.status || 'OK',
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
  validateRcInputs(local, rc);
  if (!section) invalid('RC_SECTION_MISSING', 'A concrete section is required.');
  const shape = String(section.shape || section.type || '').toUpperCase();
  if (!['SQUARE','RECT'].includes(shape)) invalid('RC_SECTION_UNSUPPORTED', `Preliminary RC geometry does not support ${shape || 'missing shape'}.`);
  const geometry = validateSectionGeometry(shape, section.params || section.dims || {});
  if (!geometry.ok) invalid('RC_SECTION_INVALID', geometry.errors.join(', '));
  const b = finite(local.b, geometry.params.B) / 1000;
  const h = finite(local.h, shape === 'SQUARE' ? geometry.params.B : geometry.params.H) / 1000;
  const cover = finite(local.cover, rc.defaultCover, 0.05);
  if (!(b > 0 && h > 0 && cover >= 0 && cover < Math.min(b,h)/2)) invalid('RC_GEOMETRY_INVALID', 'Dimensions and cover must define a positive effective depth.');
  if (shape === 'SQUARE' && Math.abs(b-h) > 1e-10) invalid('RC_SQUARE_MISMATCH', 'Square design dimensions must be equal.');
  const area = section.A ?? section.properties?.A ?? b*h;
  if (!Number.isFinite(area) || area <= 0 || Math.abs(area-b*h) > 1e-8*Math.max(area,b*h)) invalid('RC_AREA_GEOMETRY_MISMATCH', 'Gross area differs from rectangular geometry; an explicit qualified effective-section contract is required.');
  return {
    b,
    h,
    cover,
    bz: b,
    hz: h,
    dz: h - cover,
    by: h,
    hy: b,
    dy: b - cover,
    Ag: area,
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

function rebarMessages(provided, props, rc, role) {
  const messages = [];
  const minBeam = finite(rc.minBeamRebarRatio, 0.002);
  const minColumn = finite(rc.minColumnRebarRatio, 0.01);
  const maxColumn = finite(rc.maxColumnRebarRatio, 0.04);
  const beamRatioZ = provided.AsZ / Math.max(1, props.bz * props.dz * 1e6);
  if (role === 'beam' && beamRatioZ < minBeam) messages.push({ code: 'RC_MIN_BEAM_REBAR', level: 'warning', message: 'Beam reinforcement ratio is below the preliminary minimum.' });
  if (role === 'column' && provided.ratio < minColumn) messages.push({ code: 'RC_MIN_COLUMN_REBAR', level: 'warning', message: 'Column reinforcement ratio is below the preliminary minimum.' });
  if (role === 'column' && provided.ratio > maxColumn) messages.push({ code: 'RC_MAX_COLUMN_REBAR', level: 'warning', message: 'Column reinforcement ratio is above the preliminary maximum.' });
  return messages;
}

function concreteStrengthMpa(material) {
  return (material.Fy ?? material.fc ?? material.fb) / 1000;
}

function isConcreteMember(member, material, section) {
  const kind = String(material?.kind || material?.category || '').toLowerCase();
  if (kind === 'concrete' || material?.strength?.concrete) return true;
  if (kind === 'steel' || kind === 'timber' || material?.strength?.steel) return false;
  const text = `${material?.id || member.matId || ''} ${material?.name || ''}`.toLowerCase();
  return text.includes('concrete') || String(section?.type || '').toUpperCase() === 'RECT';
}

function memberRole(member, demand) {
  const explicit = member.design?.role;
  if (explicit && explicit !== 'auto') {
    if (!['beam','column'].includes(explicit)) invalid('RC_ROLE_UNSUPPORTED', `Unsupported RC role: ${explicit}`);
    return explicit;
  }
  const z = Math.abs(demand.ax?.x?.[2] || 0);
  if (z > 0.7) return 'column';
  return 'beam';
}

function statusForRatio(ratio, warnAt) {
  if (ratio > 1) return 'NG';
  if (ratio >= warnAt) return 'WARN';
  return 'OK';
}

function cleanRatio(value) {
  if (!Number.isFinite(value) || value < 0) invalid('RC_RATIO_INVALID', 'A non-finite or negative ratio cannot be reported as OK.');
  return value;
}

function finite(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

function invalid(code, message) { throw Object.assign(new Error(message), { code }); }

function validateRcInputs(local, rc, demand = null) {
  const keys = ['b','h','cover','rebarFy','As','AsZ','AsY','AsTotal','beamRebarRatio','columnRebarRatio','phiFlexure','phiShear','phiCompression','warnAtRatio',
    'defaultCover','defaultRebarFy','defaultBeamRebarRatio','defaultColumnRebarRatio','minBeamRebarRatio','minColumnRebarRatio','maxColumnRebarRatio'];
  for (const values of [local, rc]) for (const key of keys) if (Object.hasOwn(values,key)) {
    const v=values[key];
    if (v == null || v === '' || !Number.isFinite(Number(v)) || Number(v) <= 0 || (key.startsWith('phi') && Number(v)>1)) invalid('RC_INPUT_INVALID', `Invalid RC input: ${key}`);
  }
  if (demand) for (const key of ['Nmax','Mymax','Mzmax','Vymax','Vzmax']) if (demand[key] == null || !Number.isFinite(Number(demand[key])) || Number(demand[key]) < 0) invalid('RC_DEMAND_INVALID', `Finite nonnegative demand magnitude ${key} is required.`);
}

function firstSolvedResult(analysis) {
  if (!analysis?.byCombo) return null;
  return Object.values(analysis.byCombo).find((result) => result?.ok) || null;
}
