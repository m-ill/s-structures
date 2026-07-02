import assert from 'node:assert/strict';
import {
  MATERIAL_REGISTRY_VERSION,
  MATERIAL_LIBRARY_REPORT_VERSION,
  MATERIAL_LIBRARY_ACTIONS,
  MATERIAL_LIBRARY_EDIT_VERSION,
  MATERIAL_SCHEMA_VERSION,
  SECTION_SCHEMA_VERSION,
  SECTION_PROPERTIES_VERSION,
  buildLibraryAudit,
  buildMaterialLibraryReport,
  computeSectionProperties,
  createModel,
  materialOf,
  resolveSectionRecord,
  sectionOf,
  listLibrary,
  getLibraryItem,
  upsertMaterial,
  upsertSection,
  validateMaterialRecord,
  validateModel,
  validateSectionRecord,
} from '../src/index.js';
import { createIndexAgentApi } from '../src/ui/indexAgentApi.js';
import { availableAgentActions } from '../src/ui/indexAgentActionCatalog.js';
import { bootTestApp, registerAndLogin } from './helpers/serverTestApp.mjs';

const h = computeSectionProperties('H', { H: 300, B: 150, tw: 6.5, tf: 9 });
assert.equal(SECTION_PROPERTIES_VERSION, 'p3-m10-section-properties');
assert.ok(h.A > 0 && h.Iy > 0 && h.Iz > 0 && h.ry > 0);
assert.equal(MATERIAL_SCHEMA_VERSION, 'p3-m10-material-schema-v1');
assert.equal(SECTION_SCHEMA_VERSION, 'p3-m10-section-schema-v1');
assert.equal(validateMaterialRecord({
  id: 'SS275', version: 2, kind: 'steel',
  elastic: { E: 205000, G: 79000 },
  strength: { steel: { Fy: 275, Fu: 410 } },
}).ok, true);
const nonMonotonicBackbone = validateMaterialRecord({
  id: 'BAD_BACKBONE', version: 1, kind: 'steel',
  elastic: { E: 205000, G: 79000 },
  strength: { steel: { Fy: 275, Fu: 410 } },
  nonlinear: {
    model: 'bilinear',
    backbone: [{ strain: 0, stress: 0 }, { strain: 0.003, stress: 275 }, { strain: 0.002, stress: 280 }],
  },
});
assert.equal(nonMonotonicBackbone.ok, false);
assert.ok(nonMonotonicBackbone.errors.includes('nonlinear.backbone'));
const steelMissingFu = validateMaterialRecord({
  id: 'BAD_STEEL', version: 1, kind: 'steel',
  elastic: { E: 205000, G: 79000 },
  strength: { steel: { Fy: 275 } },
});
assert.equal(steelMissingFu.ok, false);
assert.ok(steelMissingFu.errors.includes('strength.steel.Fu'));
const concreteMaterial = validateMaterialRecord({
  id: 'CONC24', version: 1, kind: 'concrete',
  elastic: { E: 27000, G: 11250 },
  strength: { concrete: { fck: 24, fy_rebar: 400 } },
});
assert.equal(concreteMaterial.ok, true);
assert.equal(concreteMaterial.normalized.strength.concrete.fck, 24);
const legacyTopLevelSteel = validateMaterialRecord({
  id: 'LEGACY_TOP_STEEL', version: 1, E: 205000, G: 79000, Fy: 275, Fu: 410,
});
assert.equal(legacyTopLevelSteel.ok, true);
assert.equal(legacyTopLevelSteel.normalized.strength.steel.Fy, 275);
assert.equal(validateSectionRecord({
  id: 'H-CUSTOM', version: 1, kind: 'parametric',
  shape: 'H', params: { H: 300, B: 150, tw: 6.5, tf: 9 },
}).ok, true);
const directSectionCheck = validateSectionRecord({
  id: 'DIRECT_WARN', version: 1, kind: 'direct', shape: 'CUSTOM',
  properties: { A: 0.02, Iy: 2e-4, Iz: 1e-4, ry: 0.5, rz: 0.01 },
});
assert.equal(directSectionCheck.ok, true);
assert.ok(directSectionCheck.warnings.some((warning) => warning.startsWith('properties.ry-inconsistent')));
assert.ok(directSectionCheck.warnings.some((warning) => warning.startsWith('properties.rz-inconsistent')));

