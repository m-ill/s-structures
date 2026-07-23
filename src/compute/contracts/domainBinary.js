import { stableHash, stableStringify } from '../../core/stableHash.js';
import { resolveGlobalShearDeformation, resolveMemberShearDeformationSetting } from '../../core/shearDeformation.js';
import { resolveSectionShearAreas } from '../../materials/sectionProperties.js';
import { normalizeSectionRecord } from '../../materials/sectionSchema.js';
import { normalizeGeneralConstraints } from '../../core/constraintDefinitions.js';
import { resolveShellPressureLoad as resolveShellPressureDefinition } from '../../core/shellPressureLoad.js';

export const DOMAIN_BINARY_VERSION = 'p10-domain-binary-v6';
export const DOMAIN_BINARY_ENDIANNESS = detectEndianness();

const MEMBER_ROTATIONAL_SPRING_COMPONENTS = Object.freeze(['ryI', 'rzI', 'ryJ', 'rzJ']);
const INSERTION_POINTS = Object.freeze([
  'centroid', 'top-center', 'bottom-center', 'center-left', 'center-right',
  'top-left', 'top-right', 'bottom-left', 'bottom-right',
]);
const MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT = Object.freeze({
  encoding: 'presence-bitmask',
  bits: Object.freeze({ ryI: 0, rzI: 1, ryJ: 2, rzJ: 3 }),
  absent: 'rigid',
  presentZero: 'release',
});

