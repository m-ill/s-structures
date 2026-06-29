import { materialOf, sectionOf } from '../core/catalogs.js';
import { migrateToV3, validateModel } from '../core/model.js';
import { analyzeDynamics } from '../dynamics/modal.js';
import { vlen } from '../core/vector.js';
import { runDesignChecks } from '../design/steel.js';
import {
  analyzeComponent3D,
  summarizeSolverDiagnostics,
} from './linear3dAssembly.js';
import { memberAxes } from './linear3dElement.js';
import {
  buildEquilibriumSummary,
  comboSnapshot,
  connectedComponentGroups,
  createSelfWeightLoads,
  defaultCombos,
  makeEnvelope,
} from './linear3dPost.js';

export { analyzeComponent3D, assembleStiffness3D } from './linear3dAssembly.js';
export { AXIS, localK12, memberAxes, solveLinear } from './linear3dElement.js';
export { defaultCombos, makeEnvelope } from './linear3dPost.js';

export function analyzeModel(inputModel) {
  const model = migrateToV3(inputModel);
  const validation = model.analysisSettings?.validateBeforeSolve === false
    ? { errors: [], warnings: [] }
    : validateModel(model);
  const output = { ok: validation.errors.length === 0, validation, model };

  if (!model.members?.length) {
    output.ok = false;
    output.empty = true;
    return output;
  }
  if (!output.ok) return output;

  const combos = model.loadCombinations?.length ? model.loadCombinations : defaultCombos(model);
  output.combos = combos;
  output.byCombo = {};
  for (const combo of combos) {
    const result = analyzeAll(model, combo.factors);
    result.combo = comboSnapshot(combo);
    output.byCombo[combo.id] = result;
  }
  output.envelope = makeEnvelope(output.byCombo, combos);
  if (model.analysisSettings?.includeGeometricStiffness) {
    output.pDelta = analyzePDeltaCombinations(model, combos);
  }
  if (model.analysisSettings?.responseSpectrum?.enabled !== false) {
    output.dynamics = analyzeDynamics(model);
  }
  output.design = runDesignChecks(model, output, {
    resultSet: output.pDelta?.ok ? output.pDelta.envelope : output.envelope,
  });

  const first = output.byCombo[combos[0]?.id];
  if (first?.unstableMembers?.size) {
    validation.errors.push({
      code: 'SINGULAR',
      message: 'The structure has unstable members or an unsolved stiffness matrix.',
      target: [...first.unstableMembers].join(','),
    });
    output.ok = false;
  }

  return output;
}