const model = createModel({
  materials: [
    { id: 'USER_STEEL', version: 1, E: 200000, G: 77000, Fy: 240, Fu: 400, density: 7.8 },
    { id: 'USER_STEEL', version: 2, E: 210000, G: 80000, Fy: 300, Fu: 450, density: 7.8 },
  ],
  sections: [{ id: 'USER_H', version: 1, shape: 'H', params: { H: 300, B: 150, tw: 6.5, tf: 9 } }],
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 0, y: 0, z: 3 }],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'USER_STEEL@2', secId: 'USER_H@1' }],
});

assert.equal(validateModel(model).ok, true);
assert.equal(materialOf(model, 'USER_STEEL@2').Fy, 300000);
assert.ok(sectionOf(model, 'USER_H@1').A > 0);
const audit = buildLibraryAudit(model);
assert.equal(audit.version, MATERIAL_REGISTRY_VERSION);
assert.deepEqual(audit.materialErrors, []);
assert.deepEqual(audit.sectionErrors, []);
assert.deepEqual(audit.sectionWarnings, []);
assert.deepEqual(audit.migrationWarnings, []);
assert.equal(audit.registryPolicy.referenceFormat, 'id@version');
assert.equal(audit.registryPolicy.editRule, 'append-only-new-version');
assert.deepEqual(audit.registryPolicy.scopePriority, ['project', 'global', 'builtin']);
assert.equal(audit.registryPolicy.deleteRule, 'soft-delete-new-references-blocked-existing-models-retained');
assert.equal(audit.scopeSummary.project, 3);
assert.deepEqual(audit.softDeletedItems, []);
assert.deepEqual(audit.appendOnlyWarnings, []);
const libraryReport = buildMaterialLibraryReport(model);
assert.equal(libraryReport.version, MATERIAL_LIBRARY_REPORT_VERSION);
assert.equal(libraryReport.contract.milestone, 'P3-M10');
assert.deepEqual(libraryReport.contract.tickets, ['P3-T46', 'P3-T47', 'P3-T48', 'P3-T49']);
assert.equal(libraryReport.contract.referenceFormat, 'id@version');
assert.ok(libraryReport.contract.agentActions.includes('upsertSection'));
assert.equal(libraryReport.summary.materialReferenceCount, 1);
assert.equal(libraryReport.summary.sectionReferenceCount, 1);
assert.equal(libraryReport.summary.unversionedReferenceCount, 0);
assert.equal(libraryReport.auditSummary.registryPolicy.editRule, 'append-only-new-version');
assert.equal(libraryReport.review.registryReady, true);
assert.equal(libraryReport.review.calculationTraceReady, true);
assert.equal(libraryReport.review.nonlinearBackboneReady, true);
assert.equal(libraryReport.review.ownerPolicyReviewRequired, true);
assert.equal(libraryReport.review.productionReady, false);
assert.deepEqual(libraryReport.review.blockers, []);
assert.equal(libraryReport.review.agentDecision, 'material-library-ready-for-engineering-review');
assert.ok(libraryReport.materials.some((row) => row.label === 'USER_STEEL@2'));
assert.equal(libraryReport.materials.find((row) => row.label === 'USER_STEEL@2').nonlinear.model, 'bilinear');
assert.deepEqual(libraryReport.materials.find((row) => row.label === 'USER_STEEL@2').sourceTrace, {
  reference: 'USER_STEEL@2',
  resolvedLabel: 'USER_STEEL@2',
  scope: 'project',
  standard: null,
  db: null,
  note: null,
  deleted: false,
  referenceStatus: 'active',
});
assert.ok(libraryReport.sections.find((row) => row.label === 'USER_H@1').properties.A > 0);
assert.equal(libraryReport.sections.find((row) => row.label === 'USER_H@1').sourceTrace.scope, 'project');