export function packDomainBinary(model = {}) {
  const nodes = array(model.nodes);
  const members = array(model.members);
  const materials = array(model.materials);
  const sections = array(model.sections);
  const loads = array(model.loads);
  const loadCases = array(model.loadCases);
  const combinations = array(model.loadCombinations);
  const shellCandidates = [...array(model.shells), ...array(model.slabs).filter((item) => item?.type === 'shell')];
  const shellCandidateIds = uniqueShellIds(shellCandidates);
  const shells = shellCandidates.filter((item) => item?.formulation != null && item.formulation !== 'equivalent');
  const unsupportedShell = shells.find((item) => !['membrane', 'plate', 'shell', 'fem'].includes(item?.formulation));
  if (unsupportedShell) {
    throw contractError('UNSUPPORTED_SHELL_FORMULATION', `Shell ${unsupportedShell.id || '<unknown>'} has unsupported formulation ${unsupportedShell.formulation}.`);
  }
  const nodeIds = uniqueIds(nodes, 'node');
  const memberIds = uniqueIds(members, 'member');
  const materialIds = dictionaryIds(materials, members.map((row) => row.matId), 'material');
  const taperSectionRefs = members.flatMap((row) => [
    row.secId,
    row.taper?.sectionIdJ,
    ...(row.taper?.segments || []).map((segment) => segment.sectionId || segment.secId),
  ]).filter(Boolean);
  const sectionIds = dictionaryIds(sections, taperSectionRefs, 'section');
  const loadCaseIds = dictionaryIds(loadCases, loads.map((row) => row.case), 'load case');
  const loadIds = loads.map((row, index) => text(row.id) || 'L' + (index + 1));
  const combinationIds = combinations.map((row, index) => text(row.id) || 'C' + (index + 1));
  const memberTypeIds = [...new Set(members.map((row) => text(row.type) || 'frame'))].sort();
  const nodeIndex = indexMap(nodeIds);
  const materialIndex = indexMap(materialIds);
  const sectionIndex = indexMap(sectionIds);
  const loadCaseIndex = indexMap(loadCaseIds);
  const memberTypeIndex = indexMap(memberTypeIds);
  const shellIdByRecord = new Map(shellCandidates.map((row, index) => [row, shellCandidateIds[index]]));
  const shellIds = shells.map((row) => shellIdByRecord.get(row));

  const coordinates = new Float64Array(nodes.length * 3);
  const dofMap = new Int32Array(nodes.length * 6);
  const nodePanelZones = new Float64Array(nodes.length * 3);
  const nodePanelZoneAxis = new Uint8Array(nodes.length);
  let activeDof = 0;
  nodes.forEach((node, index) => {
    coordinates.set([
      finite(node.x, 'node.x'),
      finite(node.y, 'node.y'),
      finite(node.z, 'node.z'),
    ], index * 3);
    const fixed = fixedDofs(node);
    for (let component = 0; component < 6; component += 1) {
      dofMap[index * 6 + component] = fixed[component] ? -1 : activeDof++;
    }
    const panelZone = validatePanelZoneInput(node.panelZone, node.id || null);
    if (!panelZone.ok) throw contractError(panelZone.reason, panelZone.message);
    if (panelZone.enabled) {
      nodePanelZones.set([panelZone.tp, panelZone.db, panelZone.dc], index * 3);
      nodePanelZoneAxis[index] = panelZone.axis === 'y' ? 2 : panelZone.axis === 'z' ? 3 : 1;
    }
  });
  const shellConnectivity = new Int32Array(shells.length * 4);
  const shellTypeCodes = new Uint8Array(shells.length);
  const shellProperties = new Float64Array(shells.length * 4);
  shells.forEach((shell, index) => {
    const ids = Array.isArray(shell.nodeIds) ? shell.nodeIds : array(shell.nodes).map((node) => node.id);
    if (ids.length !== 4) throw contractError('BAD_SHELL_PROPS', `Shell ${shellIds[index]} requires four nodes.`);
    const connectivityRow = ids.map((id) => requiredIndex(nodeIndex, id, 'shell.nodeIds'));
    if (new Set(connectivityRow).size !== 4) throw contractError('BAD_SHELL_CONNECTIVITY', `Shell ${shellIds[index]} requires four distinct nodes.`);
    for (let local = 0; local < 4; local += 1) shellConnectivity[index * 4 + local] = connectivityRow[local];
    shellTypeCodes[index] = shell.formulation === 'membrane' ? 1 : shell.formulation === 'plate' ? 2 : 3;
    const material = shell.material || materials.find((row) => row.id === (shell.matId || 'steel')) || {};
    const thickness = strictNumber(shell.thickness ?? shell.t);
    const elasticModulus = strictNumber(shell.E ?? material.E ?? material.elastic?.E);
    const poisson = strictNumber(shell.nu ?? material.nu ?? material.elastic?.nu ?? 0.2);
    const suppliedDensity = shell.density ?? material.density ?? material.rho ?? material.elastic?.rho;
    const density = suppliedDensity == null ? 0 : strictNumber(suppliedDensity);
    if (!Number.isFinite(thickness) || thickness <= 0
      || !Number.isFinite(elasticModulus) || elasticModulus <= 0
      || !Number.isFinite(poisson) || poisson < 0 || poisson >= 0.5
      || !Number.isFinite(density) || density < 0) {
      throw contractError('BAD_SHELL_PROPS', `Shell ${shellIds[index]} has invalid thickness or material properties.`);
    }
    shellProperties.set([thickness, elasticModulus, poisson, density], index * 4);
  });
  const fixedDofSet = new Set([...dofMap].map((value, index) => (value < 0 ? index : null)).filter((value) => value != null));
  const normalizedConstraints = normalizeGeneralConstraints(array(model.constraints), nodes, { fixedDofs: fixedDofSet });
  if (!normalizedConstraints.ok) {
    throw contractError(normalizedConstraints.reason || 'BAD_CONSTRAINT', normalizedConstraints.errors[0]?.message || 'Invalid constraint.');
  }
  const constraintIds = normalizedConstraints.equations.map((row) => row.constraintId);
  const constraintSlaveDofs = Int32Array.from(normalizedConstraints.equations.map((row) => row.slave.fullDof));
  const constraintTermOffsets = new Int32Array(normalizedConstraints.equationCount + 1);
  const constraintTermDofs = new Int32Array(normalizedConstraints.equations.reduce((sum, row) => sum + row.terms.length, 0));
  const constraintTermCoefficients = new Float64Array(constraintTermDofs.length);
  const constraintConstants = Float64Array.from(normalizedConstraints.equations.map((row) => row.d));
  const constraintTypes = Uint8Array.from(normalizedConstraints.equations.map((row) => (
    row.sourceType === 'rigidLink' ? 2 : row.sourceType === 'masterSlave' ? 3 : 1
  )));
  let constraintTermIndex = 0;
  normalizedConstraints.equations.forEach((row, equationIndex) => {
    constraintTermOffsets[equationIndex] = constraintTermIndex;
    row.terms.forEach((term) => {
      constraintTermDofs[constraintTermIndex] = term.fullDof;
      constraintTermCoefficients[constraintTermIndex] = term.coefficient;
      constraintTermIndex += 1;
    });
  });
  constraintTermOffsets[normalizedConstraints.equationCount] = constraintTermIndex;

  const connectivity = new Int32Array(members.length * 2);
  const memberType = new Uint16Array(members.length);
  const memberMaterial = new Int32Array(members.length);
  const memberSection = new Int32Array(members.length);
  const memberRoll = new Float64Array(members.length);
  const memberOffsets = new Float64Array(members.length * 6);
  const memberOffsetFrames = new Uint8Array(members.length);
  const memberOffsetKinds = new Uint8Array(members.length);
  const memberOffsetRigidFactors = new Float64Array(members.length);
  const memberInsertionPoints = new Uint8Array(members.length);
  const memberReleaseCodes = new Uint8Array(members.length * 2);
  const memberRotationalSprings = new Float64Array(members.length * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length);
  const memberRotationalSpringMask = new Uint8Array(members.length);
  const globalShearDeformation = resolveGlobalShearDeformation(model);
  const analysisFlags = new Uint8Array([globalShearDeformation.enabled ? 1 : 0]);
  const memberShearDeformation = new Uint8Array(members.length);
  const memberTaperProfiles = new Uint8Array(members.length);
  const memberTaperGaussPoints = new Uint8Array(members.length);
  const memberTaperEndSections = new Int32Array(members.length).fill(-1);
  const taperSegmentCount = members.reduce((sum, member) => sum + (Array.isArray(member.taper?.segments) ? member.taper.segments.length : 0), 0);
  const memberTaperSegmentOffsets = new Int32Array(members.length + 1);
  const memberTaperSegmentBounds = new Float64Array(taperSegmentCount * 2);
  const memberTaperSegmentSections = new Int32Array(taperSegmentCount);
  let taperSegmentIndex = 0;
  members.forEach((member, index) => {
    connectivity[index * 2] = requiredIndex(nodeIndex, member.n1, 'member.n1');
    connectivity[index * 2 + 1] = requiredIndex(nodeIndex, member.n2, 'member.n2');
    memberType[index] = memberTypeIndex.get(text(member.type) || 'frame');
    memberMaterial[index] = requiredIndex(materialIndex, member.matId, 'member.matId');
    memberSection[index] = requiredIndex(sectionIndex, member.secId, 'member.secId');
    memberRoll[index] = numberOr(member.localAxis?.roll, 0);
    const offset = memberOffsetInputValues(member);
    memberOffsets.set(offset.values, index * 6);
    memberOffsetFrames[index] = offset.frame === 'global' ? 1 : 0;
    memberOffsetKinds[index] = offset.kindMask;
    memberOffsetRigidFactors[index] = offset.rigidFactor;
    memberInsertionPoints[index] = insertionPointCode(member.insertionPoint);
    memberReleaseCodes[index * 2] = releaseCode(member.releases?.i);
    memberReleaseCodes[index * 2 + 1] = releaseCode(member.releases?.j);
    const rotationalSprings = packMemberRotationalSprings(member);
    memberRotationalSprings.set(rotationalSprings.values, index * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length);
    memberRotationalSpringMask[index] = rotationalSprings.mask;
    const behavior = member.behavior || member.type || 'frame';
    const shearApplicable = !['truss', 'tensionOnly', 'compressionOnly'].includes(behavior);
    memberShearDeformation[index] = shearApplicable
      && resolveMemberShearDeformationSetting(model, member).requested ? 1 : 0;
    const taper = member.taper;
    if (taper && typeof taper === 'object' && !Array.isArray(taper)) {
      memberTaperProfiles[index] = taper.profile === 'segments' ? 3 : taper.profile === 'parabolic-depth' ? 2 : 1;
      memberTaperGaussPoints[index] = Number(taper.gaussPoints || 5);
      memberTaperEndSections[index] = requiredIndex(sectionIndex, taper.sectionIdJ || member.secId, 'member.taper.sectionIdJ');
      for (const [segmentIndex, segment] of (taper.segments || []).entries()) {
        const start = Number(segment.start ?? segment.xi0 ?? (segmentIndex / taper.segments.length));
        const end = Number(segment.end ?? segment.xi1 ?? ((segmentIndex + 1) / taper.segments.length));
        memberTaperSegmentBounds.set([start, end], taperSegmentIndex * 2);
        memberTaperSegmentSections[taperSegmentIndex] = requiredIndex(sectionIndex, segment.sectionId || segment.secId, 'member.taper.segments.sectionId');
        taperSegmentIndex += 1;
      }
    }
    memberTaperSegmentOffsets[index + 1] = taperSegmentIndex;
  });

  const materialProperties = new Float64Array(materialIds.length * 5);
  materialIds.forEach((id, index) => {
    const row = materials.find((item) => item.id === id) || {};
    materialProperties.set([
      numberOr(row.E ?? row.elastic?.E, 0),
      numberOr(row.G ?? row.elastic?.G, 0),
      numberOr(row.Fy ?? row.strength?.steel?.Fy, 0),
      numberOr(row.Fu ?? row.strength?.steel?.Fu, 0),
      numberOr(row.density ?? row.rho ?? row.elastic?.rho, 0),
    ], index * 5);
  });
  const sectionProperties = new Float64Array(sectionIds.length * 4);
  const sectionShearAreas = new Float64Array(sectionIds.length * 2);
  sectionIds.forEach((id, index) => {
    const row = sections.find((item) => item.id === id) || {};
    const normalized = normalizeSectionRecord(row);
    const properties = normalized.properties && typeof normalized.properties === 'object'
      ? normalized.properties
      : {};
    const effective = { ...row, ...normalized, ...properties };
    const shearAreas = resolveSectionShearAreas(effective);
    sectionProperties.set([
      numberOr(effective.A, 0),
      numberOr(effective.Iy, 0),
      numberOr(effective.Iz, 0),
      numberOr(effective.J, 0),
    ], index * 4);
    sectionShearAreas.set([
      positiveOr(shearAreas.Ay, 0),
      positiveOr(shearAreas.Az, 0),
    ], index * 2);
  });

  const loadCase = new Int32Array(loads.length);
  const loadTargetKind = new Uint8Array(loads.length);
  const loadTargetIndex = new Int32Array(loads.length);
  const loadDirection = new Int8Array(loads.length);
  const loadValues = new Float64Array(loads.length * 6);
  const memberIndex = indexMap(memberIds);
  const shellIndex = indexMap(shellIds);
  loads.forEach((load, index) => {
    loadCase[index] = requiredIndex(loadCaseIndex, load.case, 'load.case');
    const shellPressure = load.type === 'pressure' || load.type === 'shellPressure';
    if (shellPressure) {
      const pressure = resolveShellPressureLoad(load, shellIndex, shells);
      loadTargetKind[index] = 3;
      loadTargetIndex[index] = pressure.shellIndex;
      loadDirection[index] = 0;
      loadValues.set([pressure.q, 0, 0, 0, 0, 0], index * 6);
      return;
    }
    const nodal = load.node != null;
    loadTargetKind[index] = nodal ? 1 : load.member != null ? 2 : 0;
    loadTargetIndex[index] = nodal
      ? requiredIndex(nodeIndex, load.node, 'load.node')
      : load.member != null ? requiredIndex(memberIndex, load.member, 'load.member') : -1;
    loadDirection[index] = directionCode(load.dir);
    loadValues.set([
      numberOr(load.P, 0),
      numberOr(load.w, 0),
      numberOr(load.M, 0),
      numberOr(load.position ?? load.x, 0),
      numberOr(load.a, 0),
      numberOr(load.b, 0),
    ], index * 6);
  });

  const combinationFactors = new Float64Array(combinations.length * loadCaseIds.length);
  combinations.forEach((combination, row) => {
    loadCaseIds.forEach((caseId, column) => {
      combinationFactors[row * loadCaseIds.length + column] = numberOr(combination.factors?.[caseId], 0);
    });
  });
  const modelPayload = new TextEncoder().encode(stableStringify(model));

  const dictionaries = {
    nodeIds,
    memberIds,
    materialIds,
    sectionIds,
    loadIds,
    loadCaseIds,
    combinationIds,
    memberTypeIds,
    constraintIds,
    shellIds,
  };
  const buffers = {
    coordinates,
    dofMap,
    nodePanelZones,
    nodePanelZoneAxis,
    connectivity,
    memberType,
    memberMaterial,
    memberSection,
    memberRoll,
    memberOffsets,
    memberOffsetFrames,
    memberOffsetKinds,
    memberOffsetRigidFactors,
    memberInsertionPoints,
    memberReleaseCodes,
    memberRotationalSprings,
    memberRotationalSpringMask,
    analysisFlags,
    memberShearDeformation,
    memberTaperProfiles,
    memberTaperGaussPoints,
    memberTaperEndSections,
    memberTaperSegmentOffsets,
    memberTaperSegmentBounds,
    memberTaperSegmentSections,
    materialProperties,
    sectionProperties,
    sectionShearAreas,
    loadCase,
    loadTargetKind,
    loadTargetIndex,
    loadDirection,
    loadValues,
    combinationFactors,
    modelPayload,
    constraintSlaveDofs,
    constraintTermOffsets,
    constraintTermDofs,
    constraintTermCoefficients,
    constraintConstants,
    constraintTypes,
    shellConnectivity,
    shellTypeCodes,
    shellProperties,
  };
  const metadata = {
    version: DOMAIN_BINARY_VERSION,
    endianness: DOMAIN_BINARY_ENDIANNESS,
    units: canonicalUnits(model),
    schemaVersion: model.schemaVersion ?? null,
    payloadEncoding: 'utf8-stable-json',
    bufferLayouts: {
      analysisFlags: ['shearDeformation'],
      memberShearDeformation: 'effective-requested-boolean',
      memberTaperProfiles: { 0: 'absent', 1: 'linear', 2: 'parabolic-depth', 3: 'segments' },
      memberTaperGaussPoints: 'gauss-legendre-point-count',
      memberTaperSegmentBounds: ['start-xi', 'end-xi'],
      memberReleaseCodes: ['i', 'j'],
      nodePanelZones: ['tp', 'db', 'dc'],
      nodePanelZoneAxis: { 0: 'absent', 1: 'strong-axis-default', 2: 'local-y', 3: 'local-z' },
      memberOffsets: ['i.dx', 'i.dy', 'i.dz', 'j.dx', 'j.dy', 'j.dz'],
      memberOffsetFrames: { 0: 'local', 1: 'global' },
      memberOffsetKinds: { bits: { iVector: 0, jVector: 1 }, numeric: 'legacy-axial-length' },
      memberOffsetRigidFactors: 'fully-rigid-must-equal-one',
      memberInsertionPoints: [...INSERTION_POINTS],
      memberRotationalSprings: [...MEMBER_ROTATIONAL_SPRING_COMPONENTS],
      memberRotationalSpringMask: MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT,
      sectionShearAreas: ['Ay', 'Az'],
      generalConstraints: {
        equation: 'slave=sum(c*term)+d',
        types: { 1: 'mpc', 2: 'rigidLink', 3: 'masterSlave' },
      },
      loadTargetKind: { 0: 'none', 1: 'node', 2: 'member', 3: 'shell' },
      loadValues: {
        stride: 6,
        slots: ['P-or-shell-pressure-q', 'w', 'M', 'position-or-x', 'a', 'b'],
        shellPressure: { q: 0 },
      },
      // Numeric wire codes and layout remain v6-compatible; only the
      // human-readable formulation labels are corrected.
      shellTypeCodes: { 1: 'membrane-qm6-eas', 2: 'plate-mitc4', 3: 'flat-shell-qm6-eas-mitc4' },
      shellProperties: ['thickness', 'E', 'nu', 'density'],
    },
    counts: {
      nodes: nodes.length,
      activeDof,
      members: members.length,
      materials: materialIds.length,
      sections: sectionIds.length,
      loads: loads.length,
      loadCases: loadCaseIds.length,
      combinations: combinations.length,
      constraints: normalizedConstraints.constraintCount,
      constraintEquations: normalizedConstraints.equationCount,
      constraintTerms: constraintTermDofs.length,
      taperSegments: taperSegmentCount,
      shells: shells.length,
    },
    dictionaryHash: stableHash(dictionaries),
    sourceHash: stableHash(model),
  };
  const byteLength = Object.values(buffers).reduce((sum, value) => sum + value.byteLength, 0);
  const domainHash = hashDomain(metadata, dictionaries, buffers, byteLength);
  return Object.freeze({
    version: DOMAIN_BINARY_VERSION,
    metadata: Object.freeze(metadata),
    dictionaries: deepFreeze(dictionaries),
    buffers: Object.freeze(buffers),
    byteLength,
    domainHash,
  });
}

