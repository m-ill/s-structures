import { resolveMaterialRecord, resolveSectionRecord } from './registry.js';

export const MATERIAL_LIBRARY_REPORT_VERSION = 'p3-m10-material-library-report-v1';

export function buildMaterialLibraryReport(model = {}) {
  const materialRefs = new Set((model.members || []).map((m) => m.matId).filter(Boolean));
  const sectionRefs = new Set((model.members || []).map((m) => m.secId).filter(Boolean));
  return {
    version: MATERIAL_LIBRARY_REPORT_VERSION,
    materials: [...materialRefs].sort().map((ref) => summarizeMaterial(ref, resolveMaterialRecord(model, ref))),
    sections: [...sectionRefs].sort().map((ref) => summarizeSection(ref, resolveSectionRecord(model, ref))),
  };
}

function summarizeBase(ref, record) {
  return {
    ref,
    id: record?.id || null,
    version: record?.version || null,
    label: record ? `${record.id}@${record.version || 1}` : ref,
    source: record?.source || null,
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
