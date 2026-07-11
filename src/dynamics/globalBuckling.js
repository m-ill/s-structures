import { assembleStiffness3D } from '../solver/linear3dAssembly.js';
import { assembleGlobalGeometricStiffness } from '../solver/geometricStiffness.js';
import { matMul, matTrans, solveLinear } from '../solver/linear3dElement.js';
import { materialOf, sectionOf } from '../core/catalogs.js';

export const GLOBAL_BUCKLING_TRACE_VERSION = 'p7-m10-global-buckling-v3';

const DOF_COMPONENTS = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];

export function estimateGlobalBucklingTrace(model = {}, options = {}) {
  const requestedModeCount = positiveInteger(options.modeCount ?? options.numberOfModes, 3);
  const domainGuard = validateBucklingModelDomain(model);
  if (!domainGuard.ok) {
    return baseTrace('blocked', domainGuard.reason, {
      requestedModeCount,
      guidance: domainGuard.guidance,
      domain: domainGuard.domain,
    });
  }
  let preload = resolveBucklingPreload(model, options);
  if (preload.status === 'blocked') {
    return baseTrace('blocked', preload.reason, {
      preload,
      requestedModeCount,
      guidance: preload.guidance,
    });
  }

  let assembly;
  try {
    assembly = assembleStiffness3D(model.nodes || [], model.members || [], {
      mat: options.mat || ((id) => materialOf(model, id)),
      sec: options.sec || ((id) => sectionOf(model, id)),
    });
  } catch (error) {
    return baseTrace('blocked', 'BUCKLING_ASSEMBLY_REFERENCE_INVALID', {
      preload,
      requestedModeCount,
      domain: {
        ...domainGuard.domain,
        invalidReference: {
          kind: error?.kind || null,
          reference: error?.reference ?? null,
          code: error?.code || null,
        },
      },
      guidance: {
        code: 'REPAIR_BUCKLING_LIBRARY_REFERENCES',
        message: error?.message || 'Resolve every member material and section reference before buckling analysis.',
      },
    });
  }
  if (!assembly.ok) {
    return baseTrace('blocked', assembly.reason || 'ASSEMBLY_FAILED', {
      preload,
      requestedModeCount,
    });
  }

  const preloadCoverage = validatePreloadCoverage(preload, Object.keys(assembly.memData || {}));
  if (!preloadCoverage.ok) {
    return baseTrace('blocked', preloadCoverage.reason, {
      preload: preloadCoverage.preload,
      requestedModeCount,
      freeDofCount: assembly.free?.length || 0,
      guidance: preloadCoverage.guidance,
      domain: domainGuard.domain,
    });
  }
  preload = preloadCoverage.preload;

  const geometricRaw = assembleGlobalGeometricStiffness(model, assembly, {
    ...options,
    mode: 'buckling',
    referenceAxialForces: preload.referenceAxialForces,
  });
  const geometric = releaseCompatibleGeometricAssembly(assembly, geometricRaw);
  if (!geometric.releaseCompatibility.ok) {
    return baseTrace('blocked', geometric.releaseCompatibility.reason, {
      preload,
      requestedModeCount,
      freeDofCount: assembly.free?.length || 0,
      domain: {
        ...domainGuard.domain,
        releaseCompatibility: geometric.releaseCompatibility,
      },
      guidance: {
        code: 'REVIEW_BUCKLING_MEMBER_RELEASES',
        message: `Buckling release transformation failed for member ${geometric.releaseCompatibility.memberId || '(unknown)'}.`,
      },
    });
  }
  if (!geometric.rows.length) {
    const noCompression = preload.hasForceData;
    return baseTrace(noCompression ? 'not-applicable' : 'blocked', noCompression ? 'NO_COMPRESSIVE_PRELOAD' : 'PRELOAD_REQUIRED', {
      preload: {
        ...preload,
        status: noCompression ? 'no-compression' : 'required',
      },
      requestedModeCount,
      freeDofCount: assembly.free?.length || 0,
      guidance: noCompression ? {
        code: 'REVIEW_PRELOAD_FORCE_SIGN',
        message: 'The selected preload result contains no compression-positive member force for geometric stiffness.',
      } : preloadGuidance(),
    });
  }

  const free = assembly.free || [];
  const Kf = submatrix(assembly.K, free);
  const Gf = submatrix(geometric.KG, free);
  const eigen = solveGeneralizedBucklingModes(Kf, Gf, {
    ...options,
    modeCount: requestedModeCount,
  });
  const modes = (eigen.modes || []).map((mode, index) => withModeDofs(mode, index, free, assembly.ndof, model.nodes || []));
  const status = eigen.ok ? 'available' : 'blocked';
  const firstMode = modes[0] || null;
  const exposePrimaryMode = options.modeCount !== undefined || options.numberOfModes !== undefined;
  return {
    version: GLOBAL_BUCKLING_TRACE_VERSION,
    contract: buildGlobalBucklingContract(),
    method: 'global-frame-geometric-stiffness-symmetric-generalized-eigen',
    ok: eigen.ok,
    blocked: !eigen.ok,
    status,
    criticalLoadFactor: firstMode?.loadFactor ?? null,
    modeShape: exposePrimaryMode ? firstMode?.modeShape || null : null,
    fullModeShape: exposePrimaryMode ? firstMode?.fullModeShape || null : null,
    primaryMode: firstMode,
    modes,
    requestedModeCount,
    availableModeCount: modes.length,
    iterations: eigen.sweeps || 0,
    rotations: eigen.rotations || 0,
    residual: firstMode?.residual ?? null,
    residualTolerance: eigen.residualTolerance,
    reason: eigen.reason || null,
    reasonCode: eigen.reason || null,
    freeDofCount: free.length,
    domain: {
      ...domainGuard.domain,
      freeDofCount: free.length,
      elasticMatrixSize: Kf.length,
      geometricMatrixSize: Gf.length,
      releaseCompatibility: geometric.releaseCompatibility,
    },
    preload,
    referenceCompression: geometric.rows.map((row) => ({
      memberId: row.memberId,
      compression: row.axialForce,
      source: preload.source,
      combinationId: preload.combinationId,
    })),
    guidance: eigen.ok ? null : {
      code: eigen.reason || 'BUCKLING_EIGENSOLUTION_BLOCKED',
      message: eigen.message || 'Buckling modes did not satisfy the requested count and residual contract.',
    },
    limitations: [
      'Uses elastic small-displacement frame stiffness and compression-positive member preload forces.',
      'Shells, follower loads, construction sequence, and material nonlinearity are not included.',
    ],
  };
}

