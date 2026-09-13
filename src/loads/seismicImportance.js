import { getKcscRuleSources } from '../metadata/kcscRuleSources.js';

export const SEISMIC_IMPORTANCE_VERSION = 'p29-seismic-importance-v1';

// KDS 41 10 05 3. classifies a building by occupancy and size; KDS 41 17 00 2.2
// table 2.2-1 turns that class into a seismic grade and importance factor.
//
// Unlike the rest of phase 29 this needed no separate confirmation: KDS 41 10 05
// contains no image formulas at all, and table 2.2-1 carries its row labels and
// values as text.
const CLASSIFICATION_RULES = Object.freeze([
  // 3.1 중요도(특)
  { importance: '특', clause: 'KDS 41 10 05 3.1(1)', test: (b) => b.hazardousMaterials && atLeast(b.grossFloorArea, 1000) },
  { importance: '특', clause: 'KDS 41 10 05 3.1(2)', test: (b) => b.governmentOrEssentialFacility && atLeast(b.grossFloorArea, 1000) },
  { importance: '특', clause: 'KDS 41 10 05 3.1(3)', test: (b) => b.occupancy === 'general-hospital' || (b.occupancy === 'hospital' && (b.hasSurgery || b.hasEmergency)) },
  { importance: '특', clause: 'KDS 41 10 05 3.1(4)', test: (b) => b.designatedEmergencyShelter === true },
  { importance: '특', clause: 'KDS 41 10 05 3.1(5)', test: (b) => b.ancillaryToImportanceSpecial === true },
  // 3.2 중요도(1)
  { importance: '1', clause: 'KDS 41 10 05 3.2(1)', test: (b) => b.hazardousMaterials && below(b.grossFloorArea, 1000) },
  { importance: '1', clause: 'KDS 41 10 05 3.2(2)', test: (b) => b.governmentOrEssentialFacility && below(b.grossFloorArea, 1000) },
  { importance: '1', clause: 'KDS 41 10 05 3.2(3)', test: (b) => ASSEMBLY_OCCUPANCIES.has(b.occupancy) && atLeast(b.grossFloorArea, 5000) },
  { importance: '1', clause: 'KDS 41 10 05 3.2(4)', test: (b) => WELFARE_OCCUPANCIES.has(b.occupancy) },
  { importance: '1', clause: 'KDS 41 10 05 3.2(5)', test: (b) => RESIDENTIAL_OCCUPANCIES.has(b.occupancy) && atLeast(b.storyCount, 5) },
  { importance: '1', clause: 'KDS 41 10 05 3.2(6)', test: (b) => b.occupancy === 'school' },
  { importance: '1', clause: 'KDS 41 10 05 3.2(7)', test: (b) => b.occupancy === 'hospital' || (b.occupancy === 'medical' && atLeast(b.grossFloorArea, 1000)) },
  // 3.4 중요도(3) is tested before 중요도(2), because 3.3(1) is defined as
  // "everything not covered by 특, (1) or (3)".
  { importance: '3', clause: 'KDS 41 10 05 3.4(1)', test: (b) => b.occupancy === 'agricultural' || b.occupancy === 'small-warehouse' },
  { importance: '3', clause: 'KDS 41 10 05 3.4(2)', test: (b) => b.occupancy === 'temporary-structure' },
]);

const ASSEMBLY_OCCUPANCIES = new Set(['performance-hall', 'assembly-hall', 'spectator-facility', 'exhibition', 'sports-facility', 'retail', 'transport']);
const WELFARE_OCCUPANCIES = new Set(['childcare', 'elderly-welfare', 'social-welfare', 'labour-welfare']);
const RESIDENTIAL_OCCUPANCIES = new Set(['lodging', 'officetel', 'dormitory', 'apartment', 'correctional']);

// KDS 41 17 00 table 2.2-1.
const IMPORTANCE_TABLE = Object.freeze({
  특: { seismicGrade: '특', importanceFactor: 1.5 },
  1: { seismicGrade: 'I', importanceFactor: 1.2 },
  2: { seismicGrade: 'II', importanceFactor: 1.0 },
  3: { seismicGrade: 'II', importanceFactor: 1.0 },
});

const codeReferences = () => [
  ...getKcscRuleSources(['411005']).map((source) => ({ ...source, clause: '3.1; 3.2; 3.3; 3.4' })),
  ...getKcscRuleSources(['411700']).map((source) => ({ ...source, clause: '2.2 표 2.2-1' })),
];

const base = () => ({
  version: SEISMIC_IMPORTANCE_VERSION,
  codeReferences: codeReferences(),
  qualification: 'clause-scoped-not-whole-design',
  designTransferAllowed: false,
});

/**
 * Building importance, seismic grade and importance factor from occupancy and
 * size.
 *
 * The derivation is reported next to whatever the user supplied rather than
 * replacing it, because 3.3(1) makes 중요도(2) a residual class: a building that
 * matches no rule lands there legitimately, and that is a different thing from
 * a building whose occupancy was never declared.
 */
export function deriveSeismicImportance(input = {}) {
  const { occupancy = null, declaredImportance = null, declaredImportanceFactor = null } = input;

  if (!occupancy && !hasAnyFlag(input)) {
    return {
      ...base(),
      derived: false,
      reason: 'BUILDING_OCCUPANCY_REQUIRED',
      importance: null,
      seismicGrade: null,
      importanceFactor: null,
      declaredImportance,
      declaredImportanceFactor,
      agreesWithDeclared: null,
    };
  }

  const matched = CLASSIFICATION_RULES.filter((rule) => {
    try {
      return rule.test(input) === true;
    } catch {
      return false;
    }
  });

  // 3.1 outranks 3.2, which outranks 3.4; 3.3 is the residual.
  const order = ['특', '1', '3'];
  const importance = order.find((id) => matched.some((rule) => rule.importance === id)) ?? '2';
  const residual = importance === '2';
  const row = IMPORTANCE_TABLE[importance];

  const agreesWithDeclared = declaredImportance === null
    ? null
    : String(declaredImportance) === importance;
  const factorAgrees = declaredImportanceFactor === null
    ? null
    : Math.abs(Number(declaredImportanceFactor) - row.importanceFactor) < 1e-9;

  return {
    ...base(),
    derived: true,
    reason: null,
    importance,
    importanceLabel: residual ? '중요도(2)' : `중요도(${importance})`,
    seismicGrade: row.seismicGrade,
    importanceFactor: row.importanceFactor,
    residualClass: residual,
    residualNote: residual ? 'KDS 41 10 05 3.3(1) defines 중요도(2) as everything not covered by 특, (1) or (3)' : null,
    matchedClauses: matched.filter((rule) => rule.importance === importance).map((rule) => rule.clause),
    declaredImportance,
    declaredImportanceFactor,
    agreesWithDeclared,
    factorAgreesWithDeclared: factorAgrees,
  };
}

export { CLASSIFICATION_RULES, IMPORTANCE_TABLE };

function atLeast(value, threshold) {
  const number = Number(value);
  return Number.isFinite(number) && number >= threshold;
}

function below(value, threshold) {
  const number = Number(value);
  return Number.isFinite(number) && number < threshold;
}

function hasAnyFlag(input) {
  return ['hazardousMaterials', 'governmentOrEssentialFacility', 'designatedEmergencyShelter', 'ancillaryToImportanceSpecial']
    .some((key) => input[key] === true);
}
