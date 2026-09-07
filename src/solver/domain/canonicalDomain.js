import { buildAnalysisDomainHashes } from '../../core/analysisDomainHashes.js';
import { resolveRigidDiaphragms } from '../../core/diaphragmGroups.js';
import { stableHash } from '../../core/stableHash.js';
import { resolveShellPressureLoad } from '../../core/shellPressureLoad.js';
import { deriveStories } from '../../core/storyModel.js';
import { expandAdvancedLoads } from '../elasticExpansion.js';
import { createSelfWeightLoads } from '../linear3dPost.js';
import { expandSemiRigidDiaphragms } from '../semiRigidDiaphragm.js';
import { expandShellsToFrameLinks } from '../shell/shellAssembly.js';
import { scanAnalysisDomainCapabilities } from './capabilityScan.js';
import { buildConstraintSystem } from './constraintSystem.js';
import { buildElementDescriptors } from './elementDescriptor.js';

export const CANONICAL_ANALYSIS_DOMAIN_VERSION = 'p8-m1-canonical-analysis-domain-v1';

export function buildCanonicalAnalysisDomain(model = {}, options = {}) {
  const sourceModelHash = stableHash(model);
  const source = clone(model);
  const analysisCase = clone(options.analysisCase || null);
  const semiRigid = options.includeGenerated === false ? emptySemiRigid() : expandSemiRigidDiaphragms(source);
  const shellAssembly = options.includeGenerated === false ? emptyShellAssembly() : expandShellsToFrameLinks(source);
  const shellCandidates = [
    ...(Array.isArray(source.shells) ? source.shells : []),
    ...(Array.isArray(source.slabs) ? source.slabs.filter((item) => item?.type === 'shell') : []),
  ];
  const generatedMembers = [...semiRigid.members, ...shellAssembly.members].map((member) => ({
    ...member,
    generated: true,
    massless: true,
  }));
  const generatedSections = [...semiRigid.sections, ...shellAssembly.sections];
  const allNodes = sorted(source.nodes || []);
  const nodeIds = new Set(allNodes.map((node) => node.id));
  const activeMemberIds = options.activeMemberIds instanceof Set ? options.activeMemberIds : null;
  const candidateMembers = sorted([...(source.members || []), ...generatedMembers]);
  const knownMemberIds = new Set(candidateMembers.map((member) => member.id));
  const selectedMembers = candidateMembers
    .filter((member) => !activeMemberIds || member.generated || activeMemberIds.has(member.id));
  const referenceErrors = selectedMembers
    .filter((member) => !nodeIds.has(member.n1) || !nodeIds.has(member.n2))
    .map((member) => domainIssue(
      'ELEMENT_NODE_REFERENCE_INVALID',
      'member',
      member.id,
      `Member ${member.id} references missing node ${!nodeIds.has(member.n1) ? member.n1 : member.n2}.`,
    ));
  const allMembers = selectedMembers.filter((member) => nodeIds.has(member.n1) && nodeIds.has(member.n2));
  const memberIds = new Set(allMembers.map((member) => member.id));
  const candidateLinks = sorted(source.links || []);
  referenceErrors.push(...candidateLinks
    .filter((link) => !nodeIds.has(link.n1) || !nodeIds.has(link.n2))
    .map((link) => domainIssue(
      'ELASTIC_LINK_NODE_REFERENCE_MISSING',
      'link',
      link.id,
      `Elastic link ${link.id || '(unnamed)'} references missing node ${!nodeIds.has(link.n1) ? link.n1 : link.n2}.`,
    )));
  const allLinks = candidateLinks.filter((link) => nodeIds.has(link.n1) && nodeIds.has(link.n2));
  const allSections = sorted([...(source.sections || []), ...generatedSections]);
  const loadExpansion = options.includeLoads === false
    ? { solverLoads: [], loads: [], trace: [], handcalc: [] }
    : expandAdvancedLoads(source.loads || [], source);
  let loads = options.includeLoads === false ? [] : clone(loadExpansion.solverLoads || loadExpansion.loads || []);
  if (options.includeLoads !== false && source.analysisSettings?.includeSelfWeight) {
    loads.push(...createSelfWeightLoads(source));
  }
  if (options.factors || options.scale) loads = loads.map((load) => scaleLoad(load, options.factors, options.scale)).filter(Boolean);
  if (Array.isArray(options.extraLoads)) loads.push(...clone(options.extraLoads));
  const shellLoadErrors = validateShellPressureLoads(loads, shellCandidates);
  referenceErrors.push(...loads.flatMap((load) => {
    if (load.node && !nodeIds.has(load.node)) {
      return [domainIssue('LOAD_NODE_REFERENCE_INVALID', 'load', load.id, `Load ${load.id || '(unnamed)'} references missing node ${load.node}.`)];
    }
    if (load.member && !knownMemberIds.has(load.member)) {
      return [domainIssue('LOAD_MEMBER_REFERENCE_INVALID', 'load', load.id, `Load ${load.id || '(unnamed)'} references missing member ${load.member}.`)];
    }
    return [];
  }));
  loads = sorted(loads.filter((load) => (
    (!load.node || nodeIds.has(load.node))
    && (!load.member || memberIds.has(load.member))
  )));

  const solverModel = {
    ...source,
    nodes: allNodes,
    members: allMembers,
    links: allLinks,
    materials: sorted(source.materials || []),
    sections: allSections,
    loads,
    loadCases: sorted(source.loadCases || []),
    loadCombinations: sorted(source.loadCombinations || []),
    massSources: sorted(source.massSources || []),
    diaphragms: sorted(source.diaphragms || []),
  };
  const rigidDiaphragms = resolveRigidDiaphragms(solverModel, allNodes);
  const constraint = buildConstraintSystem(allNodes, rigidDiaphragms, {
    ...(options.constraintOptions || {}),
    constraints: solverModel.constraints || [],
  });
  const elements = buildElementDescriptors(solverModel, allNodes, allMembers);
  const shellErrors = (shellAssembly.errors || []).map((error) => domainIssue(
    error.code || 'SHELL_ASSEMBLY_INVALID',
    'shell',
    error.shellId || null,
    `Shell ${error.shellId || '(unnamed)'} cannot enter the canonical analysis domain.`,
  ));
  const elementErrors = [...referenceErrors, ...elements.errors, ...shellErrors, ...shellLoadErrors]
    .sort((a, b) => `${a.code}:${a.entityId || a.elementId || ''}`.localeCompare(`${b.code}:${b.entityId || b.elementId || ''}`));
  const capabilities = scanAnalysisDomainCapabilities(source, analysisCase, options.capabilityOptions);
  const strictBlocked = options.strictCapabilities === true && !capabilities.ok;
  const allowInvalidReferences = options.allowInvalidReferences === true;
  const ok = constraint.ok && elements.errors.length === 0 && shellErrors.length === 0 && shellLoadErrors.length === 0
    && (allowInvalidReferences || referenceErrors.length === 0) && !strictBlocked;
  const reason = !constraint.ok
    ? constraint.reason
    : referenceErrors.length && !allowInvalidReferences ? 'DOMAIN_REFERENCE_INVALID'
      : shellErrors.length ? 'SHELL_ASSEMBLY_INVALID'
        : shellLoadErrors.length ? 'SHELL_LOAD_INVALID'
          : !elements.ok ? 'ELEMENT_DESCRIPTOR_INVALID' : strictBlocked ? 'DOMAIN_CAPABILITY_UNSUPPORTED' : null;
  const originMap = buildOriginMap(allMembers, allSections, source);
  const metadata = buildDomainMetadata(solverModel, originMap, rigidDiaphragms);
  const hashes = buildAnalysisDomainHashes(solverModel, analysisCase);
  const snapshot = {
    nodes: allNodes,
    members: allMembers,
    links: allLinks,
    materials: solverModel.materials,
    sections: allSections,
    loads,
    mass: massSnapshot(solverModel, elements.descriptors),
    nonlinear: nonlinearSnapshot(source),
  };
  const identity = {
    version: CANONICAL_ANALYSIS_DOMAIN_VERSION,
    domainHash: hashes.domainHash,
    topologyHash: hashes.topologyHash,
    propertyHash: hashes.propertyHash,
    constraintHash: hashes.constraintHash,
    loadHash: hashes.loadHash,
    massHash: hashes.massHash,
    nonlinearHash: hashes.nonlinearHash,
    outputHash: hashes.outputHash,
    nodeIds: allNodes.map((node) => node.id),
    elementIds: allMembers.map((member) => member.id),
    linkIds: allLinks.map((link) => link.id),
    descriptorHashes: elements.descriptors.map((item) => [item.id, item.descriptorHash]),
    constraintContractHash: constraint.hash || null,
    originMapHash: stableHash(originMap).slice(0, 24),
    metadataHash: stableHash(metadata).slice(0, 24),
    unitSystemHash: stableHash(metadata.unitSystem).slice(0, 24),
  };
  identity.identityHash = stableHash(identity).slice(0, 24);
  const domain = {
    version: CANONICAL_ANALYSIS_DOMAIN_VERSION,
    ok,
    reason,
    sourceModelHash,
    sourceMutationDetected: stableHash(model) !== sourceModelHash,
    analysisCase,
    hashes,
    identity,
    snapshot,
    nodes: allNodes,
    members: allMembers,
    links: allLinks,
    loads,
    solverModel,
    rigidDiaphragms,
    constraint,
    elements: elements.descriptors,
    elementErrors,
    descriptorErrors: elements.errors,
    shellLoadErrors,
    referenceErrors,
    referencePolicy: allowInvalidReferences ? 'skip-invalid' : 'fail',
    originMap,
    metadata,
    capabilities,
    expansion: loadExpansion,
    semiRigid,
    shellAssembly,
    generatedMemberIds: generatedMembers.map((member) => member.id).sort(),
    generatedSectionIds: generatedSections.map((section) => section.id).sort(),
    loadDerivation: {
      factored: Boolean(options.factors || options.scale),
      extraLoadCount: Array.isArray(options.extraLoads) ? options.extraLoads.length : 0,
      structuralSnapshotReused: false,
    },
  };
  domain.snapshotHash = stableHash(snapshot).slice(0, 24);
  if (domain.sourceMutationDetected) {
    const error = new Error('Canonical domain construction mutated the source model.');
    error.code = 'CANONICAL_DOMAIN_SOURCE_MUTATED';
    throw error;
  }
  return deepFreeze(domain);
}

