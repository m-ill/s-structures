import { stableHash } from '../../core/stableHash.js';
import { buildFixedEndLoad, fixedEndTraceRow } from '../../loads/fixedEnd/index.js';
import { resolveLoadDirection } from '../../loads/fixedEnd/common.js';
import {
  condenseReleasedDofs,
  localK12,
  localTrussK12,
  matTrans,
  matVec,
} from '../../solver/linear3dElement.js';
import { CANONICAL_CONSTRAINT_VERSION } from '../../solver/domain/constraintSystem.js';

export const NONLINEAR_EXTERNAL_LOAD_VERSION = 'p8-m3-canonical-external-load-v2';

const MEMBER_LOAD_TYPES = new Set([
  'udl',
  'udl-partial',
  'trapezoid',
  'point',
  'mmoment',
  'temperature',
  'tgradient',
]);

export function buildNonlinearLoadPattern(domain = {}, options = {}) {
  const context = validateDomain(domain);
  if (!context.ok) return failedPattern(context.constraint, context.issue, []);
  const { constraint, nodeIndex, elementById } = context;
  const constantFull = new Float64Array(constraint.fullDofCount);
  const referenceFull = new Float64Array(constraint.fullDofCount);
  const trace = [];
  const loads = options.loads == null ? domain.loads : options.loads;
  if (!Array.isArray(loads)) {
    return failedPattern(constraint, issue('EXTERNAL_LOAD_LIST_INVALID', null, null, 'External loads must be an array.'), trace);
  }
  const classifier = createRoleClassifier(options);

  for (let loadIndex = 0; loadIndex < loads.length; loadIndex += 1) {
    const load = loads[loadIndex];
    if (!record(load)) {
      return failedPattern(constraint, issue('EXTERNAL_LOAD_INVALID', null, null, `Load ${loadIndex} must be an object.`), trace);
    }
    const classified = classifier(load, loadIndex);
    if (!classified.ok) return failedPattern(constraint, classified.issue, trace);
    const assembled = assembleOneLoad(load, loadIndex, classified.role, nodeIndex, elementById);
    if (!assembled.ok) return failedPattern(constraint, assembled.issue, [...trace, assembled.trace].filter(Boolean));
    const destination = classified.role === 'constant' ? constantFull : referenceFull;
    for (let index = 0; index < assembled.dofs.length; index += 1) {
      destination[assembled.dofs[index]] += assembled.values[index];
    }
    if (!allFinite(destination)) {
      return failedPattern(
        constraint,
        issue('EXTERNAL_LOAD_ASSEMBLY_NONFINITE', load, null, 'External load assembly produced a non-finite value.'),
        trace,
      );
    }
    trace.push(assembled.trace);
  }

  let constantReduced;
  let referenceReduced;
  try {
    constantReduced = reduceByConstraintRows(constraint, constantFull);
    referenceReduced = reduceByConstraintRows(constraint, referenceFull);
  } catch (error) {
    return failedPattern(
      constraint,
      issue(error.code || 'EXTERNAL_LOAD_CONSTRAINT_INVALID', null, error.message, 'External-load reduction failed.'),
      trace,
    );
  }
  const patternHash = stableHash({
    version: NONLINEAR_EXTERNAL_LOAD_VERSION,
    constraintHash: constraint.hash || null,
    constantFull: Array.from(constantFull),
    referenceFull: Array.from(referenceFull),
    trace,
  }).slice(0, 24);
  return Object.freeze({
    version: NONLINEAR_EXTERNAL_LOAD_VERSION,
    ok: true,
    reason: null,
    constantFull,
    referenceFull,
    constantReduced,
    referenceReduced,
    full: referenceFull,
    reduced: referenceReduced,
    trace,
    constantLoadCount: trace.filter((row) => row.role === 'constant').length,
    referenceLoadCount: trace.filter((row) => row.role === 'reference').length,
    loadCount: trace.length,
    patternHash,
  });
}

export function assembleExternalLoads(domain, options = {}) {
  return buildNonlinearLoadPattern(domain, options);
}

export function assembleCanonicalExternalLoads(domain, options = {}) {
  return buildNonlinearLoadPattern(domain, options);
}

