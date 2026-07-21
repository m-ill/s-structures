import { memberHasPartialFixity } from '../../core/memberReleaseContract.js';
import { recoverMemberResult } from '../../solver/linear3dRecovery.js';
import { condenseReleasedDofs, matVec } from '../../solver/linear3dElement.js';

export const RSA_MEMBER_FORCE_RECOVERY_VERSION = 'p10-m3-rsa-member-force-recovery-v2';

const FORCE_KEYS = ['N', 'Vy', 'Vz'];
const MOMENT_KEYS = ['Tq', 'My', 'Mz'];
const STATION_KEYS = [...FORCE_KEYS, ...MOMENT_KEYS];
const END_FORCE_DIMENSIONS = [
  'force', 'force', 'force', 'moment', 'moment', 'moment',
  'force', 'force', 'force', 'moment', 'moment', 'moment',
];
const MEMBER_FORCE_DIMENSIONS = Object.freeze({
  station: 'length',
  axialForce: 'force',
  shearForce: 'force',
  torsion: 'moment',
  bendingMoment: 'moment',
  localTranslation: 'length',
  localRotation: 'angle',
});

export function createRsaMemberRecoveryContext(input = {}) {
  const model = input.model || {};
  const system = input.system || null;
  const members = input.members || model.members || [];
  const stationCount = Math.max(21, Number(input.stationCount) | 0 || 21);
  const blockers = scopeBlockers(model, system, members, input.diaphragmAssembly);
  const partialFixityMemberIds = members.filter(memberHasPartialFixity).map((member) => member.id);
  return {
    model,
    system,
    members,
    stationCount,
    blockers,
    partialFixityMemberIds,
    status: blockers.length ? 'unsupported' : 'available',
    scope: 'linear-elastic-frame-truss-modal-member-force-recovery',
  };
}

export function recoverModalMemberForces({
  mode,
  displacementVector,
  direction,
  provenance,
  units,
  recoveryContext,
}) {
  const blockers = [...(recoveryContext?.blockers || [])];
  if (mode?.residualRecovery?.status !== 'available' || mode?.residualRecovery?.passed !== true) {
    blockers.push(blocker(
      'MODE_RESIDUAL_BACK_SUBSTITUTION_UNQUALIFIED',
      mode?.id || null,
      'Massless free-DOF back-substitution or equilibrium check did not pass for this mode.',
    ));
  }
  const system = recoveryContext?.system;
  if (!Array.isArray(displacementVector) || displacementVector.length < Number(system?.ndof || 0)) {
    blockers.push(blocker(
      'FULL_MODAL_DISPLACEMENT_VECTOR_UNAVAILABLE',
      mode?.id || null,
      'Member recovery requires the full back-substituted modal displacement vector.',
    ));
  }
  if (blockers.length) return unsupportedModalRecovery(blockers, direction, mode, provenance, units);

  const rows = [];
  for (const member of recoveryContext.members) {
    const md = system.memData?.[member.id];
    if (!md) {
      blockers.push(blocker('RSA_MEMBER_NOT_ASSEMBLED', member.id, 'Member is absent from the modal stiffness assembly.'));
      continue;
    }
    try {
      const recovered = recoverMemberResult(
        member,
        md,
        displacementVector,
        [],
        recoveryContext.stationCount,
      );
      const checks = memberRecoveryChecks(md, displacementVector, recovered);
      if (!checks.passed) {
        blockers.push(blocker(
          'RSA_MEMBER_RECOVERY_CHECK_FAILED',
          member.id,
          checks.reasons.join(', '),
        ));
      }
      rows.push(memberRecoveryRow({
        member,
        mode,
        direction,
        recovered,
        checks,
        provenance,
        units,
      }));
    } catch (error) {
      blockers.push(blocker(
        'RSA_MEMBER_RECOVERY_FAILED',
        member.id,
        error?.message || String(error),
      ));
    }
  }

  const qualified = blockers.length === 0
    && rows.length === recoveryContext.members.length
    && rows.every((row) => row.qualification.qualified);
  const byMember = Object.fromEntries(rows.map((row) => [row.memberId, row]));
  return {
    version: RSA_MEMBER_FORCE_RECOVERY_VERSION,
    status: qualified ? 'available' : 'unsupported',
    designBlocked: !qualified,
    qualified,
    direction,
    modeId: mode?.id || null,
    stationCount: recoveryContext.stationCount,
    memberCount: rows.length,
    expectedMemberCount: recoveryContext.members.length,
    rows,
    byMember,
    blockers,
    partialFixityMemberIds: recoveryContext.partialFixityMemberIds || [],
    warnings: blockers.map((item) => `${item.code}: ${item.message}`),
    dimensions: MEMBER_FORCE_DIMENSIONS,
    units: memberForceUnits(units),
    qualification: {
      status: qualified ? 'qualified' : 'blocked',
      qualified,
      residualBackSubstitutionPassed: mode?.residualRecovery?.passed === true,
      memberAssemblyChecksPassed: rows.length > 0 && rows.every((row) => row.checks.assembly.passed),
      releaseChecksPassed: rows.length > 0 && rows.every((row) => row.checks.release.passed),
      partialFixityChecksPassed: rows.length > 0 && rows.every((row) => row.checks.partialFixity.passed),
      stationChecksPassed: rows.length > 0 && rows.every((row) => row.checks.stations.passed),
    },
    provenance: {
      ...provenance,
      source: 'full-modal-displacement-linear-member-recovery',
      modeId: mode?.id || null,
      direction,
      staticCaseReferences: [],
      staticMemberLoadReferences: [],
    },
  };
}