function validateBucklingModelDomain(model) {
  const followerLoads = (model.loads || []).filter((load) => (
    load?.type === 'follower' || load?.follower === true || load?.followerLoad === true
  ));
  if (followerLoads.length) {
    return unsupportedDomain(
      'BUCKLING_FOLLOWER_LOAD_UNSUPPORTED',
      'unavailable-follower-load-domain',
      'loadIds',
      followerLoads,
      'REMOVE_OR_IMPLEMENT_BUCKLING_FOLLOWER_LOADS',
      'Global buckling is blocked because follower-load stiffness is not assembled into the shared tangent eigenvalue domain.',
    );
  }
  const constructionStages = model.constructionStages || model.constructionSequence || model.stages || [];
  if (Array.isArray(constructionStages) && constructionStages.length) {
    return unsupportedDomain(
      'BUCKLING_CONSTRUCTION_SEQUENCE_UNSUPPORTED',
      'unavailable-construction-sequence-domain',
      'stageIds',
      constructionStages,
      'REMOVE_OR_IMPLEMENT_BUCKLING_CONSTRUCTION_SEQUENCE',
      'Global buckling is blocked because staged activation and stage-dependent stiffness are not assembled into Ke and Kg.',
    );
  }
  const nonlinearMaterialActive = model.analysisSettings?.materialNonlinearity === true
    || model.analysisSettings?.nonlinearMaterial === true
    || model.analysisSettings?.nonlinear?.material === true
    || (model.members || []).some((member) => member?.materialNonlinearity === true);
  if (nonlinearMaterialActive) {
    return {
      ok: false,
      reason: 'BUCKLING_MATERIAL_NONLINEARITY_UNSUPPORTED',
      domain: { type: 'unavailable-material-nonlinearity-domain' },
      guidance: {
        code: 'DISABLE_OR_IMPLEMENT_BUCKLING_MATERIAL_NONLINEARITY',
        message: 'Global buckling is blocked because material tangent stiffness is not assembled into the eigenvalue problem.',
      },
    };
  }
  const shells = [
    ...(model.shells || []),
    ...(model.slabs || []).filter((item) => item?.type === 'shell'),
  ];
  if (shells.length) {
    return unsupportedDomain(
      'BUCKLING_SHELL_DOMAIN_UNSUPPORTED',
      'unavailable-shell-domain',
      'shellIds',
      shells,
      'REMOVE_OR_IMPLEMENT_BUCKLING_SHELL_DOMAIN',
      'Global buckling is blocked because shell and equivalent shell-frame stiffness are not assembled into the shared Ke/Kg domain.',
    );
  }
  const walls = [...(model.walls || []), ...(model.wallEquivalents || [])];
  if (walls.length) {
    return unsupportedDomain(
      'BUCKLING_WALL_DOMAIN_UNSUPPORTED',
      'unavailable-wall-domain',
      'wallIds',
      walls,
      'REMOVE_OR_IMPLEMENT_BUCKLING_WALL_DOMAIN',
      'Global buckling is blocked because wall and mid-pier equivalent domains are not assembled into the shared Ke/Kg domain.',
    );
  }
  const semiRigidDiaphragms = (model.diaphragms || []).filter((item) => item?.type === 'semiRigid');
  if (semiRigidDiaphragms.length) {
    return unsupportedDomain(
      'BUCKLING_SEMI_RIGID_DIAPHRAGM_UNSUPPORTED',
      'unavailable-semi-rigid-diaphragm-domain',
      'diaphragmIds',
      semiRigidDiaphragms,
      'REMOVE_OR_IMPLEMENT_BUCKLING_SEMI_RIGID_DOMAIN',
      'Global buckling is blocked because semi-rigid diaphragm generated members are not assembled into the shared Ke/Kg domain.',
    );
  }
  const rigidDiaphragms = (model.diaphragms || []).filter((item) => (item?.type || 'rigid') === 'rigid');
  if (rigidDiaphragms.length) {
    return {
      ok: false,
      reason: 'BUCKLING_RIGID_DIAPHRAGM_UNSUPPORTED',
      domain: {
        type: 'unavailable-rigid-diaphragm-domain',
        rigidDiaphragmIds: rigidDiaphragms.map((item) => item.id || null),
      },
      guidance: {
        code: 'REMOVE_OR_IMPLEMENT_BUCKLING_DIAPHRAGM_CONSTRAINTS',
        message: 'Global buckling is blocked because Ke and Kg do not yet share the model rigid-diaphragm constraint transformation.',
      },
    };
  }
  const unilateralMembers = (model.members || []).filter((member) => (
    ['tensionOnly', 'compressionOnly'].includes(member?.behavior || member?.type)
  ));
  if (unilateralMembers.length) {
    return unsupportedDomain(
      'BUCKLING_UNILATERAL_MEMBER_UNSUPPORTED',
      'unavailable-unilateral-member-domain',
      'memberIds',
      unilateralMembers,
      'REMOVE_OR_IMPLEMENT_BUCKLING_UNILATERAL_ACTIVE_SET',
      'Global buckling is blocked because the unilateral member active set is load-combination dependent and is not shared by Ke and Kg.',
    );
  }
  const generatedEquivalentMembers = (model.members || []).filter((member) => (
    member?.generated === true
    && ['semiRigidDiaphragm', 'shellFrameAssembly', 'wallMidPier', 'wallSlabEquivalent']
      .includes(member?.source)
  ));
  if (generatedEquivalentMembers.length) {
    return unsupportedDomain(
      'BUCKLING_GENERATED_EQUIVALENT_MEMBER_UNSUPPORTED',
      'unavailable-generated-equivalent-member-domain',
      'memberIds',
      generatedEquivalentMembers,
      'REMOVE_OR_IMPLEMENT_BUCKLING_EQUIVALENT_MEMBER_DOMAIN',
      'Global buckling is blocked because generated shell, wall, or semi-rigid members are not qualified for the shared Ke/Kg domain.',
    );
  }
  const unsupportedRelease = (model.members || []).find((member) => {
    const releases = member.releases || {};
    return [releases.i ?? member.rel1, releases.j ?? member.rel2]
      .some((value) => value !== undefined && !['rigid', 'pin'].includes(value));
  });
  if (unsupportedRelease) {
    return {
      ok: false,
      reason: 'BUCKLING_MEMBER_RELEASE_UNSUPPORTED',
      domain: { type: 'invalid-member-release', memberId: unsupportedRelease.id || null },
      guidance: {
        code: 'USE_RIGID_OR_PIN_MEMBER_RELEASES',
        message: `Member ${unsupportedRelease.id || '(unknown)'} has a release state that cannot be shared by Ke and Kg.`,
      },
    };
  }
  return {
    ok: true,
    domain: {
      type: 'shared-free-dof-domain',
      constraintTransformation: 'support-restraints-only',
      includedDomains: ['frame-members', 'truss-members', 'support-restraints', 'rigid-or-pin-member-releases'],
      excludedDomains: [
        'follower-loads', 'construction-sequence', 'material-nonlinearity',
        'shells', 'walls', 'semi-rigid-diaphragms', 'rigid-diaphragms',
        'unilateral-members', 'generated-equivalent-members',
      ],
    },
  };
}