function validateDomain(domain) {
  const constraint = domain?.constraint;
  if (
    domain?.ok === false
    || !constraint?.ok
    || constraint.version !== CANONICAL_CONSTRAINT_VERSION
    || !Number.isInteger(constraint.fullDofCount)
    || constraint.fullDofCount < 0
    || !Number.isInteger(constraint.reducedDofCount)
    || constraint.reducedDofCount < 0
    || !Array.isArray(constraint.rows)
    || constraint.rows.length !== constraint.fullDofCount
  ) {
    return {
      ok: false,
      constraint,
      issue: issue('EXTERNAL_LOAD_DOMAIN_INVALID', null, null, 'A valid M1 canonical analysis domain is required.'),
    };
  }
  if (!Array.isArray(domain.nodes) || !Array.isArray(domain.elements) || !Array.isArray(domain.loads)) {
    return {
      ok: false,
      constraint,
      issue: issue('EXTERNAL_LOAD_DOMAIN_INVALID', null, null, 'Canonical nodes, elements, and loads are required.'),
    };
  }
  const nodeIndex = new Map();
  for (let index = 0; index < domain.nodes.length; index += 1) {
    const id = domain.nodes[index]?.id;
    if (id == null || nodeIndex.has(id)) {
      return { ok: false, constraint, issue: issue('EXTERNAL_LOAD_NODE_INDEX_INVALID', null, id, 'Node IDs must be unique.') };
    }
    nodeIndex.set(id, index);
  }
  if (domain.nodes.length * 6 !== constraint.fullDofCount) {
    return {
      ok: false,
      constraint,
      issue: issue('EXTERNAL_LOAD_DOF_COUNT_MISMATCH', null, null, 'Node and constraint DOF counts do not match.'),
    };
  }
  for (let fullDof = 0; fullDof < constraint.rows.length; fullDof += 1) {
    const row = constraint.rows[fullDof];
    const columns = new Set();
    if (!Array.isArray(row) || row.some((term) => {
      const column = Number(term?.[0]);
      const coefficient = Number(term?.[1]);
      const invalid = !Array.isArray(term)
        || term.length !== 2
        || !Number.isInteger(column)
        || column < 0
        || column >= constraint.reducedDofCount
        || !Number.isFinite(coefficient)
        || coefficient === 0
        || columns.has(column);
      columns.add(column);
      return invalid;
    })) {
      return {
        ok: false,
        constraint,
        issue: issue('EXTERNAL_LOAD_CONSTRAINT_INVALID', null, fullDof, 'Constraint sparse rows are invalid.'),
      };
    }
  }
  const elementById = new Map();
  for (const descriptor of domain.elements) {
    if (!record(descriptor) || descriptor.id == null || elementById.has(descriptor.id)) {
      return { ok: false, constraint, issue: issue('EXTERNAL_LOAD_ELEMENT_INDEX_INVALID', null, descriptor?.id, 'Element IDs must be unique.') };
    }
    if (
      descriptor.fullDofs == null
      || descriptor.fullDofs.length !== 12
      || Array.from(descriptor.fullDofs).some((dof) => !Number.isInteger(Number(dof)) || Number(dof) < 0 || Number(dof) >= constraint.fullDofCount)
    ) {
      return {
        ok: false,
        constraint,
        issue: issue('EXTERNAL_LOAD_ELEMENT_DOFS_INVALID', null, descriptor.id, 'Element DOFs are outside the canonical domain.'),
      };
    }
    elementById.set(descriptor.id, descriptor);
  }
  return { ok: true, constraint, nodeIndex, elementById };
}

function assembleOneLoad(load, loadIndex, role, nodeIndex, elementById) {
  if (load.follower === true || load.loadBehavior === 'follower') {
    return failure(
      issue('FOLLOWER_LOAD_UNSUPPORTED', load, true, 'Follower loads are not implemented for the Phase 8 corotational path.'),
      failedTrace(load, loadIndex, role, 'FOLLOWER_LOAD_UNSUPPORTED'),
    );
  }
  if (load.type === 'nodal') return assembleNodalForce(load, loadIndex, role, nodeIndex);
  if (load.type === 'nmoment') return assembleNodalMoment(load, loadIndex, role, nodeIndex);
  if (MEMBER_LOAD_TYPES.has(load.type)) return assembleMemberLoad(load, loadIndex, role, elementById);
  return failure(
    issue('UNKNOWN_EXTERNAL_LOAD_TYPE', load, load.type, `Unsupported external load type ${String(load.type)}.`),
    failedTrace(load, loadIndex, role, 'UNKNOWN_EXTERNAL_LOAD_TYPE'),
  );
}

