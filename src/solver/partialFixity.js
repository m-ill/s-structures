import { resolveCriterion } from '../core/analysisCriteria.js';
import {
  MEMBER_ROTATIONAL_SPRING_KEYS,
  memberReleaseState,
  memberRotationalSpringEntries,
} from '../core/memberReleaseContract.js';
import { solveLinear } from './linear3dElement.js';

export const PARTIAL_FIXITY_VERSION = 'p10-m3-partial-fixity-v1';
export const PARTIAL_FIXITY_DOF_ORDER = Object.freeze([4, 5, 10, 11]);
export const PARTIAL_FIXITY_LIMITATION_CODES = Object.freeze({
  PRISMATIC_KG_APPROXIMATION: 'PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION',
  BUCKLING_UNSUPPORTED: 'BUCKLING_PARTIAL_FIXITY_UNSUPPORTED',
  NONLINEAR_UNSUPPORTED: 'NONLINEAR_PARTIAL_FIXITY_UNSUPPORTED',
});

export function resolveMemberPartialFixity(model = {}, member = {}, section = {}, material = {}, length = 0) {
  const hasSpring = Object.prototype.hasOwnProperty.call(member?.releases || {}, 'spring');
  if (hasSpring) {
    const source = member.releases.spring;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return invalidPartialFixity('PARTIAL_FIXITY_SPRING_CONTRACT_INVALID');
    }
    const keys = Object.keys(source);
    if (keys.some((key) => !MEMBER_ROTATIONAL_SPRING_KEYS.includes(key))) {
      return invalidPartialFixity('PARTIAL_FIXITY_SPRING_KEY_INVALID');
    }
    if (keys.some((key) => typeof source[key] !== 'number' || !Number.isFinite(source[key]) || source[key] < 0)) {
      return invalidPartialFixity('PARTIAL_FIXITY_STIFFNESS_INVALID');
    }
    if (keys.length && ['truss', 'tensionOnly', 'compressionOnly'].includes(member.behavior || member.type)) {
      return invalidPartialFixity('PARTIAL_FIXITY_FRAME_REQUIRED');
    }
    const releases = memberReleaseState(member);
    if (
      (releases.i === 'pin' && keys.some((key) => key.endsWith('I')))
      || (releases.j === 'pin' && keys.some((key) => key.endsWith('J')))
    ) {
      return invalidPartialFixity('PARTIAL_FIXITY_RELEASE_CONFLICT');
    }
  }
  const entries = memberRotationalSpringEntries(member)
    .sort((left, right) => PARTIAL_FIXITY_DOF_ORDER.indexOf(left.dof) - PARTIAL_FIXITY_DOF_ORDER.indexOf(right.dof));
  if (!entries.length) {
    return {
      version: PARTIAL_FIXITY_VERSION,
      enabled: false,
      entries: [],
      warnings: [],
      limitationCodes: [],
    };
  }

  const E = Number(material.E);
  const L = Number(length);
  const stiffRatioWarn = Number(resolveCriterion(model, 'connection.stiffRatioWarn', 1e4));
  const releaseRatioWarn = Number(resolveCriterion(model, 'connection.releaseRatioWarn', 1e-4));
  const normalized = entries.map((entry) => {
    const inertia = Number(entry.axis === 'y' ? section.Iy : section.Iz);
    const referenceStiffness = E > 0 && inertia > 0 && L > 0 ? (E * inertia) / L : null;
    const stiffnessRatio = referenceStiffness > 0 ? entry.stiffness / referenceStiffness : null;
    const fixityFactor = stiffnessRatio == null
      ? null
      : stiffnessRatio === 0 ? 0 : 1 / (1 + 3 / stiffnessRatio);
    return {
      ...entry,
      stiffness: Number(entry.stiffness),
      referenceStiffness,
      stiffnessRatio,
      fixityFactor,
    };
  });
  const invalid = normalized.find((entry) => !Number.isFinite(entry.stiffness) || entry.stiffness < 0);
  if (invalid) {
    return {
      version: PARTIAL_FIXITY_VERSION,
      enabled: true,
      ok: false,
      reason: 'PARTIAL_FIXITY_STIFFNESS_INVALID',
      key: invalid.key,
      entries: normalized,
      warnings: [],
      limitationCodes: [],
    };
  }
  const warnings = normalized.flatMap((entry) => {
    if (entry.stiffnessRatio == null) return [];
    if (entry.stiffnessRatio > stiffRatioWarn) {
      return [warning(
        'PARTIAL_FIXITY_RIGID_RECOMMENDED',
        member.id,
        entry,
        `Connection ${entry.key} is stiffer than ${stiffRatioWarn} * EI/L; model it as rigid when finite connection flexibility is not required.`,
      )];
    }
    if (entry.stiffnessRatio < releaseRatioWarn) {
      return [warning(
        'PARTIAL_FIXITY_RELEASE_RECOMMENDED',
        member.id,
        entry,
        `Connection ${entry.key} is softer than ${releaseRatioWarn} * EI/L; model it as a release when finite connection stiffness is not required.`,
      )];
    }
    return [];
  });
  return {
    version: PARTIAL_FIXITY_VERSION,
    enabled: true,
    ok: true,
    method: 'internal-rotation-static-condensation',
    dofs: normalized.map((entry) => entry.dof),
    entries: normalized,
    warningCriteria: { stiffRatioWarn, releaseRatioWarn },
    warnings,
    limitationCodes: [],
  };
}

