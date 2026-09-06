export const PHASE8_REFERENCE_SOURCE_CATALOG_VERSION = 'p8-m0-reference-source-catalog-v1';

export const PHASE8_REFERENCE_SOURCES = Object.freeze([
  source('SRC-NIST-01', 'NIST', 'NIST GCR 17-917-46v1', '2017', 'https://nvlpubs.nist.gov/nistpubs/gcr/2017/NIST.GCR.17-917-46v1.pdf', ['modeling', 'workflow', 'qualification']),
  source('SRC-NIST-02', 'NIST', 'NIST GCR 10-917-5', '2010', 'https://www.nist.gov/publications/nehrp-seismic-design-technical-brief-no-4-nonlinear-structural-analysis-seismic-design', ['workflow', 'model-review']),
  source('SRC-OPS-01', 'OpenSees', 'Newton Algorithm', null, 'https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/algorithm/Newton.html', ['newton', 'tangent']),
  source('SRC-OPS-02', 'OpenSees', 'DisplacementControl Integrator', null, 'https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/integrator/DisplacementControl.html', ['displacement-control']),
  source('SRC-OPS-03', 'OpenSees', 'ArcLength Integrator', null, 'https://opensees.github.io/OpenSeesDocumentation/user/manual/analysis/integrator/ArcLength.html', ['arc-length']),
  source('SRC-OPS-04', 'OpenSees', 'Corotational Transformation', null, 'https://opensees.github.io/OpenSeesDocumentation/user/manual/model/geomTransf/Corotational.html', ['corotational-3d']),
  source('SRC-OPS-05', 'OpenSees', 'Force-Based Beam-Column Element', null, 'https://opensees.github.io/OpenSeesDocumentation/user/manual/model/elements/forceBeamColumn.html', ['distributed-plasticity', 'compatibility']),
  source('SRC-CSI-01', 'CSI', 'ETABS Load Case Data', null, 'https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Load_Case_Data_Form.htm', ['analysis-case', 'initial-state']),
  source('SRC-CSI-02', 'CSI', 'ETABS Nonlinear Static', null, 'https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Static_Nonlinear_Pushover_Cases/Nonlinear_Static.htm', ['nonlinear-static']),
  source('SRC-CSI-03', 'CSI', 'ETABS Solution Control', null, 'https://docs.csiamerica.com/help-files/etabs/Menus/Define/Load_Cases/Solution_Control.htm', ['convergence', 'cutback']),
  source('SRC-CSI-04', 'CSI', 'ETABS Mass Source', null, 'https://docs.csiamerica.com/help-files/etabs/Menus/Define/Mass_Source.htm', ['mass-source']),
  source('SRC-CSI-05', 'CSI', 'ETABS Pushover Analysis', null, 'https://docs.csiamerica.com/help-files/etabs/Getting_Started/Nonlinear_Static_Pushover_Analysis.htm', ['pushover-workflow']),
  source('SRC-MIDAS-01', 'MIDAS', 'MIDAS Gen Inelastic Hinge Properties', null, 'https://manual.midasuser.com/EN_Common/Gen/845/Start/04_Model/05_Properties/Inelastic_Hinge_Properties.htm', ['hinge', 'pmm', 'fiber']),
  source('SRC-MIDAS-02', 'MIDAS', 'MIDAS Gen Pushover Global Control', null, 'https://manual.midasuser.com/EN_Common/Gen/905/Start/08_Design/07_Pushover_Analysis/01_Pushover_Global_Control.htm', ['pushover-control', 'step-subdivision']),
]);

export function phase8ReferenceSourceCanQualify(sourceRecord = {}) {
  return sourceRecord.status === 'verified-source'
    && typeof sourceRecord.contentHash === 'string'
    && sourceRecord.contentHash.trim().length > 0
    && typeof sourceRecord.retrievedAt === 'string'
    && sourceRecord.retrievedAt.trim().length > 0;
}

export function buildPhase8ReferenceSourceCatalog() {
  return {
    version: PHASE8_REFERENCE_SOURCE_CATALOG_VERSION,
    qualificationPolicy: 'link-only sources cannot independently qualify numerical results',
    sources: PHASE8_REFERENCE_SOURCES.map((item) => ({ ...item, appliesTo: [...item.appliesTo] })),
  };
}

function source(sourceId, authority, title, edition, url, appliesTo) {
  return Object.freeze({
    sourceId,
    authority,
    title,
    edition,
    url,
    retrievedAt: null,
    contentHash: null,
    status: 'link-only',
    appliesTo: Object.freeze(appliesTo),
    notes: 'Behavior and workflow reference only until a versioned content snapshot is verified.',
  });
}