function assembleNodalForce(load, loadIndex, role, nodeIndex) {
  const base = nodeIndex.get(load.node);
  if (base == null) {
    return failure(
      issue('EXTERNAL_LOAD_NODE_UNKNOWN', load, load.node, 'Nodal force references an unknown node.'),
      failedTrace(load, loadIndex, role, 'EXTERNAL_LOAD_NODE_UNKNOWN'),
    );
  }
  const magnitude = strictFinite(load.P);
  if (magnitude == null) {
    return failure(
      issue('NONFINITE_LOAD_COMPONENT', load, load.P, 'Nodal force P must be finite.'),
      failedTrace(load, loadIndex, role, 'NONFINITE_LOAD_COMPONENT'),
    );
  }
  const direction = resolveLoadDirection(load);
  if (!direction.ok) {
    return failure(
      issue(direction.reason || 'INVALID_LOAD_DIRECTION', load, direction.issue?.value, 'Nodal force direction is invalid.'),
      failedTrace(load, loadIndex, role, direction.reason || 'INVALID_LOAD_DIRECTION'),
    );
  }
  const dofBase = base * 6;
  const values = direction.global.map((value) => value * magnitude);
  return success(
    [dofBase, dofBase + 1, dofBase + 2],
    values,
    {
      version: NONLINEAR_EXTERNAL_LOAD_VERSION,
      index: loadIndex,
      id: load.id || null,
      type: load.type,
      case: load.case || null,
      role,
      source: clone(load),
      target: { nodeId: load.node },
      method: 'canonical-nodal-force',
      coordinate: direction.coordinate,
      direction: direction.global.slice(),
      dofs: [dofBase, dofBase + 1, dofBase + 2],
      values,
    },
  );
}

function assembleNodalMoment(load, loadIndex, role, nodeIndex) {
  const base = nodeIndex.get(load.node);
  if (base == null) {
    return failure(
      issue('EXTERNAL_LOAD_NODE_UNKNOWN', load, load.node, 'Nodal moment references an unknown node.'),
      failedTrace(load, loadIndex, role, 'EXTERNAL_LOAD_NODE_UNKNOWN'),
    );
  }
  const magnitude = strictFinite(load.M);
  if (magnitude == null) {
    return failure(
      issue('NONFINITE_LOAD_COMPONENT', load, load.M, 'Nodal moment M must be finite.'),
      failedTrace(load, loadIndex, role, 'NONFINITE_LOAD_COMPONENT'),
    );
  }
  let direction;
  if (load.direction != null || load.dir != null) {
    direction = resolveLoadDirection(load);
    if (!direction.ok) {
      return failure(
        issue(direction.reason || 'INVALID_LOAD_DIRECTION', load, direction.issue?.value, 'Nodal moment direction is invalid.'),
        failedTrace(load, loadIndex, role, direction.reason || 'INVALID_LOAD_DIRECTION'),
      );
    }
  } else {
    const coordinate = String(load.coordinate ?? load.coordinateSystem ?? 'global').trim().toLowerCase();
    if (!['global', 'world'].includes(coordinate)) {
      return failure(
        issue('UNSUPPORTED_NODAL_MOMENT_COORDINATE', load, coordinate, 'Nodal moments must use global coordinates.'),
        failedTrace(load, loadIndex, role, 'UNSUPPORTED_NODAL_MOMENT_COORDINATE'),
      );
    }
    const axis = load.axis ?? 'z';
    const axisIndex = { x: 0, y: 1, z: 2 }[axis];
    if (axisIndex == null) {
      return failure(
        issue('INVALID_NODAL_MOMENT_AXIS', load, axis, 'Nodal moment axis must be x, y, or z.'),
        failedTrace(load, loadIndex, role, 'INVALID_NODAL_MOMENT_AXIS'),
      );
    }
    direction = { coordinate: 'global', global: [0, 0, 0] };
    direction.global[axisIndex] = 1;
  }
  const dofBase = base * 6 + 3;
  const values = direction.global.map((value) => value * magnitude);
  return success(
    [dofBase, dofBase + 1, dofBase + 2],
    values,
    {
      version: NONLINEAR_EXTERNAL_LOAD_VERSION,
      index: loadIndex,
      id: load.id || null,
      type: load.type,
      case: load.case || null,
      role,
      source: clone(load),
      target: { nodeId: load.node },
      method: 'canonical-nodal-moment',
      coordinate: direction.coordinate,
      direction: direction.global.slice(),
      dofs: [dofBase, dofBase + 1, dofBase + 2],
      values,
    },
  );
}