export function combineRsaMemberForces({
  responses,
  direction,
  method,
  dampingRatio,
  provenance,
  units,
  combineValues,
}) {
  const blockers = [];
  if (!responses.length) {
    blockers.push(blocker('RSA_MODAL_MEMBER_RESPONSES_UNAVAILABLE', direction, 'No modal member responses were produced.'));
  }
  for (const response of responses) {
    if (!response.memberForceRecovery?.qualified) {
      blockers.push(...(response.memberForceRecovery?.blockers || [blocker(
        'RSA_MODAL_MEMBER_RESPONSE_UNQUALIFIED',
        response.mode,
        'A modal member-force contributor is unqualified.',
      )]));
    }
  }
  if (blockers.length) return unsupportedCombination(blockers, direction, method, provenance, units);

  const memberIds = responses[0].memberForceRecovery.rows.map((row) => row.memberId);
  const expectedIds = memberIds.slice().sort().join('|');
  if (responses.some((response) => (
    response.memberForceRecovery.rows.map((row) => row.memberId).slice().sort().join('|') !== expectedIds
  ))) {
    blockers.push(blocker(
      'RSA_MODAL_MEMBER_COVERAGE_MISMATCH',
      direction,
      'Modal contributors do not contain the same assembled member set.',
    ));
    return unsupportedCombination(blockers, direction, method, provenance, units);
  }

  const members = [];
  for (const memberId of memberIds) {
    const contributors = responses.map((response) => response.memberForceRecovery.byMember[memberId]);
    const referenceXs = contributors[0].xs;
    if (contributors.some((row) => !sameStationGrid(referenceXs, row.xs))) {
      blockers.push(blocker(
        'RSA_MEMBER_STATION_GRID_MISMATCH',
        memberId,
        'Modal contributors do not share an identical member station grid.',
      ));
      continue;
    }
    const endForces = Array.from({ length: 12 }, (_, index) => combineValues(
      responses,
      (response) => response.memberForceRecovery.byMember[memberId].endForces[index],
      method,
      dampingRatio,
    ));
    const quantities = Object.fromEntries(STATION_KEYS.map((key) => [
      key,
      referenceXs.map((_x, index) => combineValues(
        responses,
        (response) => response.memberForceRecovery.byMember[memberId][key][index],
        method,
        dampingRatio,
      )),
    ]));
    const stations = referenceXs.map((x, index) => ({
      x,
      ...Object.fromEntries(STATION_KEYS.map((key) => [key, quantities[key][index]])),
      T: quantities.Tq[index],
      dimensions: stationDimensions(),
      units: memberForceUnits(units),
    }));
    members.push({
      memberId,
      responseMethod: method,
      endForces,
      end: endForceComponents(endForces),
      endForceDimensions: END_FORCE_DIMENSIONS,
      xs: referenceXs.slice(),
      ...quantities,
      T: quantities.Tq.slice(),
      stations,
      peaks: memberPeaks(quantities),
      modalContributors: responses.map((response) => {
        const row = response.memberForceRecovery.byMember[memberId];
        return {
          mode: response.mode,
          period: response.period,
          endForces: row.endForces.slice(),
          peaks: row.peaks,
          partialFixity: row.partialFixity,
          qualified: row.qualification.qualified,
          responsePath: `rsa.modal.${direction}.${response.mode}.memberForces.${memberId}`,
        };
      }),
      dimensions: MEMBER_FORCE_DIMENSIONS,
      units: memberForceUnits(units),
      qualification: {
        status: 'qualified',
        qualified: true,
        contributorCount: responses.length,
        allContributorsQualified: true,
        stationGridMatched: true,
      },
      partialFixity: contributors.some((row) => row.partialFixity?.enabled)
        ? {
            enabled: true,
            combination: 'modal-contributor-trace-only',
            responseMethod: method,
            responseScaleDomain: 'signed-modal-contributors-before-global-base-shear-scaling',
            baseShearScalingApplied: false,
            combinedClosure: 'not-applicable-to-unsigned-modal-combination',
            modalContributors: contributors.map((row) => ({
              mode: row.mode,
              partialFixity: row.partialFixity,
            })),
          }
        : null,
      provenance: {
        ...provenance,
        source: 'response-method-consistent-modal-member-force-combination',
        direction,
        memberId,
        responseMethod: method,
        modeIds: responses.map((response) => response.mode),
        staticCaseReferences: [],
      },
    });
  }

  if (blockers.length || members.length !== memberIds.length) {
    return unsupportedCombination(blockers, direction, method, provenance, units);
  }
  const byMember = Object.fromEntries(members.map((row) => [row.memberId, row]));
  return {
    version: RSA_MEMBER_FORCE_RECOVERY_VERSION,
    status: 'available',
    designBlocked: false,
    qualified: true,
    direction,
    responseMethod: method,
    members,
    rows: members,
    byMember,
    memberCount: members.length,
    modalContributorCount: responses.length,
    blockers: [],
    warnings: [],
    dimensions: MEMBER_FORCE_DIMENSIONS,
    units: memberForceUnits(units),
    qualification: {
      status: 'qualified',
      qualified: true,
      allModalContributorsQualified: true,
      stationGridsMatched: true,
      responseMethodConsistent: true,
    },
    provenance: {
      ...provenance,
      source: 'response-method-consistent-modal-member-force-combination',
      direction,
      responseMethod: method,
      modeIds: responses.map((response) => response.mode),
      staticCaseReferences: [],
    },
  };
}

