import { buildLibraryAudit, resolveMaterialRecord, resolveSectionRecord } from './registry.js';

export const MATERIAL_LIBRARY_REPORT_VERSION = 'p3-m10-material-library-report-v1';

export function buildMaterialLibraryReport(model = {}) {
  const materialRefs = new Set((model.members || []).map((m) => m.matId).filter(Boolean));
  const sectionRefs = new Set((model.members || []).map((m) => m.secId).filter(Boolean));
  const audit = buildLibraryAudit(model);
  const materials = [...materialRefs].sort().map((ref) => summarizeMaterial(ref, resolveMaterialRecord(model, ref)));
  const sections = [...sectionRefs].sort().map((ref) => summarizeSection(ref, resolveSectionRecord(model, ref)));
  const summary = buildSummary(audit, materialRefs, sectionRefs);
  return {
    version: MATERIAL_LIBRARY_REPORT_VERSION,
    contract: buildReportContract(),
    summary,
    auditSummary: buildAuditSummary(audit),
    coverage: buildCoverage(materials, sections),
    review: buildReview(summary, materials, sections),
    materials,
    sections,
  };
}

function buildReportContract() {
  return {
    milestone: 'P3-M10',
    tickets: ['P3-T46', 'P3-T47', 'P3-T48', 'P3-T49'],
    referenceFormat: 'id@version',
    readApi: 'getMaterialSectionRegistry',
    agentActions: ['listLibrary', 'getLibraryItem', 'upsertMaterial', 'upsertSection'],
  };
}

function buildSummary(audit, materialRefs, sectionRefs) {
  return {
    materialReferenceCount: materialRefs.size,
    sectionReferenceCount: sectionRefs.size,
    unversionedReferenceCount: audit.unversionedReferences.length,
    migrationWarningCount: audit.migrationWarnings.length,
    materialErrorCount: audit.materialErrors.length,
    materialWarningCount: audit.materialWarnings.length,
    sectionErrorCount: audit.sectionErrors.length,
    sectionWarningCount: audit.sectionWarnings.length,
    appendOnlyWarningCount: audit.appendOnlyWarnings.length,
    softDeletedCount: audit.softDeletedItems.length,
    softDeletedReferenceCount: audit.softDeletedReferences.length,
  };
}

function buildAuditSummary(audit) {
  return {
    registryPolicy: audit.registryPolicy,
    scopeSummary: audit.scopeSummary,
    softDeletedItems: audit.softDeletedItems,
    softDeletedReferences: audit.softDeletedReferences,
    appendOnlyWarnings: audit.appendOnlyWarnings,
    migrationWarnings: audit.migrationWarnings,
    materialWarnings: audit.materialWarnings,
  };
}

function summarizeBase(ref, record) {
  const label = record ? `${record.id}@${record.version || 1}` : ref;
  return {
    ref,
    id: record?.id || null,
    version: record?.version || null,
    label,
    deleted: Boolean(record?.deleted),
    referenceStatus: record?._softDeletedReference ? 'soft-deleted-traceable-reference' : record ? 'active' : 'unresolved',
    source: record?.source || null,
    sourceTrace: sourceTrace(ref, label, record),
  };
}

function summarizeMaterial(ref, record) {
  const nonlinear = record?.nonlinear || null;
  return {
    ...summarizeBase(ref, record),
    kind: record?.kind || null,
    elastic: record?.elastic || null,
    strength: record?.strength || null,
    nonlinear: nonlinear ? {
      model: nonlinear.model || null,
      backbonePoints: Array.isArray(nonlinear.backbone) ? nonlinear.backbone.length : 0,
      hardeningRatio: nonlinear.hardeningRatio ?? null,
      ultimateDuctility: nonlinear.ultimateDuctility ?? null,
    } : null,
  };
}

function summarizeSection(ref, record) {
  return {
    ...summarizeBase(ref, record),
    kind: record?.kind || null,
    shape: record?.shape || null,
    properties: record?.properties || {
      A: record?.A ?? null,
      Iy: record?.Iy ?? null,
      Iz: record?.Iz ?? null,
      J: record?.J ?? null,
    },
  };
}