function assembleMemberLoad(load, loadIndex, role, elementById) {
  const descriptor = elementById.get(load.member);
  if (!descriptor) {
    return failure(
      issue('EXTERNAL_LOAD_MEMBER_UNKNOWN', load, load.member, 'Member load references an unknown element.'),
      failedTrace(load, loadIndex, role, 'EXTERNAL_LOAD_MEMBER_UNKNOWN'),
    );
  }
  const descriptorCheck = validateMemberDescriptor(descriptor);
  if (!descriptorCheck.ok) {
    return failure(descriptorCheck.issue, failedTrace(load, loadIndex, role, descriptorCheck.issue.code));
  }
  const inputIssue = validateMemberLoadInput(load);
  if (inputIssue) return failure(inputIssue, failedTrace(load, loadIndex, role, inputIssue.code));

  const { axes, transform, dofs, material, section, releases } = descriptorCheck;
  const localStiffness = buildDescriptorLocalStiffness(descriptor, material, section, axes.L);
  if (!localStiffness.ok) {
    return failure(localStiffness.issue, failedTrace(load, loadIndex, role, localStiffness.issue.code));
  }
  let fixedEnd;
  try {
    fixedEnd = buildFixedEndLoad(load, axes, {
      ax: axes,
      T: transform,
      dof: dofs,
      material,
      section,
      timoshenko: descriptor.formulation?.shearDeformation || null,
      rel: releases,
    });
  } catch (error) {
    return failure(
      issue('FIXED_END_LOAD_EVALUATION_FAILED', load, error?.message, 'Fixed-end load evaluation failed.'),
      failedTrace(load, loadIndex, role, 'FIXED_END_LOAD_EVALUATION_FAILED'),
    );
  }
  if (!fixedEnd || fixedEnd.ok !== true || !finiteVector(fixedEnd.fe, 12) || !finiteVector(fixedEnd.q0, 12)) {
    const code = fixedEnd?.reason || fixedEnd?.issues?.[0]?.code || 'INVALID_FIXED_END_MEMBER_LOAD';
    return failure(
      issue(code, load, fixedEnd?.issues || null, 'Member fixed-end load is invalid.'),
      failedTrace(load, loadIndex, role, code),
    );
  }

  let localEquivalent = fixedEnd.fe.slice();
  let condensedFixedEnd = fixedEnd.q0.slice();
  if (releases.length) {
    const condensed = condenseReleasedDofs(localStiffness.matrix, fixedEnd.q0, releases);
    if (!condensed || !finiteVector(condensed.f0C, 12)) {
      return failure(
        issue('MEMBER_RELEASE_CONDENSATION_FAILED', load, releases, 'Member-load release condensation failed.'),
        failedTrace(load, loadIndex, role, 'MEMBER_RELEASE_CONDENSATION_FAILED'),
      );
    }
    condensedFixedEnd = condensed.f0C.slice();
    localEquivalent = condensed.f0C.map((value) => -value);
  }
  const values = matVec(matTrans(transform), localEquivalent);
  if (!finiteVector(values, 12)) {
    return failure(
      issue('EXTERNAL_LOAD_TRANSFORM_NONFINITE', load, null, 'Member equivalent nodal load transform produced non-finite values.'),
      failedTrace(load, loadIndex, role, 'EXTERNAL_LOAD_TRANSFORM_NONFINITE'),
    );
  }
  return success(
    dofs,
    values,
    {
      version: NONLINEAR_EXTERNAL_LOAD_VERSION,
      index: loadIndex,
      id: load.id || null,
      type: load.type,
      case: load.case || null,
      role,
      source: clone(load),
      target: { memberId: load.member },
      method: releases.length ? 'fixed-end-release-condensed-offset-transform' : 'fixed-end-offset-transform',
      fixedEnd: fixedEndTraceRow(fixedEnd),
      releaseDofs: releases.slice(),
      offsets: { ...(descriptor.geometry.offsets || { i: 0, j: 0, rigidFactor: 1 }) },
      localEquivalentNodal: localEquivalent,
      condensedFixedEnd,
      dofs: dofs.slice(),
      values,
    },
  );
}