export function summarizeRsaMemberForces({ combined, modal, recoveryContext, provenance, units }) {
  const directions = Object.entries(combined || {}).map(([direction, row]) => ({
    direction,
    ...(row.memberForces || unsupportedCombination(
      [blocker('RSA_DIRECTION_MEMBER_FORCES_UNAVAILABLE', direction, 'Direction has no combined member-force result.')],
      direction,
      row.method || 'SRSS',
      provenance,
      units,
    )),
  }));
  const blockers = [
    ...(recoveryContext?.blockers || []),
    ...directions.flatMap((row) => row.blockers || []),
  ];
  const modalRecoveries = (modal || []).flatMap((row) => (
    row.responses || []
  )).map((response) => response.memberForceRecovery).filter(Boolean);
  const qualified = directions.length > 0
    && blockers.length === 0
    && directions.every((row) => row.qualified)
    && modalRecoveries.length > 0
    && modalRecoveries.every((row) => row.qualified);
  const byDirection = Object.fromEntries(directions.map((row) => [row.direction, row]));
  const memberIds = new Set(directions.flatMap((row) => (row.members || []).map((member) => member.memberId)));
  return {
    version: RSA_MEMBER_FORCE_RECOVERY_VERSION,
    status: qualified ? 'available' : 'unsupported',
    designBlocked: !qualified,
    qualified,
    designTransferQualification: {
      status: qualified ? 'qualified' : 'blocked',
      eligible: qualified,
      scope: 'linear-elastic-rsa-member-force-demand-transfer',
      reason: qualified ? null : blockers[0]?.code || 'RSA_MEMBER_FORCE_RECOVERY_UNQUALIFIED',
    },
    directions,
    byDirection,
    directionCount: directions.length,
    memberCount: memberIds.size,
    blockers,
    warnings: blockers.map((item) => `${item.code}: ${item.message}`),
    checks: {
      scopePassed: (recoveryContext?.blockers || []).length === 0,
      residualBackSubstitutionPassed: modalRecoveries.length > 0
        && modalRecoveries.every((row) => row.qualification?.residualBackSubstitutionPassed),
      memberAssemblyChecksPassed: modalRecoveries.length > 0
        && modalRecoveries.every((row) => row.qualification?.memberAssemblyChecksPassed),
      releaseChecksPassed: modalRecoveries.length > 0
        && modalRecoveries.every((row) => row.qualification?.releaseChecksPassed),
      partialFixityChecksPassed: modalRecoveries.length > 0
        && modalRecoveries.every((row) => row.qualification?.partialFixityChecksPassed),
      stationChecksPassed: modalRecoveries.length > 0
        && modalRecoveries.every((row) => row.qualification?.stationChecksPassed),
      responseMethodConsistent: directions.length > 0
        && directions.every((row) => row.qualification?.responseMethodConsistent),
      staticFallbackUsed: false,
    },
    dimensions: MEMBER_FORCE_DIMENSIONS,
    units: memberForceUnits(units),
    limitations: [
      'Qualification covers linear-elastic frame and truss member demand recovery from the assembled modal model.',
      'No static result, fixed-end force, or static member load is substituted into RSA member demand.',
      'Combined SRSS/CQC member demands are unsigned magnitudes; signed modal contributors remain traceable.',
      'Partial-fixity spring closure is qualified per signed modal contributor; it is not recomputed from unsigned SRSS/CQC magnitudes.',
      'Qualification does not perform seismic code combinations, capacity design, or nonlinear acceptance checks.',
    ],
    provenance: {
      ...provenance,
      source: 'full-modal-displacement-member-force-recovery',
      staticCaseReferences: [],
      staticMemberLoadReferences: [],
    },
  };
}