export function condensePartialFixity(localStiffness, fixedEndForces, partialFixity) {
  if (!partialFixity?.enabled) {
    return {
      version: PARTIAL_FIXITY_VERSION,
      ok: true,
      applied: false,
      klC: cloneMatrix(localStiffness),
      f0C: Array.from(fixedEndForces || [], Number),
      transformation: identity(12),
      loadOffset: new Array(12).fill(0),
      dofs: [],
    };
  }
  if (partialFixity.ok === false) return failure(partialFixity.reason || 'PARTIAL_FIXITY_INVALID');
  if (!finiteMatrix(localStiffness, 12) || !finiteVector(fixedEndForces, 12)) {
    return failure('PARTIAL_FIXITY_INPUT_NONFINITE');
  }
  const entries = Array.from(partialFixity.entries || []);
  const dofs = entries.map((entry) => Number(entry.dof));
  if (!dofs.length || dofs.some((dof) => !PARTIAL_FIXITY_DOF_ORDER.includes(dof)) || new Set(dofs).size !== dofs.length) {
    return failure('PARTIAL_FIXITY_DOF_CONTRACT_INVALID');
  }
  const stiffnesses = entries.map((entry) => Number(entry.stiffness));
  if (stiffnesses.some((value) => !Number.isFinite(value) || value < 0)) {
    return failure('PARTIAL_FIXITY_STIFFNESS_INVALID');
  }
  const retained = Array.from({ length: 12 }, (_item, index) => index).filter((index) => !dofs.includes(index));
  const Kss = dofs.map((row) => dofs.map((column) => Number(localStiffness[row][column])));
  // Solve (Kss + D)x=b in an equilibrated coordinate system without first
  // forming the diagonal sum.  Avoiding that sum matters for both ends of the
  // spring range: a perfectly valid very small member must not be compared to
  // an absolute unit pivot, and a finite near-MAX_VALUE spring must not overflow
  // merely because Kss is added to it.
  const solveA = (rhs) => solveScaledSymmetric(Kss, rhs, stiffnesses);
  const Z = solveColumns(retained.map((column) => dofs.map((row) => localStiffness[row][column])), solveA);
  const Q = solveColumns(dofs.map((_dof, column) => stiffnesses.map((value, row) => (row === column ? value : 0))), solveA);
  const P = solveColumns(dofs.map((column) => dofs.map((row) => localStiffness[row][column])), solveA);
  const yFixed = solveA(dofs.map((dof) => Number(fixedEndForces[dof])));
  if (!Z || !Q || !P || !yFixed) return failure('PARTIAL_FIXITY_CONDENSATION_FAILED');

  const klC = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const f0C = new Array(12).fill(0);
  for (let i = 0; i < retained.length; i += 1) {
    const row = retained[i];
    for (let j = 0; j < retained.length; j += 1) {
      const column = retained[j];
      klC[row][column] = localStiffness[row][column]
        - dot(dofs.map((dof) => localStiffness[row][dof]), Z[j]);
    }
    for (let j = 0; j < dofs.length; j += 1) {
      klC[row][dofs[j]] = dot(dofs.map((dof) => localStiffness[row][dof]), Q[j]);
      klC[dofs[j]][row] = klC[row][dofs[j]];
    }
    f0C[row] = fixedEndForces[row]
      - dot(dofs.map((dof) => localStiffness[row][dof]), yFixed);
  }
  for (let i = 0; i < dofs.length; i += 1) {
    for (let j = 0; j < dofs.length; j += 1) {
      const left = stiffnesses[i] * P[j][i];
      const right = stiffnesses[j] * P[i][j];
      klC[dofs[i]][dofs[j]] = (left + right) / 2;
    }
    f0C[dofs[i]] = stiffnesses[i] * yFixed[i];
  }
  for (let i = 0; i < retained.length; i += 1) {
    for (let j = i + 1; j < retained.length; j += 1) {
      const row = retained[i];
      const column = retained[j];
      const symmetric = (klC[row][column] + klC[column][row]) / 2;
      klC[row][column] = symmetric;
      klC[column][row] = symmetric;
    }
  }

  const transformation = identity(12);
  const relativeTransformation = Array.from({ length: 12 }, () => new Array(12).fill(0));
  for (let i = 0; i < dofs.length; i += 1) {
    transformation[dofs[i]].fill(0);
    for (let j = 0; j < retained.length; j += 1) {
      transformation[dofs[i]][retained[j]] = -Z[j][i];
      relativeTransformation[dofs[i]][retained[j]] = Z[j][i];
    }
    for (let j = 0; j < dofs.length; j += 1) {
      transformation[dofs[i]][dofs[j]] = Q[j][i];
      // I - A^-1 D = A^-1 Kss.  Using P directly avoids subtracting two
      // nearly equal rotations for the k -> infinity closure audit.
      relativeTransformation[dofs[i]][dofs[j]] = P[j][i];
    }
  }
  const loadOffset = new Array(12).fill(0);
  const relativeLoadOffset = new Array(12).fill(0);
  dofs.forEach((dof, index) => { loadOffset[dof] = -yFixed[index]; });
  dofs.forEach((dof, index) => { relativeLoadOffset[dof] = yFixed[index]; });
  if (
    !finiteMatrix(klC, 12)
    || !finiteVector(f0C, 12)
    || !finiteMatrix(transformation, 12)
    || !finiteMatrix(relativeTransformation, 12)
    || !finiteVector(loadOffset, 12)
    || !finiteVector(relativeLoadOffset, 12)
  ) {
    return failure('PARTIAL_FIXITY_CONDENSATION_NONFINITE');
  }
  return {
    version: PARTIAL_FIXITY_VERSION,
    ok: true,
    applied: true,
    method: 'scaled-internal-rotation-static-condensation',
    klC,
    f0C,
    transformation,
    loadOffset,
    relativeTransformation,
    relativeLoadOffset,
    dofs,
    retainedDofs: retained,
    entries: entries.map((entry) => ({ ...entry })),
  };
}