function unsupportedDomain(reason, type, idField, items, guidanceCode, message) {
  return {
    ok: false,
    reason,
    domain: {
      type,
      [idField]: items.map((item) => item?.id || null),
    },
    guidance: { code: guidanceCode, message },
  };
}

function validatePreloadCoverage(preload, activeMemberIds) {
  const forceMap = preload.referenceAxialForces || {};
  const missingMemberIds = activeMemberIds.filter((memberId) => !Object.prototype.hasOwnProperty.call(forceMap, memberId));
  if (!missingMemberIds.length) {
    return {
      ok: true,
      preload: {
        ...preload,
        activeMemberCount: activeMemberIds.length,
        coveredMemberCount: activeMemberIds.length,
        missingMemberIds: [],
        coverageComplete: true,
      },
    };
  }
  const blockedPreload = {
    ...preload,
    status: 'blocked',
    reason: 'PRELOAD_MEMBER_FORCE_MAP_INCOMPLETE',
    activeMemberCount: activeMemberIds.length,
    coveredMemberCount: activeMemberIds.length - missingMemberIds.length,
    missingMemberIds,
    coverageComplete: false,
  };
  return {
    ok: false,
    reason: blockedPreload.reason,
    preload: blockedPreload,
    guidance: {
      code: 'RUN_COMPLETE_PRELOAD_ANALYSIS',
      message: `Preload member-force data is missing for ${missingMemberIds.length} active member(s): ${missingMemberIds.join(', ')}.`,
    },
  };
}