function scopeBlockers(model, system, members, diaphragmAssembly = null) {
  const blockers = [];
  if (!system?.ok || !Array.isArray(system?.K) || !system?.memData) {
    blockers.push(blocker(
      'RSA_MODAL_SYSTEM_UNAVAILABLE',
      'system',
      'The assembled modal stiffness system is required for member-force recovery.',
    ));
    return blockers;
  }
  if (!members.length) {
    blockers.push(blocker('RSA_MEMBER_SET_EMPTY', 'members', 'No members are available for RSA force recovery.'));
  }
  const missing = members.filter((member) => !system.memData[member.id]).map((member) => member.id);
  if (missing.length) {
    blockers.push(blocker(
      'RSA_MEMBER_ASSEMBLY_COVERAGE_INCOMPLETE',
      missing.join(','),
      'Every model member must be represented in the modal stiffness assembly.',
    ));
  }
  const unilateral = members.filter((member) => (
    ['tensionOnly', 'compressionOnly'].includes(member.type || member.behavior)
  )).map((member) => member.id);
  if (unilateral.length) {
    blockers.push(blocker(
      'RSA_UNILATERAL_MEMBER_STATE_UNSUPPORTED',
      unilateral.join(','),
      'A qualified unilateral active-set state is not available in modal assembly.',
    ));
  }
  const invalidReleases = members.filter((member) => {
    const releases = member.releases || {};
    const values = [releases.i, releases.j, member.rel1, member.rel2].filter((value) => value != null);
    return values.some((value) => !['rigid', 'pin'].includes(value));
  }).map((member) => member.id);
  if (invalidReleases.length) {
    blockers.push(blocker(
      'RSA_MEMBER_RELEASE_TYPE_UNSUPPORTED',
      invalidReleases.join(','),
      'RSA member recovery supports the linear solver rigid/pin and rotational-spring connection contracts.',
    ));
  }
  const activeDiaphragms = (model.diaphragms || []).filter((item) => item && item.type !== 'none');
  const appliedRigidIds = new Set(diaphragmAssembly?.applied ? diaphragmAssembly.diaphragmIds || [] : []);
  const unsupportedDiaphragms = activeDiaphragms.filter((item) => (
    item.type !== 'rigid' || !appliedRigidIds.has(item.id)
  ));
  if (unsupportedDiaphragms.length) {
    blockers.push(blocker(
      'RSA_DIAPHRAGM_ASSEMBLY_PARITY_UNAVAILABLE',
      unsupportedDiaphragms.map((item) => item.id).join(','),
      'Rigid constraints must be applied and semi-rigid diaphragm members must be present in the modal assembly.',
    ));
  }
  const shellCount = (model.shells || []).length
    + (model.slabs || []).filter((item) => item?.type === 'shell').length;
  if (shellCount > 0 || (model.wallEquivalents || []).length > 0) {
    blockers.push(blocker(
      'RSA_EQUIVALENT_SHELL_DOMAIN_PARITY_UNAVAILABLE',
      'shells/wallEquivalents',
      'Shell-frame links or wall-equivalent members were not generated in this modal assembly.',
    ));
  }
  const nonzeroFixedEnd = Object.entries(system.memData)
    .filter(([, md]) => maxAbs(md.f0 || []) > 1e-12)
    .map(([memberId]) => memberId);
  if (nonzeroFixedEnd.length) {
    blockers.push(blocker(
      'RSA_MODAL_FIXED_END_FORCE_CONTAMINATION',
      nonzeroFixedEnd.join(','),
      'Modal member-force recovery requires zero fixed-end load vectors.',
    ));
  }
  return blockers;
}