export function recoverPartialFixityDisplacements(jointLocalDisplacements, condensation) {
  if (!condensation?.applied) return Array.from(jointLocalDisplacements || [], Number);
  if (!finiteVector(jointLocalDisplacements, 12) || !finiteMatrix(condensation.transformation, 12)) return null;
  return condensation.transformation.map((row, index) => (
    dot(row, jointLocalDisplacements) + Number(condensation.loadOffset?.[index] || 0)
  ));
}

export function buildPartialFixityRecoveryTrace(partialFixity, condensation, jointLocal, memberLocal, endForces) {
  if (!partialFixity?.enabled || !condensation?.applied) return null;
  const rows = partialFixity.entries.map((entry) => {
    const jointRotation = Number(jointLocal[entry.dof]);
    const memberRotation = Number(memberLocal[entry.dof]);
    const kinematicRelativeRotation = jointRotation - memberRotation;
    const relativeRotation = finiteMatrix(condensation.relativeTransformation, 12)
      ? dot(condensation.relativeTransformation[entry.dof], jointLocal)
        + Number(condensation.relativeLoadOffset?.[entry.dof] ?? 0)
      : kinematicRelativeRotation;
    const springMoment = entry.stiffness * relativeRotation;
    const memberEndMoment = Number(endForces[entry.dof]);
    return {
      key: entry.key,
      dof: entry.dof,
      end: entry.end,
      axis: entry.axis,
      stiffness: entry.stiffness,
      stiffnessRatio: entry.stiffnessRatio,
      fixityFactor: entry.fixityFactor,
      jointRotation,
      memberRotation,
      relativeRotation,
      kinematicRelativeRotation,
      compatibilityResidual: kinematicRelativeRotation - relativeRotation,
      springMoment,
      memberEndMoment,
      closureResidual: springMoment - memberEndMoment,
    };
  });
  return {
    version: PARTIAL_FIXITY_VERSION,
    enabled: true,
    method: condensation.method,
    rows,
    warnings: partialFixity.warnings || [],
    maxClosureResidual: Math.max(0, ...rows.map((row) => Math.abs(row.closureResidual))),
  };
}