function releaseCompatibleGeometricAssembly(assembly, geometric) {
  const KG = Array.from({ length: assembly.ndof }, () => new Array(assembly.ndof).fill(0));
  let releasedMemberCount = 0;
  for (const row of geometric.rows || []) {
    const md = assembly.memData?.[row.memberId];
    const data = geometric.memberData?.[row.memberId];
    if (!md || !data) continue;
    let local = data.local;
    if (md.rel?.length) {
      const transformation = elasticReleaseTransformation(md.kl, md.rel);
      if (!transformation) {
        return {
          ...geometric,
          KG,
          rows: [],
          releaseCompatibility: {
            ok: false,
            reason: 'BUCKLING_RELEASE_TRANSFORMATION_FAILED',
            memberId: row.memberId,
          },
        };
      }
      local = matMul(matTrans(transformation), matMul(local, transformation));
      releasedMemberCount += 1;
    }
    const global = matMul(matTrans(md.T), matMul(local, md.T));
    for (let i = 0; i < 12; i += 1) {
      for (let j = 0; j < 12; j += 1) KG[md.dof[i]][md.dof[j]] += global[i][j];
    }
  }
  return {
    ...geometric,
    KG,
    releaseCompatibility: {
      ok: true,
      method: 'elastic-release-kinematics-applied-to-ke-and-kg',
      releasedMemberCount,
    },
  };
}

function elasticReleaseTransformation(elasticLocal, releasedDofs) {
  const retained = Array.from({ length: 12 }, (_item, index) => index)
    .filter((index) => !releasedDofs.includes(index));
  const releaseBlock = releasedDofs.map((row) => releasedDofs.map((col) => elasticLocal[row][col]));
  const transformation = identity(12);
  for (const released of releasedDofs) transformation[released].fill(0);
  for (const retainedDof of retained) {
    const coupling = releasedDofs.map((row) => -elasticLocal[row][retainedDof]);
    const solved = solveLinear(releaseBlock.map((row) => row.slice()), coupling);
    if (!solved) return null;
    releasedDofs.forEach((releasedDof, index) => {
      transformation[releasedDof][retainedDof] = solved[index];
    });
  }
  return transformation;
}

export function solveGeneralizedBucklingModes(K, G, options = {}) {
  const requestedModeCount = positiveInteger(options.modeCount, 3);
  const residualTolerance = positiveNumber(options.residualTolerance, 1e-7);
  if (!Array.isArray(K) || !K.length || K.length !== G?.length) {
    return eigenFailure('NO_FREE_DOF', requestedModeCount, residualTolerance);
  }
  if (!squareFinite(K) || !squareFinite(G) || K.length !== G.length) {
    return eigenFailure('INVALID_EIGEN_MATRICES', requestedModeCount, residualTolerance);
  }

  const cholesky = factorCholesky(K, options.stiffnessPivotTolerance);
  if (!cholesky.ok) {
    return eigenFailure('SINGULAR_STIFFNESS', requestedModeCount, residualTolerance, {
      pivotIndex: cholesky.pivotIndex,
      pivot: cholesky.pivot,
    });
  }

  const inverseLower = invertLower(cholesky.L);
  const transformed = symmetrize(multiply(multiply(inverseLower, G), transpose(inverseLower)));
  const decomposition = jacobiSymmetric(transformed, {
    tolerance: options.eigenTolerance,
    maxSweeps: options.maxIterations,
  });
  if (!decomposition.converged) {
    return eigenFailure('EIGENSOLVER_NOT_CONVERGED', requestedModeCount, residualTolerance, decomposition);
  }

  const maxMu = Math.max(0, ...decomposition.values);
  const positiveTolerance = positiveNumber(options.positiveEigenTolerance, Math.max(1e-18, maxMu * 1e-12));
  const candidates = decomposition.values
    .map((mu, index) => ({ mu, vector: decomposition.vectors.map((row) => row[index]) }))
    .filter((item) => Number.isFinite(item.mu) && item.mu > positiveTolerance)
    .sort((a, b) => b.mu - a.mu);

  const modes = candidates.slice(0, requestedModeCount).map((candidate, index) => {
    const rawMode = multiplyTransposeVector(inverseLower, candidate.vector);
    const modeShape = normalizeModeShape(rawMode);
    const loadFactor = 1 / candidate.mu;
    const residual = generalizedResidual(K, G, modeShape, loadFactor);
    return {
      mode: index + 1,
      loadFactor,
      eigenvalue: loadFactor,
      inverseEigenvalue: candidate.mu,
      modeShape,
      normalization: 'max-absolute-free-dof-equals-one',
      residual: residual.normalized,
      residualAbsolute: residual.absolute,
      converged: residual.normalized <= residualTolerance,
    };
  });

  if (modes.length < requestedModeCount) {
    return eigenFailure('INSUFFICIENT_BUCKLING_MODES', requestedModeCount, residualTolerance, {
      modes,
      availableModeCount: modes.length,
      sweeps: decomposition.sweeps,
      rotations: decomposition.rotations,
      message: `Requested ${requestedModeCount} positive buckling modes but only ${modes.length} are available.`,
    });
  }
  const failedMode = modes.find((mode) => !mode.converged);
  if (failedMode) {
    return eigenFailure('BUCKLING_RESIDUAL_NOT_CONVERGED', requestedModeCount, residualTolerance, {
      modes,
      availableModeCount: modes.length,
      sweeps: decomposition.sweeps,
      rotations: decomposition.rotations,
      message: `Buckling mode ${failedMode.mode} residual ${failedMode.residual} exceeds ${residualTolerance}.`,
    });
  }
  return {
    ok: true,
    reason: null,
    modes,
    requestedModeCount,
    availableModeCount: modes.length,
    residualTolerance,
    sweeps: decomposition.sweeps,
    rotations: decomposition.rotations,
  };
}