export function deriveCanonicalAnalysisDomain(baseDomain, options = {}) {
  if (baseDomain?.version !== CANONICAL_ANALYSIS_DOMAIN_VERSION || baseDomain.loadDerivation?.factored) {
    const error = new TypeError('An unfactored canonical base domain is required.');
    error.code = 'CANONICAL_BASE_DOMAIN_INVALID';
    throw error;
  }
  if (options.activeMemberIds) {
    const error = new Error('Active-member filtering requires a new canonical domain build.');
    error.code = 'CANONICAL_BASE_DOMAIN_ACTIVE_SET_UNSUPPORTED';
    throw error;
  }
  const analysisCase = clone(options.analysisCase || baseDomain.analysisCase || null);
  let loads = baseDomain.loads.map((load) => scaleLoad(load, options.factors, options.scale)).filter(Boolean);
  if (Array.isArray(options.extraLoads)) loads.push(...clone(options.extraLoads));
  const nodeIds = new Set(baseDomain.nodes.map((node) => node.id));
  const memberIds = new Set(baseDomain.members.map((member) => member.id));
  loads = sorted(loads.filter((load) => (
    (!load.node || nodeIds.has(load.node))
    && (!load.member || memberIds.has(load.member))
  )));
  const solverModel = { ...baseDomain.solverModel, loads };
  const shellLoadErrors = validateShellPressureLoads(loads, [
    ...(Array.isArray(solverModel.shells) ? solverModel.shells : []),
    ...(Array.isArray(solverModel.slabs) ? solverModel.slabs.filter((item) => item?.type === 'shell') : []),
  ]);
  const capabilities = scanAnalysisDomainCapabilities(solverModel, analysisCase, options.capabilityOptions);
  const strictBlocked = options.strictCapabilities === true && !capabilities.ok;
  const structuralReason = !baseDomain.constraint.ok
    ? baseDomain.constraint.reason
    : baseDomain.shellAssembly?.errors?.length ? 'SHELL_ASSEMBLY_INVALID'
    : shellLoadErrors.length ? 'SHELL_LOAD_INVALID'
    : baseDomain.referenceErrors?.length && baseDomain.referencePolicy !== 'skip-invalid' ? 'DOMAIN_REFERENCE_INVALID'
      : baseDomain.descriptorErrors?.length ? 'ELEMENT_DESCRIPTOR_INVALID' : null;
  const hashes = buildAnalysisDomainHashes(solverModel, analysisCase);
  const snapshot = { ...baseDomain.snapshot, loads };
  const identity = {
    ...baseDomain.identity,
    domainHash: hashes.domainHash,
    topologyHash: hashes.topologyHash,
    propertyHash: hashes.propertyHash,
    constraintHash: hashes.constraintHash,
    loadHash: hashes.loadHash,
    massHash: hashes.massHash,
    nonlinearHash: hashes.nonlinearHash,
    outputHash: hashes.outputHash,
  };
  delete identity.identityHash;
  identity.identityHash = stableHash(identity).slice(0, 24);
  const derived = {
    ...baseDomain,
    ok: !structuralReason && !strictBlocked,
    reason: structuralReason || (strictBlocked ? 'DOMAIN_CAPABILITY_UNSUPPORTED' : null),
    analysisCase,
    hashes,
    identity,
    snapshot,
    snapshotHash: stableHash(snapshot).slice(0, 24),
    loads,
    solverModel,
    shellLoadErrors,
    capabilities,
    loadDerivation: {
      factored: Boolean(options.factors || options.scale),
      extraLoadCount: Array.isArray(options.extraLoads) ? options.extraLoads.length : 0,
      structuralSnapshotReused: true,
      baseIdentityHash: baseDomain.identity.identityHash,
    },
  };
  return deepFreeze(derived);
}