function buildCoverage(materials, sections) {
  return {
    nonlinearBackbone: buildNonlinearBackboneCoverage(materials),
    sectionProvenance: buildSectionProvenanceCoverage(sections),
  };
}

function buildNonlinearBackboneCoverage(materials) {
  const rows = materials.map((row) => ({
    label: row.label,
    kind: row.kind,
    model: row.nonlinear?.model || null,
    backbonePoints: row.nonlinear?.backbonePoints || 0,
    ready: row.nonlinear == null || row.nonlinear.backbonePoints >= 2,
  }));
  return {
    referencedMaterialCount: rows.length,
    withBackboneCount: rows.filter((row) => row.backbonePoints >= 2).length,
    missingBackboneCount: rows.filter((row) => row.backbonePoints === 0).length,
    incompleteBackboneCount: rows.filter((row) => row.backbonePoints > 0 && row.backbonePoints < 2).length,
    rows,
  };
}

function buildSectionProvenanceCoverage(sections) {
  const rows = sections.map((row) => ({
    label: row.label,
    kind: row.kind,
    shape: row.shape,
    scope: row.sourceTrace?.scope || null,
    db: row.sourceTrace?.db || null,
    hasProperties: !!(row.properties?.A && row.properties?.Iy && row.properties?.Iz),
    propertySource: row.sourceTrace?.db ? 'seed-db' : row.kind === 'parametric' ? 'computed-parametric' : 'direct-input',
  }));
  return {
    referencedSectionCount: rows.length,
    dbCount: rows.filter((row) => row.propertySource === 'seed-db').length,
    parametricCount: rows.filter((row) => row.propertySource === 'computed-parametric').length,
    directCount: rows.filter((row) => row.propertySource === 'direct-input').length,
    missingPropertiesCount: rows.filter((row) => !row.hasProperties).length,
    rows,
  };
}

function sourceTrace(ref, label, record = null) {
  const source = record?.source || {};
  const scope = source?.scope || (source?.db ? 'builtin' : 'project');
  return {
    reference: ref,
    resolvedLabel: label,
    scope,
    standard: source?.standard || null,
    db: source?.db || null,
    note: source?.note || null,
    deleted: Boolean(record?.deleted),
    referenceStatus: record?._softDeletedReference ? 'soft-deleted-traceable-reference' : record ? 'active' : 'unresolved',
  };
}

function buildReview(summary, materials, sections) {
  const blockers = [];
  if (summary.materialErrorCount > 0) blockers.push('material-schema-errors');
  if (summary.sectionErrorCount > 0) blockers.push('section-schema-errors');
  if (summary.unversionedReferenceCount > 0) blockers.push('legacy-unversioned-references');
  if (summary.appendOnlyWarningCount > 0) blockers.push('append-only-policy-conflicts');
  if (summary.softDeletedReferenceCount > 0) blockers.push('soft-deleted-references-require-review');
  const nonlinearBackboneReady = materials.every((row) => !row.nonlinear || row.nonlinear.backbonePoints >= 2);
  const sectionProvenanceReady = sections.every((row) => row.properties?.A && row.properties?.Iy && row.properties?.Iz);
  if (!nonlinearBackboneReady) blockers.push('nonlinear-backbone-incomplete');
  return {
    registryReady: blockers.length === 0,
    calculationTraceReady: summary.unversionedReferenceCount === 0,
    nonlinearBackboneReady,
    sectionProvenanceReady,
    customMaterialSourceReviewRequired: summary.materialWarningCount > 0,
    sectionPropertyReviewRequired: summary.sectionWarningCount > 0,
    ownerPolicyReviewRequired: true,
    productionReady: false,
    blockers,
    agentDecision: blockers.length
      ? 'fix-material-library-before-analysis'
      : 'material-library-ready-for-engineering-review',
  };
}