function resolveBucklingPreload(model, options) {
  const explicit = numericForceMap(options.referenceAxialForces);
  if (Object.keys(explicit).length) {
    return unqualifiedPreload('explicit-reference-axial-forces');
  }
  const explicitAxial = numericForceMap(options.axialForces);
  if (Object.keys(explicitAxial).length) {
    return unqualifiedPreload('explicit-axial-forces');
  }

  const preloadInput = options.preloadResult || options.preload?.result || options.preload || null;
  if (preloadInput) {
    const selected = selectPreloadResult(preloadInput, options);
    if (!selected.ok) {
      return {
        status: 'blocked',
        reason: selected.reason,
        source: 'preload-result',
        combinationId: selected.combinationId || null,
        availableCombinationIds: selected.availableCombinationIds || [],
        referenceAxialForces: {},
        hasForceData: false,
        qualification: selected.qualification || null,
        guidance: selected.guidance || preloadGuidance(selected.availableCombinationIds),
      };
    }
    const extracted = compressionMapFromMemberResults(selected.result.memberResults || {});
    return preloadAvailable({
      source: 'preload-result',
      referenceAxialForces: extracted.referenceAxialForces,
      combinationId: selected.combinationId,
      resultId: selected.result.id || selected.rootId || preloadInput.id || null,
      resultVersion: selected.result.version || selected.rootVersion || preloadInput.version || null,
      resultStatus: selected.result.status || preloadInput.status || (selected.result.ok === false ? 'failed' : 'ok'),
      memberResultCount: extracted.memberResultCount,
      availableCombinationIds: selected.availableCombinationIds,
      qualification: selected.qualification,
    });
  }

  const legacyResults = compressionMapFromMemberResults(options.results || {});
  if (legacyResults.memberResultCount) {
    return unqualifiedPreload('member-results');
  }

  const modelReferences = {};
  for (const member of model.members || []) {
    if (member.buckling && Number.isFinite(Number(member.buckling.referenceCompression))) {
      modelReferences[member.id] = Math.max(0, Number(member.buckling.referenceCompression));
    }
  }
  if (Object.keys(modelReferences).length) {
    return unqualifiedPreload('member-buckling-reference');
  }

  return {
    status: 'blocked',
    reason: 'PRELOAD_REQUIRED',
    source: null,
    combinationId: null,
    availableCombinationIds: [],
    referenceAxialForces: {},
    hasForceData: false,
    guidance: preloadGuidance(),
  };
}

function selectPreloadResult(input, options) {
  const root = input.payload || input.result || input;
  if (input.status && !['ok', 'available', 'complete', 'completed'].includes(input.status)) {
    return {
      ok: false,
      reason: 'PRELOAD_RESULT_NOT_AVAILABLE',
      guidance: {
        code: 'RUN_PRELOAD_ANALYSIS',
        message: `The selected preload result has status ${input.status}. Run or refresh the preload analysis before buckling.`,
      },
    };
  }
  const byCombo = root.byCombo || null;
  if (byCombo) {
    const availableCombinationIds = Object.keys(byCombo);
    const requestedId = options.preloadCombinationId
      || options.preloadCombination?.id
      || options.combinationId
      || input.combinationId
      || root.combinationId
      || (availableCombinationIds.length === 1 ? availableCombinationIds[0] : null);
    if (!requestedId) {
      return {
        ok: false,
        reason: 'PRELOAD_COMBINATION_REQUIRED',
        availableCombinationIds,
        guidance: preloadGuidance(availableCombinationIds),
      };
    }
    const result = byCombo[requestedId];
    if (!result) {
      return {
        ok: false,
        reason: 'PRELOAD_COMBINATION_NOT_FOUND',
        combinationId: requestedId,
        availableCombinationIds,
        guidance: preloadGuidance(availableCombinationIds),
      };
    }
    if (result.ok !== true || !result.memberResults) {
      return {
        ok: false,
        reason: 'PRELOAD_RESULT_NOT_AVAILABLE',
        combinationId: requestedId,
        availableCombinationIds,
        guidance: {
          code: 'RUN_PRELOAD_ANALYSIS',
          message: `Preload combination ${requestedId} does not contain a solved member-force result.`,
        },
      };
    }
    const qualification = qualifyPreloadResult(root, result, requestedId);
    if (!qualification.ok) return preloadQualificationFailure(qualification, requestedId, availableCombinationIds);
    return {
      ok: true,
      result,
      combinationId: requestedId,
      availableCombinationIds,
      rootId: root.id || null,
      rootVersion: root.version || null,
      qualification,
    };
  }
  if (root.ok !== true || !root.memberResults) {
    return {
      ok: false,
      reason: 'PRELOAD_RESULT_CONTRACT_INVALID',
      guidance: {
        code: 'PROVIDE_PRELOAD_MEMBER_RESULTS',
        message: 'Provide a solved static result with memberResults, or a byCombo result plus preloadCombinationId.',
      },
    };
  }
  const combinationId = options.preloadCombinationId || root.combo?.id || root.combinationId || null;
  const qualification = qualifyPreloadResult(root, root, combinationId);
  if (!qualification.ok) return preloadQualificationFailure(qualification, combinationId, combinationId ? [combinationId] : []);
  return {
    ok: true,
    result: root,
    combinationId,
    availableCombinationIds: root.combo?.id ? [root.combo.id] : [],
    rootId: root.id || null,
    rootVersion: root.version || null,
    qualification,
  };
}