function validateMemberDescriptor(descriptor) {
  if (descriptor.partialFixity?.enabled) {
    return {
      ok: false,
      issue: issue(
        'NONLINEAR_PARTIAL_FIXITY_UNSUPPORTED',
        null,
        descriptor.id,
        'Rotational connection springs are not implemented in the nonlinear external-load path.',
      ),
    };
  }
  const geometry = descriptor.geometry;
  const axes = {
    L: Number(geometry?.length),
    grossL: Number(geometry?.grossLength ?? geometry?.length),
    x: geometry?.axes?.x,
    y: geometry?.axes?.y,
    z: geometry?.axes?.z,
    offset: geometry?.offsets || { i: 0, j: 0, rigidFactor: 1 },
  };
  if (!(axes.L > 0) || !Number.isFinite(axes.grossL) || !['x', 'y', 'z'].every((key) => finiteVector(axes[key], 3))) {
    return { ok: false, issue: issue('EXTERNAL_LOAD_ELEMENT_GEOMETRY_INVALID', null, descriptor.id, 'Element geometry is invalid.') };
  }
  const transform = geometry?.transform;
  if (!finiteMatrix(transform, 12)) {
    return { ok: false, issue: issue('EXTERNAL_LOAD_ELEMENT_TRANSFORM_INVALID', null, descriptor.id, 'Element transform must be finite 12 by 12.') };
  }
  if (!finiteVector(descriptor.fullDofs, 12) || descriptor.fullDofs.some((value) => !Number.isInteger(Number(value)) || Number(value) < 0)) {
    return { ok: false, issue: issue('EXTERNAL_LOAD_ELEMENT_DOFS_INVALID', null, descriptor.id, 'Element full DOFs are invalid.') };
  }
  const releases = descriptor.releases?.localDofs || [];
  if (
    !Array.isArray(releases)
    || releases.some((value) => !Number.isInteger(value) || value < 0 || value >= 12)
    || new Set(releases).size !== releases.length
  ) {
    return { ok: false, issue: issue('EXTERNAL_LOAD_ELEMENT_RELEASE_INVALID', null, descriptor.id, 'Element release DOFs are invalid.') };
  }
  const releaseIssue = validateReleaseContract(descriptor.releases?.contract, releases, descriptor.id);
  if (releaseIssue) return { ok: false, issue: releaseIssue };
  const behavior = descriptor.behavior || descriptor.type;
  if (!['frame', 'truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
    return { ok: false, issue: issue('EXTERNAL_LOAD_ELEMENT_BEHAVIOR_UNSUPPORTED', null, descriptor.id, `Element behavior ${behavior || '(missing)'} is unsupported.`) };
  }
  const material = descriptor.propertySnapshot?.effectiveMaterial || descriptor.propertySnapshot?.material || {};
  const section = descriptor.propertySnapshot?.effectiveSection || descriptor.propertySnapshot?.section || {};
  return {
    ok: true,
    axes,
    transform: transform.map((row) => row.map(Number)),
    dofs: descriptor.fullDofs.map(Number),
    material,
    section,
    releases: releases.slice().sort((a, b) => a - b),
  };
}

function validateReleaseContract(contract, releases, id) {
  if (contract == null) return null;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) {
    return issue('EXTERNAL_LOAD_ELEMENT_RELEASE_CONTRACT_INVALID', null, id, 'Element release contract must be an object.');
  }
  if (Object.keys(contract).some((key) => !['i', 'j'].includes(key))) {
    return issue('EXTERNAL_LOAD_ELEMENT_RELEASE_CONTRACT_INVALID', null, id, 'Element release contract contains unsupported fields.');
  }
  if (['i', 'j'].some((end) => contract[end] != null && !['rigid', 'pin'].includes(contract[end]))) {
    return issue('EXTERNAL_LOAD_ELEMENT_RELEASE_CONTRACT_INVALID', null, id, 'Element releases must be rigid or pin.');
  }
  const expected = [];
  if (contract.i === 'pin') expected.push(4, 5);
  if (contract.j === 'pin') expected.push(10, 11);
  const actual = releases.slice().sort((left, right) => left - right);
  if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
    return issue('EXTERNAL_LOAD_ELEMENT_RELEASE_CONTRACT_MISMATCH', null, id, 'Element release contract and local DOFs disagree.');
  }
  return null;
}

