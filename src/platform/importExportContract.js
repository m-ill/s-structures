import { IMPORT_EXPORT_CONTRACT_VERSION } from './platformVersion.js';

export function buildImportExportContract(model) {
  return {
    version: IMPORT_EXPORT_CONTRACT_VERSION,
    targetSchemaVersion: model?.schemaVersion || 3,
    sources: [
      source('structured-json', 'available', 'setModel/modelToJson round trip'),
      source('drawing-image', 'planned', 'vision agent extracts grid, story, member, load tags'),
      source('mgt-file', 'planned', 'parser maps nodes, elements, sections, loads, combinations'),
      source('spreadsheet', 'planned', 'office schedule import/export tables'),
    ],
    requiredMappingAudit: ['nodes', 'members', 'supports', 'sections', 'loads', 'combinations'],
  };
}

function source(id, status, contract) {
  return { id, status, contract };
}