function qualifyPreloadResult(root, result, combinationId) {
  const auditRow = (root.audit?.rows || []).find((row) => row?.comboId === combinationId);
  const completenessRow = (root.combinationCompleteness?.rows || []).find((row) => row?.comboId === combinationId);
  const unstable = collectionValues(result.unstableMembers);
  const checks = {
    solved: result.ok === true && result.anyOk === true,
    equilibrium: result.summary?.equilibriumStatus === 'PASS' && result.summary?.equilibriumOk === true && result.summary?.designBlocked === false,
    completeness: root.combinationCompleteness?.allComplete === true && completenessRow?.complete === true && completenessRow?.status === 'complete',
    audit: root.audit?.ok === true && root.audit?.status === 'PASS' && root.audit?.designBlocked === false
      && auditRow?.ok === true && auditRow?.equilibriumStatus === 'PASS' && auditRow?.designBlocked === false,
    recovery: isRecord(result.memberResults) && Object.keys(result.memberResults).length > 0
      && Array.isArray(result.failedComponents) && result.failedComponents.length === 0,
    instability: unstable.valid && unstable.values.length === 0
      && result.instability == null
      && (result.unilateral == null || result.unilateral.converged === true),
    eligibility: root.ok === true && root.analysisEligibility?.eligible === true
      && root.analysisEligibility?.status === 'qualified',
  };
  const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    version: 'p7-m10-buckling-preload-qualification-v1',
    ok: failures.length === 0,
    status: failures.length ? 'blocked' : 'qualified',
    combinationId: combinationId || null,
    checks,
    failures,
  };
}

function preloadQualificationFailure(qualification, combinationId, availableCombinationIds) {
  return {
    ok: false,
    reason: 'PRELOAD_RESULT_NOT_QUALIFIED',
    combinationId: combinationId || null,
    availableCombinationIds,
    qualification,
    guidance: {
      code: 'RUN_QUALIFIED_STATIC_PRELOAD_ANALYSIS',
      message: `The selected preload result is missing or failed required qualification evidence: ${qualification.failures.join(', ')}.`,
    },
  };
}

function unqualifiedPreload(source) {
  return {
    status: 'blocked',
    reason: 'PRELOAD_QUALIFICATION_REQUIRED',
    source,
    combinationId: null,
    availableCombinationIds: [],
    referenceAxialForces: {},
    hasForceData: false,
    qualification: {
      version: 'p7-m10-buckling-preload-qualification-v1',
      ok: false,
      status: 'blocked',
      failures: ['solved', 'equilibrium', 'completeness', 'audit', 'recovery', 'instability', 'eligibility'],
    },
    guidance: {
      code: 'RUN_QUALIFIED_STATIC_PRELOAD_ANALYSIS',
      message: 'Manual axial-force maps and member reference forces are comparison inputs only. Provide a complete qualified static preload result.',
    },
  };
}

function collectionValues(value) {
  if (value instanceof Set) return { valid: true, values: [...value] };
  if (Array.isArray(value)) return { valid: true, values: value };
  return { valid: false, values: [] };
}

