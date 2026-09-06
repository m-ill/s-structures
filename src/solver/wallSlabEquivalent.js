import { buildShellV1Trace } from './shell/quad4.js';
import { expandShellsToFrameLinks } from './shell/shellAssembly.js';
import {
  attachEquivalentShellScope,
  buildEquivalentShellScope,
  EQUIVALENT_SHELL_FORBIDDEN_RESULTS,
  EQUIVALENT_SHELL_SCOPE_VERSION,
  EQUIVALENT_SHELL_WARNING,
  sanitizeEquivalentShellResult,
} from './shell/equivalentScope.js';
import { buildSemiRigidRedistributionReport, expandSemiRigidDiaphragms } from './semiRigidDiaphragm.js';
import { materialOf } from '../core/catalogs.js';

export const WALL_SLAB_EQUIVALENT_VERSION = 'p3-m12-wall-slab-equivalent';
export const WALL_SLAB_TRACE_VERSION = 'p3-m12-wall-slab-trace-v1';

export function wallToMidPierMember(wall) {
  const z1 = Math.min(...wall.nodes.map((node) => node.z || 0));
  const z2 = Math.max(...wall.nodes.map((node) => node.z || 0));
  const cx = avg(wall.nodes, 'x'); const cy = avg(wall.nodes, 'y');
  const t = Number(wall.thickness || 0.2); const length = Number(wall.length || Math.max(1, wall.width || 1));
  const height = Math.max(0, z2 - z1);
  return {
    version: WALL_SLAB_EQUIVALENT_VERSION,
    nodes: [{ id: `${wall.id}-b`, x: cx, y: cy, z: z1 }, { id: `${wall.id}-t`, x: cx, y: cy, z: z2 }],
    member: { id: `${wall.id}-pier`, n1: `${wall.id}-b`, n2: `${wall.id}-t`, type: 'frame', secId: wall.secId || `${wall.id}-sec`, matId: wall.matId || 'concrete' },
    section: { id: wall.secId || `${wall.id}-sec`, version: 1, type: 'RECT', A: t * length, Iy: length * t ** 3 / 12, Iz: t * length ** 3 / 12, J: t * length * (t ** 2 + length ** 2) / 12, Zy: t * length ** 2 / 6, Zz: length * t ** 2 / 6 },
    sourceGeometry: { thickness: t, length, height, center: { x: cx, y: cy }, zRange: [z1, z2] },
  };
}

export function addWallMidPierToModel(model, wall) {
  const eq = wallToMidPierMember(wall);
  const nodes = [...(model.nodes || []), ...eq.nodes.map((node, index) => ({
    ...node,
    support: index === 0 && wall.baseSupport ? wall.baseSupport : node.support,
  }))];
  return {
    ...model,
    nodes,
    members: [...(model.members || []), eq.member],
    sections: [...(model.sections || []), eq.section],
    wallEquivalents: [...(model.wallEquivalents || []), {
      wallId: wall.id,
      memberId: eq.member.id,
      sectionId: eq.section.id,
      sourceGeometry: eq.sourceGeometry,
      section: eq.section,
    }],
  };
}

export function recoverWallPierForces(model, analysis) {
  const result = analysis?.envelope || Object.values(analysis?.byCombo || {})[0] || null;
  return (model.wallEquivalents || []).map((row) => {
    const member = result?.memberResults?.[row.memberId] || {};
    return {
      version: WALL_SLAB_EQUIVALENT_VERSION,
      wallId: row.wallId,
      memberId: row.memberId,
      N: maxAbs(member.N),
      Vy: maxAbs(member.Vy),
      Vz: maxAbs(member.Vz),
      My: maxAbs(member.My),
      Mz: maxAbs(member.Mz),
      source: 'mid-pier-equivalent',
      warnings: [EQUIVALENT_SHELL_WARNING],
      limitations: ['Wall pier forces are recovered from a mid-pier equivalent frame member, not shell local stresses.'],
    };
  });
}

export function summarizeSemiRigidDiaphragm(model = {}) {
  const expansion = expandSemiRigidDiaphragms(model);
  const rows = (model.diaphragms || []).map((item) => ({
    id: item.id,
    type: item.type,
    nodeCount: item.nodeIds?.length || 0,
    stiffness: item.inPlaneStiffness || null,
    solverTreatment: item.type === 'semiRigid' ? 'equivalent-truss-brace-grid' : 'rigid-condensed',
    generatedBraceCount: expansion.rows.find((row) => row.id === item.id)?.braceCount || 0,
    warnings: item.type === 'semiRigid' ? [EQUIVALENT_SHELL_WARNING] : [],
  }));
  return {
    version: WALL_SLAB_EQUIVALENT_VERSION,
    semiRigidCount: rows.filter((row) => row.type === 'semiRigid').length,
    rows,
    warnings: rows.some((row) => row.type === 'semiRigid') ? [EQUIVALENT_SHELL_WARNING] : [],
    limitations: ['Semi-rigid diaphragm redistribution is an equivalent brace-grid load-path trace, not shell local force recovery.'],
  };
}

