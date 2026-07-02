export const DESIGN_FORMULA_REGISTRY_VERSION = 'p3-design-formula-registry';

const FORMULAS = {
  'KDS-RC-BEAM-FLEXURE-V1': ['KDS 14 20', 'RC-BEAM-FLEXURE', 'RC beam flexural reinforcement'],
  'KDS-RC-BEAM-SHEAR-V1': ['KDS 14 20', 'RC-BEAM-SHEAR', 'RC beam shear reinforcement'],
  'KDS-RC-BEAM-SERVICE-V1': ['KDS 14 20', 'RC-BEAM-SERVICE', 'RC beam serviceability'],
  'KDS-RC-BEAM-TORSION-V1': ['KDS 14 20', 'RC-BEAM-TORSION', 'RC beam torsion warning'],
  'KDS-RC-COLUMN-PM-V1': ['KDS 14 20', 'RC-COLUMN-PM', 'RC column axial-moment interaction'],
  'KDS-RC-COLUMN-SHEAR-TIE-V1': ['KDS 14 20', 'RC-COLUMN-TIE', 'RC column tie reinforcement'],
  'KDS-RC-COLUMN-SLENDERNESS-V1': ['KDS 14 20', 'RC-COLUMN-SLENDERNESS', 'RC column slenderness review'],
  'KDS-RC-WALL-PM-V1': ['KDS 14 20', 'RC-WALL-PM', 'RC wall pier axial-moment review'],
  'KDS-RC-WALL-SHEAR-V1': ['KDS 14 20', 'RC-WALL-SHEAR', 'RC wall shear reinforcement'],
  'KDS-RC-WALL-BOUNDARY-V1': ['KDS 14 20', 'RC-WALL-BOUNDARY', 'RC wall boundary element warning'],
  'KDS-RC-SLAB-ONE-WAY-V1': ['KDS 14 20', 'RC-SLAB-ONE-WAY', 'RC one-way slab flexure'],
  'KDS-RC-SLAB-TWO-WAY-V1': ['KDS 14 20', 'RC-SLAB-TWO-WAY', 'RC two-way slab flexure'],
  'KDS-RC-SLAB-PUNCHING-V1': ['KDS 14 20', 'RC-SLAB-PUNCHING', 'RC slab punching shear'],
  'KDS-RC-DEVELOPMENT-V1': ['KDS 14 20', 'RC-DEVELOPMENT', 'RC bar development length'],
  'KDS-RC-SPLICE-V1': ['KDS 14 20', 'RC-SPLICE', 'RC bar lap splice'],
  'KDS-RC-BAR-SPACING-V1': ['KDS 14 20', 'RC-BAR-SPACING', 'RC bar spacing'],
  'KDS-RC-PM-CURVE-V1': ['KDS 14 20', 'RC-PM-CURVE', 'RC PM curve generation'],
  'KDS-ST-SECTION-CLASS-V1': ['KDS 14 31', 'ST-SECTION-CLASS', 'Steel section compactness classification'],
  'KDS-ST-COMPRESSION-KL-V1': ['KDS 14 31', 'ST-COMPRESSION-KL', 'Steel compression effective length'],
  'KDS-ST-FLEXURE-LTB-V1': ['KDS 14 31', 'ST-FLEXURE-LTB', 'Steel flexural LTB review'],
  'KDS-ST-H1-INTERACTION-V1': ['KDS 14 31', 'ST-H1-INTERACTION', 'Steel axial-flexure interaction'],
  'KDS-ST-BRACE-AXIAL-V1': ['KDS 14 31', 'ST-BRACE-AXIAL', 'Steel brace axial review'],
  'KDS-CONN-BOLT-V1': ['KDS 14 31', 'CONN-BOLT', 'Bolt group shear and tension'],
  'KDS-CONN-WELD-V1': ['KDS 14 31', 'CONN-WELD', 'Fillet weld sizing'],
  'KDS-CONN-BASEPLATE-V1': ['KDS 14 31', 'CONN-BASEPLATE', 'Base plate bearing and anchor trace'],
  'KDS-FOUND-SPREAD-V1': ['KDS 11 50', 'FOUND-SPREAD', 'Spread footing sizing'],
  'KDS-FOUND-COMBINED-V1': ['KDS 11 50', 'FOUND-COMBINED', 'Combined footing trace'],
  'KDS-FOUND-MAT-V1': ['KDS 11 50', 'FOUND-MAT', 'Mat foundation pressure trace'],
  'KDS-FOUND-PILE-V1': ['KDS 11 50', 'FOUND-PILE', 'Pile group capacity trace'],
};

export function resolveDesignFormula(formulaId) {
  const row = FORMULAS[formulaId];
  if (!row) return { formulaId, standard: 'UNREGISTERED', clause: 'UNREGISTERED', title: 'Unregistered design formula trace' };
  return { formulaId, standard: row[0], clause: row[1], title: row[2] };
}

export function collectDesignFormulaReferences(value, context = {}) {
  const ids = [...new Set(JSON.stringify(value).match(/KDS-[A-Z0-9-]+/g) || [])];
  return ids.map((formulaId) => ({ ...context, ...resolveDesignFormula(formulaId) }));
}

export function listDesignFormulaRegistry() {
  return Object.keys(FORMULAS).sort().map(resolveDesignFormula);
}