export function analyzeAll(model, factors = null, options = {}) {
  const nodes = model.nodes || [];
  const members = model.members || [];
  if (!members.length) return { ok: false, empty: true };

  const analysisSettings = model.analysisSettings || {};
  let loads = [...(model.loads || [])];
  if (analysisSettings.includeSelfWeight) {
    loads = loads.concat(createSelfWeightLoads(model));
  }

  const scaleFn = options.scale;
  if (factors || scaleFn) {
    loads = loads
      .map((load) => {
        let factor = 1;
        if (factors) {
          const loadFactor = factors[load.case || 'LC1'];
          if (loadFactor == null || loadFactor === 0) return null;
          factor *= loadFactor;
        }
        if (scaleFn) {
          factor *= scaleFn(load);
          if (factor === 0) return null;
        }
        const scaled = { ...load };
        if (scaled.P != null) scaled.P *= factor;
        if (scaled.w != null) scaled.w *= factor;
        if (scaled.M != null) scaled.M *= factor;
        return scaled;
      })
      .filter(Boolean);
  }
  if (Array.isArray(options.extraLoads) && options.extraLoads.length) {
    loads = loads.concat(options.extraLoads.map((load) => ({ ...load })));
  }

  const ctx = {
    mat: (id) => materialOf(model, id),
    sec: (id) => sectionOf(model, id),
    stations: Math.max(21, analysisSettings.memberStations | 0 || 21),
  };

  const groups = connectedComponentGroups(nodes, members);
  const out = {
    ok: true,
    disp: {},
    reactions: {},
    memberResults: {},
    solver: {
      type: 'linear_static_3d_frame',
      components: [],
    },
    unstableMembers: new Set(),
    dmax: 0,
    anyOk: false,
    maxRatio: 0,
    ngCount: 0,
    okCount: 0,
  };

  for (const group of Object.values(groups)) {
    const ns = nodes.filter((node) => group.nids.has(node.id));
    const ms = members.filter((member) => group.mids.has(member.id));
    const ls = loads.filter((load) => (
      (load.node && group.nids.has(load.node)) ||
      (load.member && group.mids.has(load.member))
    ));
    const result = analyzeComponent3D(ns, ms, ls, ctx);
    if (!result.ok) {
      group.mids.forEach((id) => out.unstableMembers.add(id));
      continue;
    }
    out.anyOk = true;
    out.solver.components.push(result.solver);
    Object.assign(out.disp, result.disp);
    Object.assign(out.reactions, result.reactions);
    Object.assign(out.memberResults, result.memberResults);
  }

  for (const id of Object.keys(out.disp)) {
    out.dmax = Math.max(out.dmax, vlen(out.disp[id].slice(0, 3)));
  }
  for (const id of Object.keys(out.memberResults)) {
    const memberResult = out.memberResults[id];
    out.dmax = Math.max(out.dmax, memberResult.dmaxM);
    out.maxRatio = Math.max(out.maxRatio, memberResult.check.ratio);
    if (memberResult.check.ok) out.okCount += 1;
    else out.ngCount += 1;
  }

  if (!out.anyOk) {
    out.ok = false;
    out.reason = 'NO_SOLVED_COMPONENT';
  } else if (out.unstableMembers.size) {
    out.ok = false;
    out.reason = 'UNSTABLE_COMPONENT';
  }
  out.solver = summarizeSolverDiagnostics(out.solver.components);
  out.summary = buildEquilibriumSummary(nodes, members, loads, out);
  return out;
}

export function analyzePDeltaCombinations(model, combos) {
  const byCombo = {};
  for (const combo of combos) {
    byCombo[combo.id] = analyzePDelta(model, combo.factors, model.analysisSettings || {});
    if (byCombo[combo.id].result) byCombo[combo.id].result.combo = comboSnapshot(combo);
  }
  const finalByCombo = {};
  for (const combo of combos) {
    finalByCombo[combo.id] = byCombo[combo.id].result;
  }
  const envelope = makeEnvelope(finalByCombo, combos);
  const summary = summarizePDelta(byCombo);
  return {
    enabled: true,
    ok: Object.values(byCombo).some((item) => item.ok),
    byCombo,
    envelope,
    summary,
  };
}