function isRecord(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function compressionMapFromMemberResults(memberResults) {
  const referenceAxialForces = {};
  let memberResultCount = 0;
  for (const [memberId, result] of Object.entries(memberResults || {})) {
    const extraction = extractCompression(result);
    if (!extraction.hasData) continue;
    referenceAxialForces[memberId] = extraction.compression;
    memberResultCount += 1;
  }
  return { referenceAxialForces, memberResultCount };
}

function extractCompression(result = {}) {
  const axialSeries = result.N || result.forces?.N || result.endForces?.N || result.axialForces;
  if (Array.isArray(axialSeries) && axialSeries.some((value) => Number.isFinite(Number(value)))) {
    return {
      hasData: true,
      compression: Math.max(0, ...axialSeries.filter((value) => Number.isFinite(Number(value))).map((value) => -Number(value))),
    };
  }
  const directCompression = result.referenceCompression ?? result.compression ?? result.compressionForce;
  if (Number.isFinite(Number(directCompression))) {
    return { hasData: true, compression: Math.max(0, Number(directCompression)) };
  }
  if (Number.isFinite(Number(result.axialForce))) {
    const value = Number(result.axialForce);
    const compression = result.signConvention === 'tension-positive' ? -value : value;
    return { hasData: true, compression: Math.max(0, compression) };
  }
  return { hasData: false, compression: 0 };
}

function numericForceMap(input) {
  const output = {};
  for (const [memberId, value] of Object.entries(input || {})) {
    if (Number.isFinite(Number(value))) output[memberId] = Math.max(0, Number(value));
  }
  return output;
}

function preloadAvailable(input) {
  return {
    status: 'available',
    reason: null,
    source: input.source,
    combinationId: input.combinationId || null,
    resultId: input.resultId || null,
    resultVersion: input.resultVersion || null,
    resultStatus: input.resultStatus || 'available',
    qualification: input.qualification || null,
    availableCombinationIds: input.availableCombinationIds || [],
    memberResultCount: Number(input.memberResultCount || 0),
    compressionMemberCount: Object.values(input.referenceAxialForces).filter((value) => value > 0).length,
    signConvention: 'compression-positive; member N series converted from tension-positive',
    referenceAxialForces: input.referenceAxialForces,
    hasForceData: Number(input.memberResultCount || 0) > 0,
    guidance: null,
  };
}

function preloadGuidance(availableCombinationIds = []) {
  return {
    code: availableCombinationIds.length ? 'SELECT_PRELOAD_COMBINATION' : 'SELECT_OR_RUN_PRELOAD_COMBINATION',
    message: availableCombinationIds.length
      ? `Select one preload combination: ${availableCombinationIds.join(', ')}.`
      : 'Select or run a static preload combination and pass its solved member-force result to the buckling analysis.',
    acceptedContracts: [
      'qualified preloadResult.byCombo plus preloadCombinationId',
      'qualified static result with complete equilibrium, audit, recovery, stability, and eligibility evidence',
    ],
  };
}

function withModeDofs(mode, index, free, ndof, nodes) {
  const fullModeShape = new Array(ndof).fill(0);
  free.forEach((globalDof, freeIndex) => {
    fullModeShape[globalDof] = mode.modeShape[freeIndex];
  });
  return {
    ...mode,
    mode: index + 1,
    fullModeShape,
    dofValues: free.map((globalDof, freeIndex) => ({
      dof: globalDof,
      nodeId: nodes[Math.floor(globalDof / 6)]?.id || null,
      component: DOF_COMPONENTS[globalDof % 6],
      value: mode.modeShape[freeIndex],
    })),
  };
}

function baseTrace(status, reason, detail = {}) {
  const displayReason = reason === 'PRELOAD_REQUIRED'
    ? 'PRELOAD_REQUIRED: preload did not produce geometric stiffness; select or run a preload combination.'
    : reason;
  return {
    version: GLOBAL_BUCKLING_TRACE_VERSION,
    contract: buildGlobalBucklingContract(),
    method: 'global-frame-geometric-stiffness-symmetric-generalized-eigen',
    ok: status === 'not-applicable' ? null : false,
    blocked: status === 'blocked',
    status,
    criticalLoadFactor: null,
    modeShape: null,
    fullModeShape: null,
    primaryMode: null,
    modes: detail.modes || [],
    requestedModeCount: detail.requestedModeCount || 0,
    availableModeCount: detail.modes?.length || 0,
    iterations: 0,
    rotations: 0,
    residual: null,
    residualTolerance: null,
    reason: displayReason,
    reasonCode: reason,
    freeDofCount: detail.freeDofCount || 0,
    domain: detail.domain || null,
    preload: detail.preload || null,
    referenceCompression: [],
    guidance: detail.guidance || null,
    limitations: [
      'Uses elastic small-displacement frame stiffness and compression-positive member preload forces.',
      'Shells, follower loads, construction sequence, and material nonlinearity are not included.',
    ],
  };
}

function buildGlobalBucklingContract() {
  return {
    milestone: 'P7-M10',
    tickets: ['P3-T80'],
    verificationIds: ['BUCK-01', 'BUCK-02', 'BUCK-03', 'BUCK-04', 'BUCK-05', 'BUCK-06'],
    scope: 'Linear global frame buckling modes using elastic stiffness and a traceable static preload result.',
    preloadContracts: ['qualified-preloadResult.byCombo'],
    preloadQualification: ['ok', 'equilibrium', 'completeness', 'audit', 'recovery', 'instability', 'eligibility'],
    reviewFields: ['status', 'preload', 'criticalLoadFactor', 'modes', 'modes[].residual', 'referenceCompression'],
    limitations: ['Shell buckling, follower loads, construction sequence, and material nonlinearity are excluded.'],
  };
}

function eigenFailure(reason, requestedModeCount, residualTolerance, detail = {}) {
  return {
    ok: false,
    reason,
    requestedModeCount,
    residualTolerance,
    modes: detail.modes || [],
    availableModeCount: detail.availableModeCount || detail.modes?.length || 0,
    sweeps: detail.sweeps || 0,
    rotations: detail.rotations || 0,
    message: detail.message || null,
    pivotIndex: detail.pivotIndex ?? null,
    pivot: detail.pivot ?? null,
  };
}

function factorCholesky(A, toleranceInput) {
  const n = A.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  const scale = Math.max(1, ...A.map((row, index) => Math.abs(Number(row[index]) || 0)));
  const tolerance = positiveNumber(toleranceInput, 1e-12) * scale;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let value = 0.5 * ((Number(A[i][j]) || 0) + (Number(A[j][i]) || 0));
      for (let k = 0; k < j; k += 1) value -= L[i][k] * L[j][k];
      if (i === j) {
        if (!Number.isFinite(value) || value <= tolerance) return { ok: false, pivotIndex: i, pivot: value };
        L[i][j] = Math.sqrt(value);
      } else {
        L[i][j] = value / L[j][j];
      }
    }
  }
  return { ok: true, L };
}