const override = createModel({
  materials: [{ id: 'steel', version: 1, E: 190000, G: 73000, Fy: 222, Fu: 333, density: 7.7 }],
  sections: [{ id: 'h300', version: 1, A: 0.0123, Iy: 1e-4, Iz: 2e-4, J: 5e-5, Zz: 1e-3, Zy: 8e-4 }],
});
assert.equal(materialOf(override, 'steel@1').Fy, 222000);
assert.equal(sectionOf(override, 'h300@1').A, 0.0123);
const scopePriorityModel = createModel({
  materials: [
    { id: 'SCOPE_STEEL', version: 1, E: 190000, G: 73000, Fy: 240, Fu: 400, source: { scope: 'global' } },
    { id: 'SCOPE_STEEL', version: 1, E: 210000, G: 80000, Fy: 355, Fu: 490, source: { scope: 'project' } },
  ],
  sections: [
    { id: 'SCOPE_H', version: 1, A: 0.01, Iy: 1e-4, Iz: 2e-4, source: { scope: 'global' } },
    { id: 'SCOPE_H', version: 1, A: 0.02, Iy: 2e-4, Iz: 3e-4, source: { scope: 'project' } },
  ],
});
assert.equal(materialOf(scopePriorityModel, 'SCOPE_STEEL@1').Fy, 355000);
assert.equal(sectionOf(scopePriorityModel, 'SCOPE_H@1').A, 0.02);
const scopePriorityAudit = buildLibraryAudit({
  ...scopePriorityModel,
  members: [{ id: 'M1', matId: 'SCOPE_STEEL@1', secId: 'SCOPE_H@1' }],
});
assert.equal(scopePriorityAudit.resolvedReferences.materials[0].source.scope, 'project');
assert.equal(scopePriorityAudit.resolvedReferences.sections[0].source.scope, 'project');
assert.equal(resolveSectionRecord(null, 'H-400x200x8x13@1').source.db, 'KS-H-2024');
const builtinReport = buildMaterialLibraryReport({
  members: [{ id: 'M1', matId: 'steel@1', secId: 'H-400x200x8x13@1' }],
});
assert.equal(builtinReport.sections[0].sourceTrace.scope, 'builtin');
assert.equal(builtinReport.sections[0].sourceTrace.db, 'KS-H-2024');
assert.equal(builtinReport.sections[0].sourceTrace.resolvedLabel, 'H-400x200x8x13@1');
assert.equal(builtinReport.sections[0].sourceTrace.referenceStatus, 'active');

