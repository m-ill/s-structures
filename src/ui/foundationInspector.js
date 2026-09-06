import { memberAxes } from '../core/memberAxes.js';

export const FOUNDATION_INSPECTOR_VERSION = 'p14-m1-foundation-inspector-v1';

export function buildFoundationInspector(model = {}, analysis = null, selection = {}) {
  const propertyById = new Map((model.foundationProperties || []).map((row) => [row.id, row]));
  const result = selectedResult(analysis, selection.comboId);
  const memberIds = selection.memberIds?.length
    ? new Set(selection.memberIds.map(String))
    : selection.memberId ? new Set([String(selection.memberId)]) : null;
  const members = (model.members || [])
    .filter((member) => member.foundationId && (!memberIds || memberIds.has(String(member.id))))
    .map((member) => inspectorMember(model, member, propertyById.get(member.foundationId), result));
  return {
    version: FOUNDATION_INSPECTOR_VERSION,
    comboId: result?.combo?.id || selection.comboId || null,
    propertyCount: propertyById.size,
    assignedMemberCount: (model.members || []).filter((member) => member.foundationId).length,
    selectedMemberCount: members.length,
    properties: [...propertyById.values()].map((property) => ({
      id: property.id,
      name: property.name || property.id,
      behavior: property.behavior,
      localY: clone(property.localY),
      localZ: clone(property.localZ),
      propertyHash: property.propertyHash || null,
    })),
    members,
    glyphs: members.map((row) => row.glyph),
  };
}

function inspectorMember(model, member, property, result) {
  const n1 = (model.nodes || []).find((node) => node.id === member.n1);
  const n2 = (model.nodes || []).find((node) => node.id === member.n2);
  const axes = n1 && n2 ? memberAxes(n1, n2, member.localAxis) : null;
  const response = result?.foundationResults?.[member.id] || result?.memberResults?.[member.id]?.foundation || null;
  const midpoint = n1 && n2 ? {
    x: (Number(n1.x) + Number(n2.x)) / 2,
    y: (Number(n1.y) + Number(n2.y)) / 2,
    z: (Number(n1.z || 0) + Number(n2.z || 0)) / 2,
  } : null;
  return {
    memberId: member.id,
    propertyId: member.foundationId,
    propertyMissing: !property,
    lineStiffness: {
      localY: Number(property?.localY?.lineStiffness) || 0,
      localZ: Number(property?.localZ?.lineStiffness) || 0,
    },
    response: response ? {
      status: 'SOLVED',
      stations: clone(response.stations),
      resultant: clone(response.resultant),
      centroid: clone(response.centroid),
      strainEnergy: response.strainEnergy,
      resultHash: response.resultHash,
    } : { status: 'NOT_RUN', stations: [] },
    glyph: {
      kind: 'winkler-line-local-axis',
      memberId: member.id,
      origin: midpoint,
      localY: axes?.y || null,
      localZ: axes?.z || null,
      activeLocalY: (Number(property?.localY?.lineStiffness) || 0) > 0,
      activeLocalZ: (Number(property?.localZ?.lineStiffness) || 0) > 0,
    },
  };
}

function selectedResult(analysis, comboId) {
  if (comboId && analysis?.byCombo?.[comboId]) return analysis.byCombo[comboId];
  return Object.values(analysis?.byCombo || {}).find((row) => row?.foundationResults) || analysis?.envelope || null;
}
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