function memberRecoveryChecks(md, displacementVector, recovered) {
  const tolerance = 1e-8;
  const rawLocal = matVec(md.T, md.dof.map((dof) => displacementVector[dof] || 0));
  let assemblyStiffness = md.klA || md.kl;
  let releaseCondensation = md.rel.length ? 'required' : 'not-applicable';
  let releaseCondensationPassed = true;
  if (md.rel.length) {
    const condensed = condenseReleasedDofs(md.kl, new Array(12).fill(0), md.rel);
    if (condensed) {
      assemblyStiffness = md.partialFixityApplication?.applied
        ? md.klA
        : condensed.klC;
      releaseCondensation = 'condensed';
    } else if (releasedRowsInactive(md.kl, md.rel)) {
      releaseCondensation = 'not-required-zero-release-stiffness';
    } else {
      releaseCondensation = 'failed';
      releaseCondensationPassed = false;
    }
  }
  const expectedEnd = matVec(assemblyStiffness, rawLocal);
  const actualEnd = recovered.end || [];
  const endScale = Math.max(1, maxAbs(expectedEnd), maxAbs(actualEnd));
  const endResidual = Math.max(0, ...expectedEnd.map((value, index) => Math.abs(value - (actualEnd[index] || 0))));
  const assemblyPassed = actualEnd.length === 12
    && actualEnd.every(Number.isFinite)
    && endResidual <= tolerance * endScale;
  const releasedForceResidual = Math.max(0, ...(md.rel || []).map((dof) => Math.abs(actualEnd[dof] || 0)));
  const releasePassed = releaseCondensationPassed && releasedForceResidual <= tolerance * endScale;
  const stationsPassed = validStations(recovered);
  const localDisplacementsPassed = Array.isArray(recovered.dl)
    && recovered.dl.length === 12
    && recovered.dl.every(Number.isFinite);
  const partialRows = recovered.partialFixity?.rows || [];
  const partialScale = Math.max(
    1,
    ...partialRows.flatMap((row) => [Math.abs(row.springMoment), Math.abs(row.memberEndMoment)]),
  );
  const maxPartialClosureResidual = Math.max(
    0,
    ...partialRows.map((row) => Math.abs(row.closureResidual)),
  );
  const maxPartialCompatibilityResidual = Math.max(
    0,
    ...partialRows.map((row) => Math.abs(row.compatibilityResidual)),
  );
  const partialFixityPassed = !recovered.partialFixity?.enabled || (
    partialRows.length > 0
    && partialRows.every((row) => Number.isFinite(row.closureResidual) && Number.isFinite(row.compatibilityResidual))
    && maxPartialClosureResidual <= tolerance * partialScale
    && maxPartialCompatibilityResidual <= tolerance
  );
  const reasons = [];
  if (!assemblyPassed) reasons.push('CONDENSED_LOCAL_STIFFNESS_FORCE_RESIDUAL');
  if (!releasePassed) reasons.push('RELEASE_FORCE_RESIDUAL');
  if (!stationsPassed) reasons.push('MEMBER_STATION_RECOVERY');
  if (!localDisplacementsPassed) reasons.push('LOCAL_DISPLACEMENT_RECOVERY');
  if (!partialFixityPassed) reasons.push('PARTIAL_FIXITY_SPRING_CLOSURE');
  return {
    passed: !reasons.length,
    reasons,
    tolerance,
    assembly: {
      passed: assemblyPassed,
      maxAbsoluteResidual: endResidual,
      relativeResidual: endResidual / endScale,
      expectedEndForces: expectedEnd,
    },
    release: {
      passed: releasePassed,
      releaseDofs: (md.rel || []).slice(),
      condensation: releaseCondensation,
      maxReleasedForceResidual: releasedForceResidual,
      relativeResidual: releasedForceResidual / endScale,
    },
    partialFixity: {
      enabled: recovered.partialFixity?.enabled === true,
      passed: partialFixityPassed,
      rowCount: partialRows.length,
      maxClosureResidual: maxPartialClosureResidual,
      relativeClosureResidual: maxPartialClosureResidual / partialScale,
      maxCompatibilityResidual: maxPartialCompatibilityResidual,
      method: recovered.partialFixity?.method || null,
    },
    stations: {
      passed: stationsPassed,
      stationCount: recovered.xs?.length || 0,
      startsAtZero: Math.abs(recovered.xs?.[0] || 0) <= 1e-9,
      endsAtLength: Math.abs((recovered.xs?.at(-1) || 0) - Number(recovered.L || 0)) <= 1e-8,
    },
    localDisplacements: { passed: localDisplacementsPassed },
  };
}