function solveColumns(columns, solve) {
  const solved = [];
  for (const column of columns) {
    const result = solve(column);
    if (!result) return null;
    solved.push(result);
  }
  return solved;
}

function solveScaledSymmetric(matrix, rhs, stiffnesses) {
  const scale = matrix.map((row, index) => {
    const magnitude = Math.max(
      Math.abs(Number(row[index]) || 0),
      Math.abs(Number(stiffnesses[index]) || 0),
    );
    return magnitude > 0 && Number.isFinite(magnitude) ? Math.sqrt(magnitude) : 1;
  });
  const balanced = matrix.map((row, i) => row.map((value, j) => (
    (Number(value) / scale[i]) / scale[j]
      + (i === j ? (Number(stiffnesses[i]) / scale[i]) / scale[i] : 0)
  )));
  const balancedRhs = rhs.map((value, index) => Number(value) / scale[index]);
  const y = solveLinear(balanced, balancedRhs, { pivotTolerance: 1e-14 });
  return y ? y.map((value, index) => value / scale[index]) : null;
}

function warning(code, memberId, entry, message) {
  return {
    level: 'WARNING',
    code,
    message,
    target: `${memberId || 'member'}.releases.spring.${entry.key}`,
    memberId: memberId || null,
    key: entry.key,
    stiffnessRatio: entry.stiffnessRatio,
    fixityFactor: entry.fixityFactor,
  };
}

function failure(reason) {
  return { version: PARTIAL_FIXITY_VERSION, ok: false, applied: false, reason };
}

function invalidPartialFixity(reason) {
  return {
    version: PARTIAL_FIXITY_VERSION,
    enabled: true,
    ok: false,
    reason,
    entries: [],
    warnings: [],
    limitationCodes: [],
  };
}

function identity(size) {
  return Array.from({ length: size }, (_row, i) => Array.from({ length: size }, (_column, j) => (i === j ? 1 : 0)));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => Array.from(row, Number));
}

function finiteMatrix(matrix, size) {
  return Array.isArray(matrix)
    && matrix.length === size
    && matrix.every((row) => row?.length === size && Array.from(row).every((value) => Number.isFinite(Number(value))));
}

function finiteVector(vector, size) {
  return vector?.length === size && Array.from(vector).every((value) => Number.isFinite(Number(value)));
}

function dot(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) sum += Number(left[index]) * Number(right[index]);
  return sum;
}
