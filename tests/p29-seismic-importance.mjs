import assert from 'node:assert/strict';
import { IMPORTANCE_TABLE, deriveSeismicImportance } from '../src/loads/seismicImportance.js';

// KDS 41 10 05 3. classified by occupancy and size, KDS 41 17 00 table 2.2-1
// mapped to a seismic grade and importance factor. Neither needed a separate
// confirmation: KDS 41 10 05 has no image formulas and table 2.2-1 is text.

assert.deepEqual(IMPORTANCE_TABLE['특'], { seismicGrade: '특', importanceFactor: 1.5 });
assert.deepEqual(IMPORTANCE_TABLE['1'], { seismicGrade: 'I', importanceFactor: 1.2 });
assert.deepEqual(IMPORTANCE_TABLE['2'], { seismicGrade: 'II', importanceFactor: 1.0 });
assert.deepEqual(IMPORTANCE_TABLE['3'], { seismicGrade: 'II', importanceFactor: 1.0 });

// 3.1 중요도(특)
const generalHospital = deriveSeismicImportance({ occupancy: 'general-hospital' });
assert.equal(generalHospital.importance, '특');
assert.equal(generalHospital.seismicGrade, '특');
assert.equal(generalHospital.importanceFactor, 1.5);
assert.ok(generalHospital.matchedClauses.some((clause) => clause.includes('3.1(3)')));
assert.equal(generalHospital.designTransferAllowed, false);

// 3.1(1)/3.2(1): the same occupancy splits on floor area at 1,000 m2.
assert.equal(deriveSeismicImportance({ occupancy: 'storage', hazardousMaterials: true, grossFloorArea: 1500 }).importance, '특');
assert.equal(deriveSeismicImportance({ occupancy: 'storage', hazardousMaterials: true, grossFloorArea: 800 }).importance, '1');
assert.equal(deriveSeismicImportance({ occupancy: 'storage', hazardousMaterials: true, grossFloorArea: 1000 }).importance, '특');

// 3.1(3): a hospital is 특 only with surgery or emergency facilities.
assert.equal(deriveSeismicImportance({ occupancy: 'hospital', hasSurgery: true }).importance, '특');
assert.equal(deriveSeismicImportance({ occupancy: 'hospital', hasEmergency: true }).importance, '특');
assert.equal(deriveSeismicImportance({ occupancy: 'hospital' }).importance, '1');

// 3.2 중요도(1)
assert.equal(deriveSeismicImportance({ occupancy: 'school' }).importanceFactor, 1.2);
assert.equal(deriveSeismicImportance({ occupancy: 'exhibition', grossFloorArea: 6000 }).importance, '1');
assert.equal(deriveSeismicImportance({ occupancy: 'exhibition', grossFloorArea: 4000 }).importance, '2');
assert.equal(deriveSeismicImportance({ occupancy: 'apartment', storyCount: 5 }).importance, '1');
assert.equal(deriveSeismicImportance({ occupancy: 'apartment', storyCount: 4 }).importance, '2');
assert.equal(deriveSeismicImportance({ occupancy: 'elderly-welfare' }).importance, '1');

// 3.4 중요도(3)
const shed = deriveSeismicImportance({ occupancy: 'agricultural' });
assert.equal(shed.importance, '3');
assert.equal(shed.seismicGrade, 'II');
assert.equal(shed.importanceFactor, 1.0);
assert.equal(deriveSeismicImportance({ occupancy: 'temporary-structure' }).importance, '3');

// 3.3(1) makes 중요도(2) a residual class, so a building that matches nothing
// lands there legitimately. That is flagged, because it is a different thing
// from an unclassified building.
const office = deriveSeismicImportance({ occupancy: 'office', grossFloorArea: 3000 });
assert.equal(office.importance, '2');
assert.equal(office.residualClass, true);
assert.match(office.residualNote, /3\.3\(1\)/);
assert.deepEqual(office.matchedClauses, []);

// No occupancy at all is not a residual class: nothing is derived.
const unknown = deriveSeismicImportance({});
assert.equal(unknown.derived, false);
assert.equal(unknown.reason, 'BUILDING_OCCUPANCY_REQUIRED');
assert.equal(unknown.importanceFactor, null);

// The derivation is reported next to what the user declared instead of
// replacing it, so a disagreement is visible.
const agreeing = deriveSeismicImportance({ occupancy: 'school', declaredImportance: '1', declaredImportanceFactor: 1.2 });
assert.equal(agreeing.agreesWithDeclared, true);
assert.equal(agreeing.factorAgreesWithDeclared, true);

const disagreeing = deriveSeismicImportance({ occupancy: 'school', declaredImportance: '2', declaredImportanceFactor: 1.0 });
assert.equal(disagreeing.importance, '1');
assert.equal(disagreeing.importanceFactor, 1.2);
assert.equal(disagreeing.agreesWithDeclared, false);
assert.equal(disagreeing.factorAgreesWithDeclared, false);
assert.equal(disagreeing.declaredImportanceFactor, 1.0);

// Nothing declared means nothing to compare, not agreement.
assert.equal(deriveSeismicImportance({ occupancy: 'school' }).agreesWithDeclared, null);

console.log(JSON.stringify({
  ok: true,
  hospital: generalHospital.importanceFactor,
  residual: office.importance,
}, null, 2));