export function buildWallSlabEquivalentTrace(model = {}, analysis = null) {
  const pierForces = analysis ? recoverWallPierForces(model, analysis) : [];
  const diaphragm = summarizeSemiRigidDiaphragm(model);
  const redistribution = buildSemiRigidRedistributionReport(model, analysis || {});
  const shell = buildShellV1Trace(model);
  const shellAssembly = analysis?.byCombo
    ? Object.values(analysis.byCombo).find((result) => result?.shellFrameAssembly)?.shellFrameAssembly || expandShellsToFrameLinks(model)
    : expandShellsToFrameLinks(model);
  shell.assembly = shellAssembly;
  const summary = {
    wallEquivalentCount: (model.wallEquivalents || []).length,
    recoveredWallForceCount: pierForces.length,
    semiRigidDiaphragmCount: diaphragm.semiRigidCount,
    shellCount: shell.shellCount,
    shellLinkCount: shellAssembly.linkCount || 0,
    shellSkippedCount: (shellAssembly.rows || []).filter((row) => row.status === 'skipped').length,
    slabRedistributionStatus: redistribution.status,
    slabRedistributionSampleCount: redistribution.sampledRows || 0,
  };
  summary.ticketCoverage = buildTicketCoverage(summary);
  const shellGuard = sanitizeEquivalentShellResult(shell);
  const equivalentScope = buildEquivalentShellScope(model, {
    forceActive: summary.wallEquivalentCount > 0 || summary.shellCount > 0 || summary.semiRigidDiaphragmCount > 0,
  });
  return attachEquivalentShellScope({
    version: WALL_SLAB_TRACE_VERSION,
    equivalentVersion: WALL_SLAB_EQUIVALENT_VERSION,
    phase6ScopeVersion: EQUIVALENT_SHELL_SCOPE_VERSION,
    contract: {
      milestone: 'P3-M12',
      tickets: ['P3-T73', 'P3-T74', 'P3-T75'],
      scope: ['mid-pier-wall-equivalent', 'pier-force-recovery', 'shell-v1-contract', 'shell-frame-link-assembly', 'semi-rigid-diaphragm-redistribution'],
      featureTicketMap: {
        wallMidPier: 'P3-T73',
        pierForceRecovery: 'P3-T73',
        shellV1: 'P3-T74',
        shellFrameLinkAssembly: 'P3-T74',
        semiRigidDiaphragm: 'P3-T75',
        slabRedistribution: 'P3-T75',
      },
      solverTreatment: {
        wall: 'mid-pier-equivalent-frame-member',
        shell: 'preliminary-edge-and-diagonal-frame-links',
        diaphragm: 'equivalent-truss-brace-grid',
      },
      phase6Scope: {
        milestone: 'P6-M6',
        scopeVersion: EQUIVALENT_SHELL_SCOPE_VERSION,
        warning: EQUIVALENT_SHELL_WARNING,
        forbiddenResults: EQUIVALENT_SHELL_FORBIDDEN_RESULTS.slice(),
      },
      reviewFields: ['summary.ticketCoverage', 'wallMidPier.rows', 'wallMidPier.forces', 'shell.rows', 'shell.assembly.rows', 'slab.redistribution'],
      limitations: [
        'full-24-dof-shell-global-stiffness-assembly-not-certified',
        'shell-stress-recovery-and-automatic-meshing-not-included',
        'semi-rigid-diaphragm-is-preliminary-in-plane-redistribution',
        'wall-opening-auto-decomposition-not-included',
      ],
    },
    summary,
    review: buildWallSlabReview(summary),
    wallMidPier: {
      count: (model.wallEquivalents || []).length,
      rows: (model.wallEquivalents || []).map((row) => buildWallMidPierTraceRow(row, model, pierForces)),
      forces: pierForces,
    },
    diaphragm,
    shell: {
      ...shellGuard.result,
      assembly: shellAssembly,
      forbiddenFieldGuard: shellGuard.guard,
    },
    slab: {
      status: redistribution.status,
      redistribution,
      limitation: 'Semi-rigid diaphragm uses an equivalent truss brace grid for preliminary in-plane redistribution; shell slab membrane assembly remains future hardening.',
      warnings: [EQUIVALENT_SHELL_WARNING],
    },
  }, model, { forceActive: equivalentScope.active });
}