export function validateDomainBinary(domain) {
  const errors = [];
  if (!domain || typeof domain !== 'object') return { ok: false, errors: ['domain:not-object'] };
  if (domain.version !== DOMAIN_BINARY_VERSION) errors.push('domain:version');
  if (domain.metadata?.version !== DOMAIN_BINARY_VERSION) errors.push('domain:metadata-version');
  if (domain.metadata?.endianness !== DOMAIN_BINARY_ENDIANNESS) errors.push('domain:endianness');
  const buffers = domain.buffers && typeof domain.buffers === 'object' ? domain.buffers : {};
  const byteLength = Object.values(buffers).reduce((sum, value) => sum + (ArrayBuffer.isView(value) ? value.byteLength : 0), 0);
  if (byteLength !== domain.byteLength) errors.push('domain:byteLength');
  if (!ArrayBuffer.isView(buffers.coordinates) || !ArrayBuffer.isView(buffers.dofMap)) errors.push('domain:node-buffers');
  if (!ArrayBuffer.isView(buffers.connectivity) || !ArrayBuffer.isView(buffers.memberType)) errors.push('domain:member-buffers');
  if (domain.metadata?.counts?.nodes * 3 !== buffers.coordinates?.length) errors.push('domain:node-count');
  if (domain.metadata?.counts?.members * 2 !== buffers.connectivity?.length) errors.push('domain:member-count');
  if (!(buffers.shellConnectivity instanceof Int32Array)
    || domain.metadata?.counts?.shells * 4 !== buffers.shellConnectivity.length) errors.push('domain:shell-connectivity');
  if (!(buffers.shellTypeCodes instanceof Uint8Array)
    || domain.metadata?.counts?.shells !== buffers.shellTypeCodes.length
    || [...buffers.shellTypeCodes].some((value) => value < 1 || value > 3)) errors.push('domain:shell-types');
  if (!(buffers.shellProperties instanceof Float64Array)
    || domain.metadata?.counts?.shells * 4 !== buffers.shellProperties.length
    || [...buffers.shellProperties].some((value) => !Number.isFinite(value))) errors.push('domain:shell-properties');
  const shellCount = Number(domain.metadata?.counts?.shells) || 0;
  const nodeCount = Number(domain.metadata?.counts?.nodes) || 0;
  if (buffers.shellConnectivity instanceof Int32Array && buffers.shellConnectivity.length === shellCount * 4) {
    for (let element = 0; element < shellCount; element += 1) {
      const row = Array.from(buffers.shellConnectivity.slice(element * 4, element * 4 + 4));
      if (row.some((value) => value < 0 || value >= nodeCount) || new Set(row).size !== 4) {
        errors.push('domain:shell-connectivity-values');
        break;
      }
    }
  }
  if (buffers.shellProperties instanceof Float64Array && buffers.shellProperties.length === shellCount * 4) {
    for (let element = 0; element < shellCount; element += 1) {
      const [thickness, elasticModulus, poisson, density] = buffers.shellProperties.slice(element * 4, element * 4 + 4);
      if (!(thickness > 0) || !(elasticModulus > 0) || poisson < 0 || poisson >= 0.5 || density < 0) {
        errors.push('domain:shell-property-ranges');
        break;
      }
    }
  }
  const loadCount = Number(domain.metadata?.counts?.loads) || 0;
  const memberCount = Number(domain.metadata?.counts?.members) || 0;
  const loadCaseCount = Number(domain.metadata?.counts?.loadCases) || 0;
  const loadCasesValid = buffers.loadCase instanceof Int32Array && buffers.loadCase.length === loadCount;
  const loadTargetKindsValid = buffers.loadTargetKind instanceof Uint8Array
    && buffers.loadTargetKind.length === loadCount
    && [...buffers.loadTargetKind].every((value) => value >= 0 && value <= 3);
  const loadTargetIndicesValid = buffers.loadTargetIndex instanceof Int32Array
    && buffers.loadTargetIndex.length === loadCount;
  if (!loadCasesValid
    || [...(buffers.loadCase || [])].some((value) => value < 0 || value >= loadCaseCount)) errors.push('domain:load-cases');
  if (!loadTargetKindsValid) errors.push('domain:load-target-kinds');
  if (!loadTargetIndicesValid) errors.push('domain:load-target-indices');
  if (!(buffers.loadDirection instanceof Int8Array)
    || buffers.loadDirection.length !== loadCount
    || [...(buffers.loadDirection || [])].some((value) => ![-3, -2, -1, 0, 1, 2, 3].includes(value))) {
    errors.push('domain:load-directions');
  }
  if (!(buffers.loadValues instanceof Float64Array)
    || buffers.loadValues.length !== loadCount * 6
    || [...(buffers.loadValues || [])].some((value) => !Number.isFinite(value))) errors.push('domain:load-values');
  if (loadTargetKindsValid && loadTargetIndicesValid) {
    for (let loadIndex = 0; loadIndex < loadCount; loadIndex += 1) {
      const kind = buffers.loadTargetKind[loadIndex];
      const target = buffers.loadTargetIndex[loadIndex];
      const upperBound = kind === 1 ? nodeCount : kind === 2 ? memberCount : kind === 3 ? shellCount : 0;
      if ((kind === 0 && target !== -1) || (kind !== 0 && (target < 0 || target >= upperBound))) {
        errors.push('domain:load-target-range');
        break;
      }
    }
  }
  if (!(buffers.nodePanelZones instanceof Float64Array)
    || domain.metadata?.counts?.nodes * 3 !== buffers.nodePanelZones.length
    || [...buffers.nodePanelZones].some((value) => !Number.isFinite(value) || value < 0)) errors.push('domain:node-panel-zones');
  if (!(buffers.nodePanelZoneAxis instanceof Uint8Array)
    || domain.metadata?.counts?.nodes !== buffers.nodePanelZoneAxis.length
    || [...buffers.nodePanelZoneAxis].some((value) => value > 3)) errors.push('domain:node-panel-zone-axis');
  if (!(buffers.memberOffsets instanceof Float64Array)
    || domain.metadata?.counts?.members * 6 !== buffers.memberOffsets.length
    || [...buffers.memberOffsets].some((value) => !Number.isFinite(value))) errors.push('domain:member-offsets');
  if (!(buffers.memberOffsetFrames instanceof Uint8Array)
    || domain.metadata?.counts?.members !== buffers.memberOffsetFrames.length
    || [...buffers.memberOffsetFrames].some((value) => value > 1)) errors.push('domain:member-offset-frames');
  if (!(buffers.memberOffsetKinds instanceof Uint8Array)
    || domain.metadata?.counts?.members !== buffers.memberOffsetKinds.length
    || [...buffers.memberOffsetKinds].some((value) => (value & 0xfc) !== 0)) errors.push('domain:member-offset-kinds');
  if (!(buffers.memberOffsetRigidFactors instanceof Float64Array)
    || domain.metadata?.counts?.members !== buffers.memberOffsetRigidFactors.length
    || [...buffers.memberOffsetRigidFactors].some((value) => !Number.isFinite(value) || Math.abs(value - 1) > 1e-12)) {
    errors.push('domain:member-offset-rigid-factors');
  }
  if (!(buffers.memberInsertionPoints instanceof Uint8Array)
    || domain.metadata?.counts?.members !== buffers.memberInsertionPoints.length
    || [...buffers.memberInsertionPoints].some((value) => value >= INSERTION_POINTS.length)) errors.push('domain:member-insertion-points');
  if (!(buffers.memberReleaseCodes instanceof Uint8Array)
    || domain.metadata?.counts?.members * 2 !== buffers.memberReleaseCodes.length
    || [...buffers.memberReleaseCodes].some((value) => value > 2)) errors.push('domain:member-release-codes');
  const rotationalSpringsValid = buffers.memberRotationalSprings instanceof Float64Array
    && domain.metadata?.counts?.members * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length === buffers.memberRotationalSprings.length;
  const rotationalSpringMaskValid = buffers.memberRotationalSpringMask instanceof Uint8Array
    && domain.metadata?.counts?.members === buffers.memberRotationalSpringMask.length
    && [...buffers.memberRotationalSpringMask].every((value) => (value & 0xf0) === 0);
  if (!rotationalSpringsValid) errors.push('domain:member-rotational-springs');
  if (!rotationalSpringMaskValid) errors.push('domain:member-rotational-spring-mask');
  if (rotationalSpringsValid && rotationalSpringMaskValid
    && !validMemberRotationalSpringValues(buffers.memberRotationalSprings, buffers.memberRotationalSpringMask)) {
    errors.push('domain:member-rotational-spring-values');
  }
  if (!validMemberRotationalSpringLayout(domain.metadata?.bufferLayouts)) {
    errors.push('domain:member-rotational-spring-layout');
  }
  if (!(buffers.analysisFlags instanceof Uint8Array) || buffers.analysisFlags.length !== 1) errors.push('domain:analysis-flags');
  if (!(buffers.memberShearDeformation instanceof Uint8Array)
    || domain.metadata?.counts?.members !== buffers.memberShearDeformation.length) errors.push('domain:member-shear-deformation');
  if (!(buffers.memberTaperProfiles instanceof Uint8Array)
    || domain.metadata?.counts?.members !== buffers.memberTaperProfiles.length
    || [...(buffers.memberTaperProfiles || [])].some((value) => value > 3)) errors.push('domain:member-taper-profiles');
  if (!(buffers.memberTaperGaussPoints instanceof Uint8Array)
    || domain.metadata?.counts?.members !== buffers.memberTaperGaussPoints.length
    || [...(buffers.memberTaperGaussPoints || [])].some((value, index) => buffers.memberTaperProfiles?.[index] && ![5, 10].includes(value))) errors.push('domain:member-taper-gauss-points');
  if (!(buffers.memberTaperEndSections instanceof Int32Array)
    || domain.metadata?.counts?.members !== buffers.memberTaperEndSections.length) errors.push('domain:member-taper-end-sections');
  const taperSegmentCount = domain.metadata?.counts?.taperSegments;
  if (!(buffers.memberTaperSegmentOffsets instanceof Int32Array)
    || buffers.memberTaperSegmentOffsets.length !== domain.metadata?.counts?.members + 1
    || buffers.memberTaperSegmentOffsets[0] !== 0
    || buffers.memberTaperSegmentOffsets.at(-1) !== taperSegmentCount) errors.push('domain:member-taper-segment-offsets');
  if (!(buffers.memberTaperSegmentBounds instanceof Float64Array)
    || buffers.memberTaperSegmentBounds.length !== taperSegmentCount * 2
    || [...(buffers.memberTaperSegmentBounds || [])].some((value) => !Number.isFinite(value))) errors.push('domain:member-taper-segment-bounds');
  if (!(buffers.memberTaperSegmentSections instanceof Int32Array)
    || buffers.memberTaperSegmentSections.length !== taperSegmentCount) errors.push('domain:member-taper-segment-sections');
  if (!(buffers.sectionShearAreas instanceof Float64Array)
    || domain.metadata?.counts?.sections * 2 !== buffers.sectionShearAreas.length) errors.push('domain:section-shear-areas');
  const equationCount = domain.metadata?.counts?.constraintEquations;
  const termCount = domain.metadata?.counts?.constraintTerms;
  if (!(buffers.constraintSlaveDofs instanceof Int32Array) || buffers.constraintSlaveDofs.length !== equationCount) errors.push('domain:constraint-slaves');
  if (!(buffers.constraintTermOffsets instanceof Int32Array) || buffers.constraintTermOffsets.length !== equationCount + 1) errors.push('domain:constraint-offsets');
  if (!(buffers.constraintTermDofs instanceof Int32Array) || buffers.constraintTermDofs.length !== termCount) errors.push('domain:constraint-terms');
  if (!(buffers.constraintTermCoefficients instanceof Float64Array) || buffers.constraintTermCoefficients.length !== termCount
    || [...(buffers.constraintTermCoefficients || [])].some((value) => !Number.isFinite(value))) errors.push('domain:constraint-coefficients');
  if (!(buffers.constraintConstants instanceof Float64Array) || buffers.constraintConstants.length !== equationCount
    || [...(buffers.constraintConstants || [])].some((value) => !Number.isFinite(value))) errors.push('domain:constraint-constants');
  if (!(buffers.constraintTypes instanceof Uint8Array) || buffers.constraintTypes.length !== equationCount
    || [...(buffers.constraintTypes || [])].some((value) => value < 1 || value > 3)) errors.push('domain:constraint-types');
  if (buffers.constraintTermOffsets instanceof Int32Array
    && (buffers.constraintTermOffsets[0] !== 0 || buffers.constraintTermOffsets[equationCount] !== termCount
      || [...buffers.constraintTermOffsets].some((value, index, rows) => value < 0 || value > termCount || (index && value < rows[index - 1])))) {
    errors.push('domain:constraint-offset-range');
  }
  if (domain.domainHash !== hashDomain(domain.metadata, domain.dictionaries, buffers, byteLength)) errors.push('domain:hash');
  return { ok: errors.length === 0, errors };
}

