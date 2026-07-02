import { resolveMaterialRecord, resolveSectionRecord } from './registry.js';

export const MATERIAL_LIBRARY_REPORT_VERSION = 'p3-m10-material-library-report-v1';

export function buildMaterialLibraryReport(model = {}) {
  const materialRefs = new Set((model.members || []).map((m) => m.matId).filter(Boolean));
  const sectionRefs = new Set((model.members || []).map((m) => m.secId).filter(Boolean));
  return {
    version: MATERIAL_LIBRARY_REPORT_VERSION,
    materials: [...materialRefs].sort().map((ref) => summarize(ref, resolveMaterialRecord(model, ref))),
    sections: [...sectionRefs].sort().map((ref) => summarize(ref, resolveSectionRecord(model, ref))),
  };
}

function summarize(ref, record) {
  return {
    ref,
    id: record?.id || null,
    version: record?.version || null,
    label: record ? `${record.id}@${record.version || 1}` : ref,
    source: record?.source || null,
  };
}