function invertLower(L) {
  const n = L.length;
  const inverse = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let col = 0; col < n; col += 1) {
    for (let row = 0; row < n; row += 1) {
      let value = row === col ? 1 : 0;
      for (let k = 0; k < row; k += 1) value -= L[row][k] * inverse[k][col];
      inverse[row][col] = value / L[row][row];
    }
  }
  return inverse;
}

function jacobiSymmetric(input, options = {}) {
  const A = input.map((row) => row.slice());
  const n = A.length;
  const vectors = identity(n);
  const tolerance = positiveNumber(options.tolerance, 1e-12);
  const maxSweeps = positiveInteger(options.maxSweeps, 30);
  let rotations = 0;
  let sweeps = 0;
  let converged = n <= 1;
  for (let sweep = 1; sweep <= maxSweeps && !converged; sweep += 1) {
    sweeps = sweep;
    const scale = Math.max(Number.EPSILON, ...A.map((row, index) => Math.abs(row[index])));
    const threshold = tolerance * scale;
    for (let p = 0; p < n - 1; p += 1) {
      for (let q = p + 1; q < n; q += 1) {
        const apq = A[p][q];
        if (Math.abs(apq) <= threshold) continue;
        const angle = 0.5 * Math.atan2(2 * apq, A[q][q] - A[p][p]);
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const app = A[p][p];
        const aqq = A[q][q];
        A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        A[p][q] = 0;
        A[q][p] = 0;
        for (let k = 0; k < n; k += 1) {
          if (k !== p && k !== q) {
            const akp = A[k][p];
            const akq = A[k][q];
            A[k][p] = c * akp - s * akq;
            A[p][k] = A[k][p];
            A[k][q] = s * akp + c * akq;
            A[q][k] = A[k][q];
          }
          const vkp = vectors[k][p];
          const vkq = vectors[k][q];
          vectors[k][p] = c * vkp - s * vkq;
          vectors[k][q] = s * vkp + c * vkq;
        }
        rotations += 1;
      }
    }
    converged = maxOffDiagonal(A) <= threshold;
  }
  return {
    converged,
    values: A.map((row, index) => row[index]),
    vectors,
    sweeps,
    rotations,
  };
}

function generalizedResidual(K, G, modeShape, loadFactor) {
  const kx = matVec(K, modeShape);
  const gx = matVec(G, modeShape);
  const difference = kx.map((value, index) => value - loadFactor * gx[index]);
  const absolute = norm(difference);
  const denominator = Math.max(norm(kx), Math.abs(loadFactor) * norm(gx), Number.EPSILON);
  return { absolute, normalized: absolute / denominator };
}

function normalizeModeShape(vector) {
  const max = Math.max(0, ...vector.map((value) => Math.abs(value)));
  if (!(max > 0)) return vector.slice();
  const output = vector.map((value) => value / max);
  const anchor = output.find((value) => Math.abs(value) >= 1 - 1e-12);
  return anchor < 0 ? output.map((value) => -value) : output;
}

function submatrix(A, ids) {
  return ids.map((i) => ids.map((j) => A[i][j]));
}

function multiply(A, B) {
  const output = Array.from({ length: A.length }, () => new Array(B[0]?.length || 0).fill(0));
  for (let i = 0; i < A.length; i += 1) {
    for (let k = 0; k < B.length; k += 1) {
      const scale = A[i][k];
      if (!scale) continue;
      for (let j = 0; j < B[k].length; j += 1) output[i][j] += scale * B[k][j];
    }
  }
  return output;
}

function transpose(A) {
  return A[0].map((_value, col) => A.map((row) => row[col]));
}

function symmetrize(A) {
  return A.map((row, i) => row.map((value, j) => 0.5 * (value + A[j][i])));
}

function multiplyTransposeVector(A, vector) {
  return A[0].map((_value, col) => A.reduce((sum, row, index) => sum + row[col] * vector[index], 0));
}

function matVec(A, x) {
  return A.map((row) => row.reduce((sum, value, index) => sum + value * x[index], 0));
}

function maxOffDiagonal(A) {
  let max = 0;
  for (let i = 0; i < A.length; i += 1) {
    for (let j = i + 1; j < A.length; j += 1) max = Math.max(max, Math.abs(A[i][j]));
  }
  return max;
}

function identity(n) {
  return Array.from({ length: n }, (_row, i) => Array.from({ length: n }, (_col, j) => (i === j ? 1 : 0)));
}

function squareFinite(A) {
  return Array.isArray(A)
    && A.every((row) => Array.isArray(row) && row.length === A.length && row.every((value) => Number.isFinite(Number(value))));
}

function norm(vector) {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function positiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 1;
}