export function unpackDomainBinary(domain) {
  const validation = validateDomainBinary(domain);
  if (!validation.ok) throw contractError('DOMAIN_BINARY_INVALID', validation.errors.join(', '));
  const { dictionaries, buffers } = domain;
  const nodes = dictionaries.nodeIds.map((id, index) => {
    const node = {
      id,
      x: buffers.coordinates[index * 3],
      y: buffers.coordinates[index * 3 + 1],
      z: buffers.coordinates[index * 3 + 2],
      dof: Array.from(buffers.dofMap.slice(index * 6, index * 6 + 6)),
    };
    const axisCode = buffers.nodePanelZoneAxis[index];
    if (axisCode) {
      node.panelZone = {
        tp: buffers.nodePanelZones[index * 3],
        db: buffers.nodePanelZones[index * 3 + 1],
        dc: buffers.nodePanelZones[index * 3 + 2],
        ...(axisCode > 1 ? { axis: axisCode === 2 ? 'y' : 'z' } : {}),
      };
    }
    return node;
  });
  const members = dictionaries.memberIds.map((id, index) => {
    const releases = {
      i: releaseValue(buffers.memberReleaseCodes[index * 2]),
      j: releaseValue(buffers.memberReleaseCodes[index * 2 + 1]),
    };
    const spring = unpackMemberRotationalSprings(buffers, index);
    if (spring) releases.spring = spring;
    const member = {
      id,
      n1: dictionaries.nodeIds[buffers.connectivity[index * 2]],
      n2: dictionaries.nodeIds[buffers.connectivity[index * 2 + 1]],
      type: dictionaries.memberTypeIds[buffers.memberType[index]],
      matId: dictionaries.materialIds[buffers.memberMaterial[index]],
      secId: dictionaries.sectionIds[buffers.memberSection[index]],
      releases,
    };
    const offsetStart = index * 6;
    const values = Array.from(buffers.memberOffsets.slice(offsetStart, offsetStart + 6));
    const kind = buffers.memberOffsetKinds[index];
    const endValue = (endIndex) => {
      const vector = values.slice(endIndex * 3, endIndex * 3 + 3);
      if (kind & (1 << endIndex)) return { dx: vector[0], dy: vector[1], dz: vector[2] };
      return endIndex === 0 ? vector[0] : -vector[0];
    };
    if (values.some((value) => value !== 0) || buffers.memberOffsetFrames[index] || kind) {
      member.endOffset = {
        i: endValue(0),
        j: endValue(1),
        rigidFactor: buffers.memberOffsetRigidFactors[index],
        ...(buffers.memberOffsetFrames[index] ? { frame: 'global' } : {}),
      };
    }
    const insertionPoint = INSERTION_POINTS[buffers.memberInsertionPoints[index]];
    if (insertionPoint !== 'centroid') member.insertionPoint = insertionPoint;
    const taperProfile = buffers.memberTaperProfiles[index];
    if (taperProfile) {
      const profile = taperProfile === 3 ? 'segments' : taperProfile === 2 ? 'parabolic-depth' : 'linear';
      member.taper = {
        profile,
        sectionIdJ: dictionaries.sectionIds[buffers.memberTaperEndSections[index]],
        gaussPoints: buffers.memberTaperGaussPoints[index],
      };
      if (profile === 'segments') {
        const start = buffers.memberTaperSegmentOffsets[index];
        const end = buffers.memberTaperSegmentOffsets[index + 1];
        member.taper.segments = Array.from({ length: end - start }, (_value, offset) => {
          const segment = start + offset;
          return {
            start: buffers.memberTaperSegmentBounds[segment * 2],
            end: buffers.memberTaperSegmentBounds[segment * 2 + 1],
            sectionId: dictionaries.sectionIds[buffers.memberTaperSegmentSections[segment]],
          };
        });
      }
    }
    return member;
  });
  const loads = dictionaries.loadIds.map((id, index) => unpackTypedLoad(dictionaries, buffers, id, index));
  return {
    version: domain.version,
    units: { ...domain.metadata.units },
    nodes,
    members,
    loads,
    sourceHash: domain.metadata.sourceHash,
    domainHash: domain.domainHash,
    model: JSON.parse(new TextDecoder().decode(buffers.modelPayload)),
  };
}