function buildWallMidPierTraceRow(row, model, pierForces) {
  const force = pierForces.find((item) => item.wallId === row.wallId) || null;
  return {
    wallId: row.wallId,
    memberId: row.memberId,
    sectionId: row.sectionId,
    sourceGeometry: row.sourceGeometry || null,
    section: row.section || null,
    recoveryAvailable: Boolean(force),
    warnings: [EQUIVALENT_SHELL_WARNING],
    limitations: ['Wall mid-pier trace is an equivalent frame result; shell local stress around openings is not reported.'],
    cantileverHandcalc: buildCantileverWallHandcalc(row, model, force),
  };
}

function buildCantileverWallHandcalc(row, model, force) {
  if (!force) {
    return {
      status: 'force-recovery-required',
      method: 'V*h^3/(3*E*I)',
    };
  }
  const member = (model.members || []).find((item) => item.id === row.memberId);
  const material = member ? materialOf(model, member.matId) : {};
  const section = row.section || {};
  const height = Number(row.sourceGeometry?.height || 0);
  const E = Number(material.E || 0);
  const I = Math.max(Number(section.Iy || 0), Number(section.Iz || 0));
  const shear = Math.max(Math.abs(Number(force.Vy || 0)), Math.abs(Number(force.Vz || 0)));
  const moment = Math.max(Math.abs(Number(force.My || 0)), Math.abs(Number(force.Mz || 0)));
  const stiffness = E > 0 && I > 0 && height > 0 ? 3 * E * I / height ** 3 : null;
  return {
    status: stiffness ? 'available-preliminary' : 'insufficient-section-or-material',
    method: 'V*h^3/(3*E*I)',
    shear,
    moment,
    height,
    E: E || null,
    I: I || null,
    lateralStiffness: stiffness,
    estimatedTopDrift: stiffness ? shear / stiffness : null,
    equivalentBaseMoment: shear * height,
    momentRecoveryDelta: moment ? Math.abs(moment - shear * height) : null,
    review: 'cantilever-wall-handcalc-preliminary',
  };
}

function buildWallSlabReview(summary) {
  const coverage = summary.ticketCoverage || [];
  const uncovered = coverage.filter((row) => !row.covered).map((row) => row.ticket);
  const blockers = uncovered.map((ticket) => `uncovered-${ticket}`);
  if (summary.wallEquivalentCount > 0 && summary.recoveredWallForceCount === 0) blockers.push('wall-pier-force-recovery-missing');
  if (summary.shellSkippedCount > 0) blockers.push('shell-frame-assembly-skipped');
  return {
    traceReady: blockers.length === 0,
    coverageComplete: uncovered.length === 0,
    coverageReviewRequired: uncovered.length > 0,
    wallMidPierReady: coverage.find((row) => row.ticket === 'P3-T73')?.covered === true,
    shellFrameLinkReady: coverage.find((row) => row.ticket === 'P3-T74')?.covered === true,
    semiRigidRedistributionReady: coverage.find((row) => row.ticket === 'P3-T75')?.covered === true,
    preliminarySolverTreatment: true,
    engineerReviewRequired: true,
    productionReady: false,
    uncoveredTickets: uncovered,
    blockers,
    agentDecision: uncovered.length
      ? 'complete-wall-slab-ticket-coverage-before-review'
      : blockers.length
        ? 'fix-wall-slab-trace-before-review'
      : 'wall-slab-equivalent-ready-for-engineering-review',
  };
}

function buildTicketCoverage(summary) {
  return [
    {
      ticket: 'P3-T73',
      scope: 'wall-mid-pier-and-pier-force',
      covered: summary.wallEquivalentCount > 0 && summary.recoveredWallForceCount > 0,
      evidence: `${summary.wallEquivalentCount} wall equivalents / ${summary.recoveredWallForceCount} recovered force rows`,
    },
    {
      ticket: 'P3-T74',
      scope: 'shell-v1-and-frame-link-assembly',
      covered: summary.shellLinkCount > 0 && summary.shellSkippedCount === 0,
      evidence: `${summary.shellCount} shells / ${summary.shellLinkCount} frame links / ${summary.shellSkippedCount} skipped`,
    },
    {
      ticket: 'P3-T75',
      scope: 'semi-rigid-diaphragm-redistribution',
      covered: summary.semiRigidDiaphragmCount > 0 && summary.slabRedistributionStatus === 'available' && summary.slabRedistributionSampleCount > 0,
      evidence: `${summary.semiRigidDiaphragmCount} semi-rigid diaphragms / redistribution ${summary.slabRedistributionStatus} / ${summary.slabRedistributionSampleCount} sampled rows`,
    },
  ];
}

function avg(nodes, key) {
  return nodes.reduce((sum, node) => sum + Number(node[key] || 0), 0) / Math.max(1, nodes.length);
}

function maxAbs(values = []) {
  return values.length ? Math.max(...values.map((value) => Math.abs(Number(value || 0)))) : 0;
}