const legacyRefModel = createModel({
  materials: [
    { id: 'LEGACY_STEEL', version: 1, E: 190000, G: 73000, Fy: 240, Fu: 400 },
    { id: 'LEGACY_STEEL', version: 3, E: 210000, G: 80000, Fy: 355, Fu: 490 },
  ],
  sections: [{ id: 'LEGACY_H', version: 2, shape: 'H', params: { H: 250, B: 125, tw: 6, tf: 9 } }],
  nodes: [{ id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' }, { id: 'N2', x: 0, y: 0, z: 3 }],
  members: [{ id: 'M1', n1: 'N1', n2: 'N2', matId: 'LEGACY_STEEL', secId: 'LEGACY_H' }],
});
const legacyAudit = buildLibraryAudit(legacyRefModel);
assert.deepEqual(legacyAudit.unversionedReferences.sort(), ['LEGACY_H', 'LEGACY_STEEL']);
assert.ok(legacyAudit.migrationWarnings.includes('legacy-unversioned-reference:LEGACY_STEEL'));
assert.equal(legacyAudit.resolvedReferences.materials[0].resolved, 'LEGACY_STEEL@3');
assert.equal(legacyAudit.resolvedReferences.sections[0].resolved, 'LEGACY_H@2');
const legacyReport = buildMaterialLibraryReport(legacyRefModel);
assert.equal(legacyReport.summary.unversionedReferenceCount, 2);
assert.equal(legacyReport.summary.migrationWarningCount, 2);
assert.equal(legacyReport.review.registryReady, false);
assert.equal(legacyReport.review.calculationTraceReady, false);
assert.ok(legacyReport.review.blockers.includes('legacy-unversioned-references'));
assert.equal(legacyReport.review.agentDecision, 'fix-material-library-before-analysis');

const policyAudit = buildLibraryAudit({
  materials: [
    { id: 'SOFT_STEEL', version: 1, E: 200000, G: 77000, Fy: 240, Fu: 400, source: { scope: 'global' } },
    { id: 'SOFT_STEEL', version: 2, E: 210000, G: 80000, Fy: 300, Fu: 450, deleted: true, source: { scope: 'project' } },
    { id: 'DUP_STEEL', version: 1, E: 200000, G: 77000, Fy: 240, Fu: 400 },
    { id: 'DUP_STEEL', version: 1, E: 210000, G: 80000, Fy: 300, Fu: 450 },
  ],
  members: [{ id: 'M1', matId: 'SOFT_STEEL', secId: 'H-400x200x8x13@1' }],
});
assert.equal(policyAudit.scopeSummary.global, 1);
assert.equal(policyAudit.scopeSummary.project, 3);
assert.deepEqual(policyAudit.softDeletedItems, [{ kind: 'material', id: 'SOFT_STEEL', version: 2, label: 'SOFT_STEEL@2' }]);
assert.ok(policyAudit.appendOnlyWarnings.includes('material:duplicate-version:DUP_STEEL@1'));
assert.equal(policyAudit.resolvedReferences.materials[0].resolved, 'SOFT_STEEL@1');
const deletedExactAudit = buildLibraryAudit({
  materials: [
    { id: 'SOFT_STEEL', version: 1, E: 200000, G: 77000, Fy: 240, Fu: 400 },
    { id: 'SOFT_STEEL', version: 2, E: 210000, G: 80000, Fy: 300, Fu: 450, deleted: true },
  ],
  sections: [
    { id: 'SOFT_H', version: 1, A: 0.01, Iy: 1e-4, Iz: 2e-4 },
    { id: 'SOFT_H', version: 2, A: 0.02, Iy: 2e-4, Iz: 3e-4, deleted: true },
  ],
  members: [{ id: 'M1', matId: 'SOFT_STEEL@2', secId: 'SOFT_H@2' }],
});
assert.equal(deletedExactAudit.resolvedReferences.materials[0].resolved, 'SOFT_STEEL@2');
assert.equal(deletedExactAudit.resolvedReferences.materials[0].referenceStatus, 'soft-deleted-traceable-reference');
assert.equal(deletedExactAudit.resolvedReferences.sections[0].resolved, 'SOFT_H@2');
assert.equal(deletedExactAudit.resolvedReferences.sections[0].deleted, true);
assert.equal(deletedExactAudit.softDeletedReferences.length, 2);
const deletedExactReport = buildMaterialLibraryReport({
  materials: deletedExactAudit.resolvedReferences.materials.map(() => (
    { id: 'SOFT_STEEL', version: 2, E: 210000, G: 80000, Fy: 300, Fu: 450, deleted: true }
  )),
  sections: [{ id: 'SOFT_H', version: 2, A: 0.02, Iy: 2e-4, Iz: 3e-4, deleted: true }],
  members: [{ id: 'M1', matId: 'SOFT_STEEL@2', secId: 'SOFT_H@2' }],
});
assert.equal(deletedExactReport.summary.softDeletedReferenceCount, 2);
assert.ok(deletedExactReport.review.blockers.includes('soft-deleted-references-require-review'));
assert.equal(deletedExactReport.materials[0].sourceTrace.referenceStatus, 'soft-deleted-traceable-reference');

const directAudit = buildLibraryAudit({
  sections: [{
    id: 'DIRECT_WARN', version: 1, kind: 'direct', shape: 'CUSTOM',
    properties: { A: 0.02, Iy: 2e-4, Iz: 1e-4, ry: 0.5, rz: 0.01 },
  }],
});
assert.ok(directAudit.sectionWarnings.some((warning) => warning.includes('DIRECT_WARN:properties.ry-inconsistent')));
const directReport = buildMaterialLibraryReport({
  sections: [{
    id: 'DIRECT_WARN', version: 1, kind: 'direct', shape: 'CUSTOM',
    properties: { A: 0.02, Iy: 2e-4, Iz: 1e-4, ry: 0.5, rz: 0.01 },
  }],
  members: [{ id: 'M1', matId: 'steel@1', secId: 'DIRECT_WARN@1' }],
});
assert.equal(directReport.review.sectionPropertyReviewRequired, true);

const badStrengthReport = buildMaterialLibraryReport({
  materials: [{ id: 'BAD_STEEL', version: 1, kind: 'steel', E: 205000, G: 79000, Fy: 275 }],
  members: [{ id: 'M1', matId: 'BAD_STEEL@1', secId: 'H-400x200x8x13@1' }],
});
assert.ok(badStrengthReport.summary.materialErrorCount > 0);
assert.ok(badStrengthReport.review.blockers.includes('material-schema-errors'));
assert.equal(badStrengthReport.review.registryReady, false);
const badBackboneReport = buildMaterialLibraryReport({
  materials: [{
    id: 'BAD_BACKBONE', version: 1, kind: 'steel',
    E: 205000, G: 79000, Fy: 275, Fu: 410,
    nonlinear: { model: 'bilinear', backbone: [{ strain: 0, stress: 0 }, { strain: 0, stress: 275 }] },
  }],
  members: [{ id: 'M1', matId: 'BAD_BACKBONE@1', secId: 'H-400x200x8x13@1' }],
});
assert.ok(badBackboneReport.review.blockers.includes('material-schema-errors'));

assert.equal(MATERIAL_LIBRARY_EDIT_VERSION, 'p3-m10-library-edit-v1');
assert.deepEqual(MATERIAL_LIBRARY_ACTIONS, ['listLibrary', 'getLibraryItem', 'upsertMaterial', 'upsertSection']);
const editModel = createModel();
let edit = upsertMaterial(editModel, { id: 'AGENT_STEEL', version: 1, E: 205000, G: 79000, Fy: 275, Fu: 410 });
assert.equal(edit.changed, true);
edit = upsertSection(editModel, { id: 'AGENT_H', version: 1, shape: 'H', params: { H: 350, B: 175, tw: 7, tf: 11 } });
assert.equal(edit.changed, true);
assert.ok(listLibrary(editModel, { kind: 'materials' }).items.some((item) => item.label === 'AGENT_STEEL@1'));
assert.equal(getLibraryItem(editModel, { kind: 'sections', id: 'AGENT_H', version: 1 }).item.id, 'AGENT_H');
const immutable = upsertMaterial(editModel, { id: 'AGENT_STEEL', version: 1, E: 210000, G: 80000, Fy: 300, Fu: 450 });
assert.equal(immutable.ok, false);
assert.ok(immutable.errors.includes('immutable-version'));
const immutableWithReplace = upsertMaterial(
  editModel,
  { id: 'AGENT_STEEL', version: 1, E: 210000, G: 80000, Fy: 300, Fu: 450 },
  { replace: true },
);
assert.equal(immutableWithReplace.ok, false);
assert.ok(immutableWithReplace.errors.includes('immutable-version'));
const identicalReplay = upsertMaterial(editModel, { id: 'AGENT_STEEL', version: 1, E: 205000, G: 79000, Fy: 275, Fu: 410 });
assert.equal(identicalReplay.changed, true);
assert.equal(identicalReplay.item.version, 1);

const target = { model: () => editModel, reanalysisCount: 0, reanalyze() { this.reanalysisCount += 1; } };
const agent = createIndexAgentApi(target, null, { analyzeForIndex: () => ({ ok: true, combos: [], byCombo: {}, envelope: {} }) });
assert.ok(availableAgentActions().includes('upsertMaterial'));
const agentResult = agent.execute('upsertMaterial', { id: 'AGENT_STEEL', version: 2, E: 215000, G: 81000, Fy: 355, Fu: 490 });
assert.equal(agentResult.library.item.version, 2);
assert.ok(agent.execute('listLibrary', { kind: 'materials', query: 'AGENT_STEEL' }).library.count >= 2);
assert.equal(agent.getLibraryItem({ kind: 'materials', id: 'AGENT_STEEL', version: 2 }).item.elastic.E, 215000);

const app = await bootTestApp();
try {
  const login = await registerAndLogin(app, 'library-owner@example.com');
  const project = await app.api('POST', '/api/projects', { token: login.token, body: { name: 'Library Project' } });
  const projectId = project.data.data.project.id;
  const saved = await app.api('PUT', `/api/projects/${projectId}/library/materials/SRV_STEEL`, {
    token: login.token,
    body: { item: { version: 1, E: 200000, G: 77000, Fy: 240, Fu: 400 } },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.data.item.id, 'SRV_STEEL');
  const listServer = await app.api('GET', `/api/projects/${projectId}/library/materials`, { token: login.token });
  assert.equal(listServer.data.data.items.length, 1);
  const fetched = await app.api('GET', `/api/projects/${projectId}/library/materials/SRV_STEEL?version=1`, { token: login.token });
  assert.equal(fetched.data.data.item.id, 'SRV_STEEL');
  const blocked = await app.api('PUT', `/api/projects/${projectId}/library/materials/SRV_STEEL`, {
    token: login.token,
    body: { item: { version: 1, E: 210000, G: 80000, Fy: 300, Fu: 450 } },
  });
  assert.equal(blocked.status, 400);
} finally {
  await app.close();
}

console.log(JSON.stringify({ ok: true, version: 'p3-m10-materials' }, null, 2));