export function domainBinaryTransferables(domain) {
  const validation = validateDomainBinary(domain);
  if (!validation.ok) throw contractError('DOMAIN_BINARY_INVALID', validation.errors.join(', '));
  return [...new Set(Object.values(domain.buffers).map((value) => value.buffer))];
}

function hashDomain(metadata, dictionaries, buffers, byteLength) {
  return stableHash({
    metadata,
    dictionaries,
    byteLength,
    buffers: Object.fromEntries(Object.entries(buffers).map(([key, value]) => [key, Array.from(value)])),
  });
}

function fixedDofs(node) {
  if (node.support === 'fixed') return [true, true, true, true, true, true];
  if (node.support === 'pin' || node.support === 'pinned') return [true, true, true, false, false, false];
  if (Array.isArray(node.fix)) return Array.from({ length: 6 }, (_item, index) => node.fix[index] === true);
  return [false, false, false, false, false, false];
}

function validatePanelZoneInput(value) {
  if (value == null) return { ok: true, enabled: false };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'BAD_PANEL_ZONE', message: 'joint.panelZone must be an object.' };
  }
  const unknown = Object.keys(value).filter((key) => !['tp', 'db', 'dc', 'axis'].includes(key));
  if (unknown.length) {
    return { ok: false, reason: 'BAD_PANEL_ZONE', message: `Unsupported panel-zone field: ${unknown[0]}.` };
  }
  for (const key of ['tp', 'db', 'dc']) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || !(value[key] > 0)) {
      return { ok: false, reason: 'BAD_PANEL_ZONE', message: `joint.panelZone.${key} must be a positive finite number.` };
    }
  }
  if (value.axis != null && !['y', 'z'].includes(value.axis)) {
    return { ok: false, reason: 'BAD_PANEL_ZONE', message: 'joint.panelZone.axis must be y or z when specified.' };
  }
  return { ok: true, enabled: true, tp: value.tp, db: value.db, dc: value.dc, axis: value.axis || null };
}