export function analyzePDelta(model, factors = null, settings = {}) {
  const maxIterations = Math.max(1, settings.pDeltaMaxIterations | 0 || 12);
  const tolerance = Number(settings.pDeltaTolerance) > 0 ? Number(settings.pDeltaTolerance) : 1e-4;
  const maxAmplification = Number(settings.pDeltaMaxAmplification) > 0 ? Number(settings.pDeltaMaxAmplification) : 2.5;
  const linear = analyzeAll(model, factors);
  const iterations = [{
    iteration: 0,
    maxDisplacement: linear.summary?.maxDisplacement || 0,
    amplification: 1,
    secondaryLoad: 0,
    residual: null,
  }];
  if (!linear.ok) {
    return {
      ok: false,
      converged: false,
      reason: linear.reason || 'LINEAR_FAILED',
      linear,
      result: linear,
      iterations,
      amplification: 1,
      warnings: [{ code: 'PDELTA_LINEAR_FAILED', message: 'Linear seed result failed.' }],
    };
  }

  let previous = linear;
  let result = linear;
  let converged = false;
  let reason = 'MAX_ITERATIONS';

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const pLoads = makePDeltaLoads(model, previous, { iteration });
    const next = analyzeAll(model, factors, { extraLoads: pLoads.loads });
    if (!next.ok) {
      result = next;
      reason = next.reason || 'PDELTA_FAILED';
      iterations.push({
        iteration,
        maxDisplacement: null,
        amplification: null,
        secondaryLoad: pLoads.total,
        residual: null,
      });
      break;
    }
    const previousD = previous.summary?.maxDisplacement || 0;
    const nextD = next.summary?.maxDisplacement || 0;
    const linearD = linear.summary?.maxDisplacement || 0;
    const residual = Math.abs(nextD - previousD) / Math.max(1e-12, Math.abs(nextD));
    const amplification = linearD > 0 ? nextD / linearD : 1;
    next.pDeltaLoads = pLoads.loads;
    next.pDelta = {
      iteration,
      secondaryLoad: pLoads.total,
      amplification,
      residual,
    };
    iterations.push({
      iteration,
      maxDisplacement: nextD,
      amplification,
      secondaryLoad: pLoads.total,
      residual,
    });
    result = next;
    previous = next;
    if (residual <= tolerance) {
      converged = true;
      reason = 'CONVERGED';
      break;
    }
    if (amplification > maxAmplification) {
      reason = 'AMPLIFICATION_LIMIT';
      break;
    }
  }

  const finalAmp = iterations.at(-1)?.amplification ?? 1;
  const warnings = [];
  if (!converged) warnings.push({ code: 'PDELTA_NOT_CONVERGED', message: reason });
  if (finalAmp > maxAmplification) warnings.push({ code: 'PDELTA_HIGH_AMPLIFICATION', message: `Amplification ${finalAmp.toFixed(3)} exceeds limit.` });

  result.pDelta = {
    enabled: true,
    converged,
    reason,
    amplification: finalAmp,
    iterations,
    warnings,
  };

  return {
    ok: result.ok && converged,
    converged,
    reason,
    linear,
    result,
    iterations,
    amplification: finalAmp,
    warnings,
  };
}

export function makePDeltaLoads(model, result, options = {}) {
  const nodes = Object.fromEntries((model.nodes || []).map((node) => [node.id, node]));
  const loads = [];
  let total = 0;
  const iteration = options.iteration || 1;
  for (const member of model.members || []) {
    const demand = result.memberResults?.[member.id];
    const a = nodes[member.n1];
    const b = nodes[member.n2];
    if (!demand || !a || !b) continue;
    const axis = demand.ax || memberAxes(a, b, member.localAxis);
    if (Math.abs(axis.x?.[2] || 0) < 0.5) continue;
    const length = axis.L || Math.hypot(b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0));
    if (!(length > 1e-9)) continue;
    const top = (b.z || 0) >= (a.z || 0) ? b : a;
    const bottom = top === b ? a : b;
    const topDisp = result.disp?.[top.id] || [0, 0, 0];
    const bottomDisp = result.disp?.[bottom.id] || [0, 0, 0];
    const drift = [
      topDisp[0] - bottomDisp[0],
      topDisp[1] - bottomDisp[1],
      0,
    ];
    const driftMagnitude = Math.hypot(drift[0], drift[1]);
    if (driftMagnitude < 1e-12) continue;
    const axial = Math.abs(demand.Nmax || 0);
    if (axial < 1e-9) continue;
    const force = axial * driftMagnitude / length;
    if (!(force > 1e-12)) continue;
    total += force;
    loads.push({
      id: `PD${iteration}_${member.id}`,
      type: 'nodal',
      node: top.id,
      P: force,
      direction: [drift[0] / driftMagnitude, drift[1] / driftMagnitude, 0],
      case: 'PDELTA',
      source: 'pdelta',
      member: member.id,
    });
  }
  return { loads, total };
}

function summarizePDelta(byCombo) {
  let governing = null;
  let convergedCount = 0;
  let maxAmplification = 1;
  for (const [comboId, item] of Object.entries(byCombo || {})) {
    if (item.converged) convergedCount += 1;
    if (Number(item.amplification) > maxAmplification) maxAmplification = item.amplification;
    if (!governing || Number(item.amplification) > Number(governing.amplification)) {
      governing = { comboId, amplification: item.amplification, converged: item.converged, reason: item.reason };
    }
  }
  return {
    convergedCount,
    comboCount: Object.keys(byCombo || {}).length,
    maxAmplification,
    governing,
  };
}