function buildDescriptorLocalStiffness(descriptor, material, section, length) {
  const E = positiveFinite(material.E);
  const A = positiveFinite(section.A);
  if (E == null || A == null) {
    return { ok: false, issue: issue('EXTERNAL_LOAD_ELEMENT_PROPERTY_INVALID', null, descriptor.id, 'E and A must be positive finite values.') };
  }
  const behavior = descriptor.behavior || descriptor.type;
  if (['truss', 'tensionOnly', 'compressionOnly'].includes(behavior)) {
    return { ok: true, matrix: localTrussK12(E, A, length) };
  }
  const G = positiveFinite(material.G);
  const Iy = nonnegativeFinite(section.Iy);
  const Iz = nonnegativeFinite(section.Iz);
  const J = nonnegativeFinite(section.J);
  if (G == null || Iy == null || Iz == null || J == null) {
    return {
      ok: false,
      issue: issue('EXTERNAL_LOAD_ELEMENT_PROPERTY_INVALID', null, descriptor.id, 'G, Iy, Iz, and J must be finite elastic properties.'),
    };
  }
  const shear = descriptor.formulation?.shearDeformation || {};
  return { ok: true, matrix: localK12(E, G, A, Iy, Iz, J, length, shear.phiY, shear.phiZ) };
}

function validateMemberLoadInput(load) {
  if (load.type === 'temperature') {
    if (strictFinite(load.dT) == null) return issue('NONFINITE_LOAD_COMPONENT', load, load.dT, 'Temperature load dT must be finite.');
    if (load.alpha != null && strictFinite(load.alpha) == null) return issue('NONFINITE_LOAD_COMPONENT', load, load.alpha, 'Temperature alpha must be finite.');
  }
  if (load.type === 'tgradient') {
    if (strictFinite(load.dTtop) == null || strictFinite(load.dTbot) == null) {
      return issue('NONFINITE_LOAD_COMPONENT', load, [load.dTtop, load.dTbot], 'Temperature-gradient endpoints must be finite.');
    }
    if (load.alpha != null && strictFinite(load.alpha) == null) return issue('NONFINITE_LOAD_COMPONENT', load, load.alpha, 'Temperature alpha must be finite.');
    if (load.h != null && positiveFinite(load.h) == null) return issue('INVALID_TEMPERATURE_GRADIENT_DEPTH', load, load.h, 'Temperature-gradient depth must be positive.');
  }
  if (load.type === 'udl' && load.shape != null && !['uniform', 'asc', 'desc'].includes(load.shape)) {
    return issue('INVALID_UDL_SHAPE', load, load.shape, 'UDL shape must be uniform, asc, or desc.');
  }
  if (load.type === 'mmoment') {
    const coordinate = String(load.coordinate ?? load.coordinateSystem ?? 'local').toLowerCase();
    if (!['local', 'member', 'member-local', 'local-member'].includes(coordinate)) {
      return issue('UNSUPPORTED_MEMBER_MOMENT_COORDINATE', load, coordinate, 'Member moments must use member-local coordinates.');
    }
  }
  return null;
}

function createRoleClassifier(options) {
  const constantLoadIds = valueSet(options.constantLoadIds);
  const referenceLoadIds = valueSet(options.referenceLoadIds);
  const constantCases = valueSet(options.constantCases ?? options.constantCaseIds);
  const referenceCases = valueSet(options.referenceCases ?? options.referenceCaseIds);
  const hasConstantFilter = constantLoadIds.size > 0 || constantCases.size > 0;
  const hasReferenceFilter = referenceLoadIds.size > 0 || referenceCases.size > 0;
  return (load, index) => {
    const roles = [];
    const add = (value) => {
      if (value == null || value === '') return;
      const role = normalizeRole(value);
      if (!role) roles.push(`invalid:${String(value)}`);
      else roles.push(role);
    };
    if (typeof options.classifyLoad === 'function') {
      try {
        add(options.classifyLoad(load, index));
      } catch (error) {
        return {
          ok: false,
          issue: issue('EXTERNAL_LOAD_ROLE_INVALID', load, error?.message, 'External load role classifier failed.'),
        };
      }
    }
    add(load.loadRole ?? load.nonlinearLoadRole ?? load.controlRole ?? load.role);
    if (load.constant === true || load.scaleWithLambda === false) add('constant');
    if (load.reference === true || load.scaleWithLambda === true) add('reference');
    if (constantLoadIds.has(load.id) || constantCases.has(load.case)) add('constant');
    if (referenceLoadIds.has(load.id) || referenceCases.has(load.case)) add('reference');
    const unique = new Set(roles);
    if ([...unique].some((value) => value.startsWith('invalid:')) || unique.size > 1) {
      return {
        ok: false,
        issue: issue('EXTERNAL_LOAD_ROLE_INVALID', load, roles, 'External load has an invalid or conflicting constant/reference role.'),
      };
    }
    if (unique.size === 1) return { ok: true, role: [...unique][0] };
    let fallback = normalizeRole(options.defaultRole);
    if (!fallback && hasReferenceFilter && !hasConstantFilter) fallback = 'constant';
    if (!fallback && hasConstantFilter && !hasReferenceFilter) fallback = 'reference';
    if (!fallback) fallback = 'reference';
    if (options.strictRoles === true && (hasConstantFilter || hasReferenceFilter)) {
      return { ok: false, issue: issue('EXTERNAL_LOAD_ROLE_UNCLASSIFIED', load, null, 'External load role is unclassified.') };
    }
    return { ok: true, role: fallback };
  };
}