function memberOffsetInputValues(member = {}) {
  const value = member.endOffset;
  if (value == null) {
    return { values: [0, 0, 0, 0, 0, 0], frame: 'local', rigidFactor: 1, kindMask: 0 };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw contractError('INVALID_MEMBER_OFFSET', 'member.endOffset must be an object.');
  }
  const frame = value.frame ?? 'local';
  if (!['local', 'global'].includes(frame)) {
    throw contractError('INVALID_MEMBER_OFFSET_FRAME', 'Member offset frame must be local or global.');
  }
  const rigidFactor = value.rigidFactor ?? 1;
  if (typeof rigidFactor !== 'number' || !Number.isFinite(rigidFactor) || Math.abs(rigidFactor - 1) > 1e-12) {
    throw contractError('UNSUPPORTED_MEMBER_OFFSET_RIGID_FACTOR', 'Only rigidFactor=1 is supported.');
  }
  const i = domainOffsetEnd(value.i, 'i');
  const j = domainOffsetEnd(value.j, 'j');
  return {
    values: [...i.vector, ...j.vector],
    frame,
    rigidFactor,
    kindMask: (i.vectorInput ? 1 : 0) | (j.vectorInput ? 2 : 0),
  };
}

function domainOffsetEnd(value, end) {
  if (value == null) return { vector: [0, 0, 0], vectorInput: false };
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw contractError('INVALID_MEMBER_OFFSET', `Member ${end}-end offset must be finite and nonnegative.`);
    }
    return { vector: [end === 'i' ? value : -value, 0, 0], vectorInput: false };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw contractError('INVALID_MEMBER_OFFSET', `Member ${end}-end offset must be a number or vector.`);
  }
  const unknown = Object.keys(value).filter((key) => !['dx', 'dy', 'dz'].includes(key));
  if (unknown.length) throw contractError('INVALID_MEMBER_OFFSET', `Unsupported offset component: ${unknown[0]}.`);
  const vector = ['dx', 'dy', 'dz'].map((key) => value[key] ?? 0);
  if (vector.some((component) => typeof component !== 'number' || !Number.isFinite(component))) {
    throw contractError('INVALID_MEMBER_OFFSET', 'Member offset components must be finite numbers.');
  }
  return { vector, vectorInput: true };
}