function buildOriginMap(members, sections, source = {}) {
  const wallByMember = new Map((source.wallEquivalents || []).map((row) => [row.memberId, row]));
  return {
    members: members.map((member) => {
      const wall = wallByMember.get(member.id);
      return {
        generatedId: member.id,
        generated: member.generated === true || Boolean(wall),
        originType: wall ? 'wall' : member.diaphragmId ? 'diaphragm' : member.shellId ? 'shell' : 'member',
        originId: wall?.wallId || member.diaphragmId || member.shellId || member.id,
        formulation: wall ? 'mid-pier-equivalent' : member.source || (member.generated ? 'generated' : 'native-frame'),
        qualification: wall || member.shellId || member.diaphragmId ? 'preliminary-equivalent' : 'production-frame',
      };
    }),
    sections: sections.map((section) => ({
      generatedId: section.id,
      generated: String(section.id || '').startsWith('__'),
      originId: section.sourceSection || section.id,
    })),
  };
}

function buildDomainMetadata(model, originMap, rigidDiaphragms) {
  const stories = deriveStories(model).map((story) => ({
    id: story.id,
    index: story.index,
    baseZ: story.baseZ,
    topZ: story.topZ,
    height: story.height,
    nodeIds: [...story.nodeIds],
  }));
  const nodeStory = Object.fromEntries(stories.flatMap((story) => story.nodeIds.map((nodeId) => [nodeId, story.id])));
  const unitSystem = clone(
    model.unitSystem
    || model.units
    || model.analysisSettings?.unitSystem
    || model.analysisSettings?.units
    || { length: 'm', force: 'kN', mass: 'tonne', time: 's' },
  );
  return {
    version: 'p8-m9-canonical-domain-metadata-v1',
    unitSystem,
    stories,
    nodeStory,
    diaphragms: (model.diaphragms || []).map((item) => ({
      id: item.id,
      type: item.type,
      nodeIds: [...(item.nodeIds || [])].sort(),
      masterNodeId: item.masterNodeId || null,
    })),
    rigidDiaphragmIds: (rigidDiaphragms || []).map((item) => item.id).sort(),
    massSourceIds: (model.massSources || []).map((item) => item.id).filter(Boolean).sort(),
    originTypes: [...new Set((originMap.members || []).map((item) => item.originType))].sort(),
  };
}