function memberRecoveryRow({ member, mode, direction, recovered, checks, provenance, units }) {
  const quantities = Object.fromEntries(STATION_KEYS.map((key) => [key, recovered[key].slice()]));
  return {
    memberId: member.id,
    memberType: member.type || member.behavior || 'frame',
    mode: mode?.id || null,
    period: mode?.period ?? null,
    direction,
    localDisplacements: recovered.dl.slice(),
    endForces: recovered.end.slice(),
    end: endForceComponents(recovered.end),
    endForceDimensions: END_FORCE_DIMENSIONS,
    xs: recovered.xs.slice(),
    ...quantities,
    T: quantities.Tq.slice(),
    stations: recovered.xs.map((x, index) => ({
      x,
      ...Object.fromEntries(STATION_KEYS.map((key) => [key, recovered[key][index]])),
      T: recovered.Tq[index],
      dimensions: stationDimensions(),
      units: memberForceUnits(units),
    })),
    peaks: memberPeaks(quantities),
    releaseDofs: checks.release.releaseDofs,
    partialFixity: recovered.partialFixity
      ? {
          ...recovered.partialFixity,
          responseScaleDomain: 'signed-modal-contributor',
          baseShearScalingApplied: false,
          rows: recovered.partialFixity.rows.map((row) => ({ ...row })),
        }
      : null,
    checks,
    dimensions: MEMBER_FORCE_DIMENSIONS,
    units: memberForceUnits(units),
    qualification: {
      status: checks.passed ? 'qualified' : 'blocked',
      qualified: checks.passed,
      reason: checks.reasons[0] || null,
    },
    provenance: {
      ...provenance,
      source: 'linear3dRecovery.recoverMemberResult',
      memberId: member.id,
      modeId: mode?.id || null,
      direction,
      appliedMemberLoads: [],
      fixedEndForceSource: 'zero-modal-vector',
      connectionRecovery: recovered.partialFixity?.enabled
        ? 'internal-rotation-static-condensation-with-spring-closure'
        : 'rigid-or-binary-release',
      staticCaseReferences: [],
    },
  };
}