function insertionPointCode(value) {
  const name = value == null ? 'centroid' : typeof value === 'string' ? value : value?.position;
  const index = INSERTION_POINTS.indexOf(name);
  if (index < 0) throw contractError('DOMAIN_MEMBER_INSERTION_POINT_INVALID', `Unsupported insertion point: ${name}.`);
  return index;
}

function releaseCode(value) {
  const normalized = String(value || 'rigid').toLowerCase();
  if (normalized === 'pin' || normalized === 'pinned') return 1;
  if (normalized === 'custom') return 2;
  return 0;
}

function releaseValue(code) {
  if (code === 1) return 'pin';
  if (code === 2) return 'custom';
  return 'rigid';
}

function packMemberRotationalSprings(member = {}) {
  const releases = member.releases;
  if (!releases || typeof releases !== 'object'
    || !Object.prototype.hasOwnProperty.call(releases, 'spring')) {
    return { values: [0, 0, 0, 0], mask: 0 };
  }
  const spring = releases.spring;
  if (!spring || typeof spring !== 'object' || Array.isArray(spring)) {
    throw contractError('DOMAIN_ROTATIONAL_SPRING_INVALID', `member ${text(member.id) || '?'} releases.spring must be an object.`);
  }
  const unknown = Object.keys(spring).filter((key) => !MEMBER_ROTATIONAL_SPRING_COMPONENTS.includes(key));
  if (unknown.length > 0) {
    throw contractError(
      'DOMAIN_ROTATIONAL_SPRING_INVALID',
      `member ${text(member.id) || '?'} releases.spring contains unsupported component ${unknown[0]}.`,
    );
  }
  const values = [0, 0, 0, 0];
  let mask = 0;
  MEMBER_ROTATIONAL_SPRING_COMPONENTS.forEach((component, componentIndex) => {
    if (!Object.prototype.hasOwnProperty.call(spring, component)) return;
    const value = spring[component];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw contractError(
        'DOMAIN_ROTATIONAL_SPRING_INVALID',
        `member ${text(member.id) || '?'} releases.spring.${component} must be a finite nonnegative number.`,
      );
    }
    values[componentIndex] = value;
    mask |= 1 << componentIndex;
  });
  return { values, mask };
}

function unpackMemberRotationalSprings(buffers, memberIndex) {
  const mask = buffers.memberRotationalSpringMask[memberIndex];
  if (mask === 0) return null;
  const spring = {};
  MEMBER_ROTATIONAL_SPRING_COMPONENTS.forEach((component, componentIndex) => {
    if ((mask & (1 << componentIndex)) === 0) return;
    spring[component] = buffers.memberRotationalSprings[
      memberIndex * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length + componentIndex
    ];
  });
  return spring;
}