function massSnapshot(model, descriptors) {
  return {
    sources: sorted(model.massSources || []),
    nodes: (model.nodes || []).map((node) => ({ id: node.id, mass: clone(node.mass ?? null) })),
    members: descriptors.map((item) => ({
      id: item.id,
      massless: item.massless,
      length: item.geometry.length,
      density: Number(item.propertySnapshot.material?.density || 0),
      area: Number(item.propertySnapshot.section?.A || item.propertySnapshot.section?.properties?.A || 0),
    })),
  };
}

function nonlinearSnapshot(model) {
  return {
    ...((model.zeroLengthPmmHinges?.length || model.pmmHinges?.length) ? {zeroLengthPmmHinges:sorted(model.zeroLengthPmmHinges||model.pmmHinges)} : {}),
    nonlinearMaterials: sorted(model.nonlinearMaterials || []),
    nonlinearSections: sorted(model.nonlinearSections || []),
    hingeProperties: sorted(model.hingeProperties || []),
    linkProperties: sorted(model.linkProperties || []),
  };
}

function scaleLoad(load, factors, scaleFn) {
  let factor = 1;
  if (factors) {
    const loadFactor = factors[load.case || 'LC1'];
    if (loadFactor == null || Number(loadFactor) === 0) return null;
    factor *= Number(loadFactor);
  }
  if (typeof scaleFn === 'function') factor *= Number(scaleFn(load));
  else if (scaleFn != null) factor *= Number(scaleFn);
  if (!Number.isFinite(factor) || factor === 0) return null;
  const scaled = clone(load);
  for (const key of ['P', 'w', 'w1', 'w2', 'M', 'dT', 'dTtop', 'dTbot']) {
    if (scaled[key] != null) scaled[key] = Number(scaled[key]) * factor;
  }
  return scaled;
}

