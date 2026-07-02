import { buildLibraryAudit, resolveMaterialRecord, resolveSectionRecord } from './registry.js';

export const MATERIAL_LIBRARY_REPORT_VERSION = 'p3-m10-material-library-report-v1';

export function buildMaterialLibraryReport(model = {}) {
  const materialRefs = new Set((model.members || []).map((m) => m.matId).filter(Boolean));
  const sectionRefs = new Set((model.members || []).map((m) => m.secId).filter(Boolean));
  const audit = buildLibraryAudit(model);
  return {
    version: MATERIAL_LIBRARY_REPORT_VERSION,
    contract: buildReportContract(),
    summary: buildSummary(audit, materialRefs, sectionRefs),
    auditSummary: buildAuditSummary(audit),
    materials: [...materialRefs].sort().map((ref) => summarizeMaterial(ref, resolveMaterialRecord(model, ref))),
    sections: [...sectionRefs].sort().map((ref) => summarizeSection(ref, resolveSectionRecord(model, ref))),
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
    sectionErrorCount: audit.sectionErrors.length,
    sectionWarningCount: audit.sectionWarnings.length,
    appendOnlyWarningCount: audit.appendOnlyWarnings.length,
    softDeletedCount: audit.softDeletedItems.length,
  };
}

function buildAuditSummary(audit) {
  return {
    registryPolicy: audit.registryPolicy,
    scopeSummary: audit.scopeSummary,
    softDeletedItems: audit.softDeletedItems,
    appendOnlyWarnings: audit.appendOnlyWarnings,
    migrationWarnings: audit.migrationWarnings,
  };
}

function summarizeBase(ref, record) {
  const label = record ? `${record.id}@${record.version || 1}` : ref;
  return {
    ref,
    id: record?.id || null,
    version: record?.version || null,
    label,
    source: record?.source || null,
    sourceTrace: sourceTrace(ref, label, record?.source),
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

function sourceTrace(ref, label, source = {}) {
  const scope = source?.scope || (source?.db ? 'builtin' : 'project');
  return {
    reference: ref,
    resolvedLabel: label,
    scope,
    standard: source?.standard || null,
    db: source?.db || null,
    note: source?.note || null,
  };
}