function validMemberRotationalSpringValues(values, masks) {
  for (let memberIndex = 0; memberIndex < masks.length; memberIndex += 1) {
    for (let componentIndex = 0; componentIndex < MEMBER_ROTATIONAL_SPRING_COMPONENTS.length; componentIndex += 1) {
      const value = values[memberIndex * MEMBER_ROTATIONAL_SPRING_COMPONENTS.length + componentIndex];
      const present = (masks[memberIndex] & (1 << componentIndex)) !== 0;
      if (!Number.isFinite(value) || value < 0 || (!present && value !== 0)) return false;
    }
  }
  return true;
}

function validMemberRotationalSpringLayout(layouts) {
  const releaseCodes = layouts?.memberReleaseCodes;
  const components = layouts?.memberRotationalSprings;
  const mask = layouts?.memberRotationalSpringMask;
  return Array.isArray(releaseCodes)
    && releaseCodes.length === 2
    && releaseCodes[0] === 'i'
    && releaseCodes[1] === 'j'
    && Array.isArray(components)
    && components.length === MEMBER_ROTATIONAL_SPRING_COMPONENTS.length
    && components.every((component, index) => component === MEMBER_ROTATIONAL_SPRING_COMPONENTS[index])
    && mask?.encoding === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.encoding
    && mask?.absent === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.absent
    && mask?.presentZero === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.presentZero
    && MEMBER_ROTATIONAL_SPRING_COMPONENTS.every(
      (component) => mask?.bits?.[component] === MEMBER_ROTATIONAL_SPRING_MASK_LAYOUT.bits[component],
    );
}

function directionCode(value) {
  return ({ '+x': 1, '-x': -1, '+y': 2, '-y': -2, '+z': 3, '-z': -3 })[String(value || '').toLowerCase()] || 0;
}

function directionValue(code) {
  return ({ 1: '+x', '-1': '-x', 2: '+y', '-2': '-y', 3: '+z', '-3': '-z' })[code] || null;
}

function resolveShellPressureLoad(load, shellIndex, shells) {
  const resolved = resolveShellPressureDefinition(load);
  if (!resolved.ok) {
    const code = resolved.reason === 'SHELL_PRESSURE_TARGET_INVALID'
      ? 'DOMAIN_SHELL_PRESSURE_TARGET_INVALID'
      : 'DOMAIN_SHELL_PRESSURE_VALUE_INVALID';
    throw contractError(
      code,
      `Shell pressure ${text(load.id) || '?'} is invalid: ${resolved.message}`,
    );
  }
  const target = resolved.target;
  const targetIndex = shellIndex.get(target);
  if (!Number.isInteger(targetIndex)) {
    throw contractError(
      'DOMAIN_SHELL_PRESSURE_TARGET_INVALID',
      `Shell pressure ${text(load.id) || '?'} references unknown or non-FEM shell ${target}.`,
    );
  }
  if (!['plate', 'shell', 'fem'].includes(shells[targetIndex]?.formulation)) {
    throw contractError(
      'DOMAIN_SHELL_PRESSURE_TARGET_UNSUPPORTED',
      `Shell pressure ${text(load.id) || '?'} targets formulation ${shells[targetIndex]?.formulation || 'unknown'}.`,
    );
  }
  return { shellIndex: targetIndex, q: resolved.q };
}

function unpackTypedLoad(dictionaries, buffers, id, index) {
  const kind = buffers.loadTargetKind[index];
  const target = buffers.loadTargetIndex[index];
  const offset = index * 6;
  const values = buffers.loadValues.slice(offset, offset + 6);
  const base = {
    id,
    case: dictionaries.loadCaseIds[buffers.loadCase[index]],
  };
  if (kind === 3) {
    return {
      ...base,
      type: 'shellPressure',
      shell: dictionaries.shellIds[target],
      q: values[0],
    };
  }
  const direction = directionValue(buffers.loadDirection[index]);
  const decoded = {
    ...base,
    ...(kind === 1 ? { node: dictionaries.nodeIds[target] } : {}),
    ...(kind === 2 ? { member: dictionaries.memberIds[target] } : {}),
    ...(direction ? { dir: direction } : {}),
    P: values[0],
    w: values[1],
    M: values[2],
    position: values[3],
    a: values[4],
    b: values[5],
  };
  return decoded;
}

function canonicalUnits(model) {
  const source = model.unitSystem?.internal || model.units || {};
  return {
    length: source.length || 'm',
    force: source.force || 'kN',
    moment: source.moment || 'kN.m',
  };
}

function dictionaryIds(records, referenced, label) {
  const ids = records.map((row) => text(row.id)).filter(Boolean);
  for (const value of referenced) if (text(value) && !ids.includes(String(value))) ids.push(String(value));
  if (new Set(ids).size !== ids.length) throw contractError('DOMAIN_ID_DUPLICATE', 'Duplicate ' + label + ' ID.');
  return ids;
}

function uniqueIds(records, label) {
  const ids = records.map((row) => text(row.id));
  if (ids.some((id) => !id)) throw contractError('DOMAIN_ID_REQUIRED', label + ' ID is required.');
  if (new Set(ids).size !== ids.length) throw contractError('DOMAIN_ID_DUPLICATE', 'Duplicate ' + label + ' ID.');
  return ids;
}

function uniqueShellIds(records) {
  const ids = records.map((row) => (typeof row?.id === 'string' ? row.id.trim() : ''));
  if (ids.some((id) => !id)) throw contractError('DOMAIN_ID_REQUIRED', 'shell ID is required.');
  if (new Set(ids).size !== ids.length) throw contractError('DOMAIN_ID_DUPLICATE', 'Duplicate shell ID.');
  return ids;
}

function indexMap(ids) {
  return new Map(ids.map((id, index) => [id, index]));
}

function requiredIndex(map, value, field) {
  const index = map.get(String(value ?? ''));
  if (!Number.isInteger(index)) throw contractError('DOMAIN_REFERENCE_INVALID', field + ' references an unknown ID.');
  return index;
}

function finite(value, field) {
  const number = strictNumber(value);
  if (!Number.isFinite(number)) throw contractError('DOMAIN_NONFINITE', field + ' must be finite.');
  return number;
}

function strictNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

function numberOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function text(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function contractError(code, message) {
  return Object.assign(new Error(message), { code });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function detectEndianness() {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setUint16(0, 0x00ff, true);
  return new Uint16Array(buffer)[0] === 0x00ff ? 'LE' : 'BE';
}