function sorted(values) {
  return clone(values).sort((a, b) => stableKey(a).localeCompare(stableKey(b)));
}

function stableKey(value) {
  const primary = value?.id || value?.node || value?.member || '';
  return `${String(primary)}:${stableHash(value)}`;
}

function domainIssue(code, entityType, entityId, message) {
  return { code, entityType, entityId: entityId || null, elementId: entityType === 'member' ? entityId || null : null, message };
}

function emptySemiRigid() {
  return { version: 'disabled', braceCount: 0, rows: [], members: [], sections: [] };
}

function emptyShellAssembly() {
  return {
    ok: true,
    reason: null,
    version: 'disabled',
    shellCount: 0,
    linkCount: 0,
    femElements: [],
    femElementCount: 0,
    equivalentShellCount: 0,
    rows: [],
    members: [],
    sections: [],
    errors: [],
    warnings: [],
    limitations: [],
  };
}

function validateShellPressureLoads(loads = [], shells = []) {
  const shellById = new Map(shells
    .filter((shell) => typeof shell?.id === 'string' && shell.id.trim())
    .map((shell) => [shell.id.trim(), shell]));
  return loads.flatMap((load) => {
    if (load?.type !== 'pressure' && load?.type !== 'shellPressure') return [];
    const resolved = resolveShellPressureLoad(load);
    if (!resolved.ok) {
      return [domainIssue(resolved.reason, 'load', load.id || null, `Shell pressure ${load.id || '(unnamed)'} is invalid: ${resolved.message}`)];
    }
    const target = resolved.target;
    const shell = shellById.get(target);
    if (!shell) {
      return [domainIssue('SHELL_PRESSURE_TARGET_INVALID', 'load', load.id || null, `Shell pressure ${load.id || '(unnamed)'} references missing shell ${target}.`)];
    }
    if (!['plate', 'shell', 'fem'].includes(shell.formulation)) {
      return [domainIssue('SHELL_PRESSURE_FORMULATION_UNSUPPORTED', 'load', load.id || null, `Shell ${target} does not support transverse pressure.`)];
    }
    return [];
  });
}

function clone(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