function reduceByConstraintRows(constraint, full) {
  const reduced = new Float64Array(constraint.reducedDofCount);
  for (let fullDof = 0; fullDof < constraint.fullDofCount; fullDof += 1) {
    const value = full[fullDof];
    if (value === 0) continue;
    const row = constraint.rows[fullDof];
    if (!Array.isArray(row)) throw loadError('EXTERNAL_LOAD_CONSTRAINT_INVALID', `Constraint row ${fullDof} is invalid.`);
    for (const term of row) {
      const column = Number(term?.[0]);
      const coefficient = Number(term?.[1]);
      if (!Number.isInteger(column) || column < 0 || column >= reduced.length || !Number.isFinite(coefficient)) {
        throw loadError('EXTERNAL_LOAD_CONSTRAINT_INVALID', `Constraint row ${fullDof} contains an invalid term.`);
      }
      reduced[column] += coefficient * value;
    }
  }
  return reduced;
}

function success(dofs, values, trace) {
  return { ok: true, dofs, values, trace };
}

function failure(problem, trace) {
  return { ok: false, issue: problem, trace };
}

function failedPattern(constraint, problem, trace) {
  const fullDofCount = Number.isInteger(constraint?.fullDofCount) && constraint.fullDofCount >= 0 ? constraint.fullDofCount : 0;
  const reducedDofCount = Number.isInteger(constraint?.reducedDofCount) && constraint.reducedDofCount >= 0 ? constraint.reducedDofCount : 0;
  return Object.freeze({
    version: NONLINEAR_EXTERNAL_LOAD_VERSION,
    ok: false,
    reason: problem.code,
    message: problem.message,
    errors: [problem],
    constantFull: new Float64Array(fullDofCount),
    referenceFull: new Float64Array(fullDofCount),
    constantReduced: new Float64Array(reducedDofCount),
    referenceReduced: new Float64Array(reducedDofCount),
    trace,
    failClosed: true,
  });
}

function issue(code, load, value, message) {
  return {
    code,
    message,
    entityType: load ? 'load' : null,
    entityId: load?.id || null,
    loadType: load?.type || null,
    nodeId: load?.node || null,
    memberId: load?.member || null,
    value,
  };
}

function failedTrace(load, index, role, reason) {
  return {
    version: NONLINEAR_EXTERNAL_LOAD_VERSION,
    index,
    id: load.id || null,
    type: load.type || null,
    case: load.case || null,
    role,
    status: 'failed',
    reason,
  };
}

function finiteVector(values, size) {
  return values != null && values.length === size && Array.from(values).every((value) => Number.isFinite(Number(value)));
}

function finiteMatrix(values, size) {
  return Array.isArray(values) && values.length === size && values.every((row) => finiteVector(row, size));
}

function strictFinite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveFinite(value) {
  const number = strictFinite(value);
  return number != null && number > 0 ? number : null;
}

function nonnegativeFinite(value) {
  const number = strictFinite(value);
  return number != null && number >= 0 ? number : null;
}

function allFinite(values) {
  return Array.from(values).every((value) => Number.isFinite(Number(value)));
}

function valueSet(value) {
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return new Set(value);
  return value == null ? new Set() : new Set([value]);
}

function normalizeRole(value) {
  const role = String(value ?? '').trim().toLowerCase();
  if (['constant', 'fixed', 'gravity'].includes(role)) return 'constant';
  if (['reference', 'proportional', 'variable', 'scaled'].includes(role)) return 'reference';
  return null;
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function loadError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