function unsupportedModalRecovery(blockers, direction, mode, provenance, units) {
  return {
    version: RSA_MEMBER_FORCE_RECOVERY_VERSION,
    status: 'unsupported',
    designBlocked: true,
    qualified: false,
    direction,
    modeId: mode?.id || null,
    stationCount: 0,
    memberCount: 0,
    expectedMemberCount: 0,
    rows: [],
    byMember: {},
    blockers,
    warnings: blockers.map((item) => `${item.code}: ${item.message}`),
    dimensions: MEMBER_FORCE_DIMENSIONS,
    units: memberForceUnits(units),
    qualification: {
      status: 'blocked',
      qualified: false,
      residualBackSubstitutionPassed: false,
      memberAssemblyChecksPassed: false,
      releaseChecksPassed: false,
      stationChecksPassed: false,
    },
    provenance: {
      ...provenance,
      source: 'full-modal-displacement-linear-member-recovery',
      staticCaseReferences: [],
    },
  };
}

function unsupportedCombination(blockers, direction, method, provenance, units) {
  return {
    version: RSA_MEMBER_FORCE_RECOVERY_VERSION,
    status: 'unsupported',
    designBlocked: true,
    qualified: false,
    direction,
    responseMethod: method,
    members: [],
    rows: [],
    byMember: {},
    memberCount: 0,
    modalContributorCount: 0,
    blockers,
    warnings: blockers.map((item) => `${item.code}: ${item.message}`),
    dimensions: MEMBER_FORCE_DIMENSIONS,
    units: memberForceUnits(units),
    qualification: {
      status: 'blocked',
      qualified: false,
      allModalContributorsQualified: false,
      stationGridsMatched: false,
      responseMethodConsistent: false,
    },
    provenance: {
      ...provenance,
      source: 'response-method-consistent-modal-member-force-combination',
      direction,
      responseMethod: method,
      staticCaseReferences: [],
    },
  };
}

function endForceComponents(values) {
  const row = (offset) => ({
    N: values[offset] || 0,
    Vy: values[offset + 1] || 0,
    Vz: values[offset + 2] || 0,
    T: values[offset + 3] || 0,
    My: values[offset + 4] || 0,
    Mz: values[offset + 5] || 0,
  });
  return { i: row(0), j: row(6) };
}

function memberPeaks(quantities) {
  return {
    N: maxAbs(quantities.N),
    Vy: maxAbs(quantities.Vy),
    Vz: maxAbs(quantities.Vz),
    T: maxAbs(quantities.Tq),
    My: maxAbs(quantities.My),
    Mz: maxAbs(quantities.Mz),
  };
}

function validStations(recovered) {
  const xs = recovered.xs || [];
  if (xs.length < 2 || !xs.every(Number.isFinite)) return false;
  if (Math.abs(xs[0]) > 1e-9 || Math.abs(xs.at(-1) - Number(recovered.L || 0)) > 1e-8) return false;
  if (xs.some((value, index) => index > 0 && value < xs[index - 1])) return false;
  return STATION_KEYS.every((key) => (
    Array.isArray(recovered[key])
    && recovered[key].length === xs.length
    && recovered[key].every(Number.isFinite)
  ));
}

function sameStationGrid(first, second) {
  return first.length === second.length
    && first.every((value, index) => Math.abs(value - second[index]) <= 1e-10 * Math.max(1, Math.abs(value)));
}

function releasedRowsInactive(matrix, releaseDofs) {
  const scale = Math.max(1, maxMatrixAbs(matrix));
  const releaseScale = Math.max(0, ...releaseDofs.flatMap((dof) => [
    ...(matrix[dof] || []).map((value) => Math.abs(value)),
    ...matrix.map((row) => Math.abs(row[dof] || 0)),
  ]));
  return releaseScale <= 1e-12 * scale;
}

function maxMatrixAbs(matrix) {
  return Math.max(0, ...(matrix || []).flatMap((row) => row.map((value) => Math.abs(value))));
}

function maxAbs(values) {
  return Math.max(0, ...(values || []).map((value) => Math.abs(Number(value) || 0)));
}

function stationDimensions() {
  return {
    x: 'length',
    N: 'force',
    Vy: 'force',
    Vz: 'force',
    Tq: 'moment',
    T: 'moment',
    My: 'moment',
    Mz: 'moment',
  };
}

function memberForceUnits(units = {}) {
  const length = units.length || units.displacement || 'm';
  const force = units.force || units.baseShear || 'kN';
  return {
    length,
    force,
    moment: units.moment || `${force}.${length}`,
    angle: 'rad',
  };
}

function blocker(code, target, message) {
  return { code, target: target || null, message };
}
