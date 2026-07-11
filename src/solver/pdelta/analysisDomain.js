import { expandAdvancedLoads } from '../elasticExpansion.js';
import { createSelfWeightLoads } from '../linear3dPost.js';
import { expandSemiRigidDiaphragms } from '../semiRigidDiaphragm.js';
import { expandShellsToFrameLinks } from '../shell/shellAssembly.js';

export const PDELTA_ANALYSIS_DOMAIN_VERSION = 'p7-m8-expanded-analysis-domain-v1';

export function buildExpandedAnalysisDomain(model = {}, factors = null, options = {}) {
  const semiRigid = expandSemiRigidDiaphragms(model);
  const shellAssembly = expandShellsToFrameLinks(model);
  const generatedMembers = [...semiRigid.members, ...shellAssembly.members];
  const generatedSections = [...semiRigid.sections, ...shellAssembly.sections];
  const solverModel = generatedMembers.length
    ? {
        ...model,
        members: [...(model.members || []), ...generatedMembers],
        sections: [...(model.sections || []), ...generatedSections],
      }
    : model;
  const activeMemberIds = options.activeMemberIds || null;
  const selectedMembers = activeMemberIds
    ? (solverModel.members || []).filter((member) => member.generated || activeMemberIds.has(member.id))
    : (solverModel.members || []);
  const nodes = solverModel.nodes || [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const members = selectedMembers.filter((member) => nodeIds.has(member.n1) && nodeIds.has(member.n2));
  const memberIds = new Set(members.map((member) => member.id));

  let loads = [...(model.loads || [])];
  const expansion = expandAdvancedLoads(loads, model);
  loads = expansion.solverLoads || expansion.loads;
  if (model.analysisSettings?.includeSelfWeight) loads = loads.concat(createSelfWeightLoads(model));
  if (factors || options.scale) loads = loads.map((load) => scaleLoad(load, factors, options.scale)).filter(Boolean);
  if (Array.isArray(options.extraLoads) && options.extraLoads.length) {
    loads = loads.concat(options.extraLoads.map((load) => ({ ...load })));
  }
  loads = loads.filter((load) => (
    (!load.node || nodeIds.has(load.node))
    && (!load.member || memberIds.has(load.member))
  ));

  return {
    version: PDELTA_ANALYSIS_DOMAIN_VERSION,
    solverModel: members === solverModel.members ? solverModel : { ...solverModel, members },
    nodes,
    members,
    loads,
    expansion,
    semiRigid,
    shellAssembly,
    generatedMemberIds: generatedMembers.map((member) => member.id),
    generatedSectionIds: generatedSections.map((section) => section.id),
  };
}

function scaleLoad(load, factors, scaleFn) {
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
  for (const key of ['P', 'w', 'w1', 'w2', 'M', 'dT', 'dTtop', 'dTbot']) {
    if (scaled[key] != null) scaled[key] = Number(scaled[key]) * factor;
  }
  return scaled;
}
