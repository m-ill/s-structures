import assert from 'node:assert/strict';
import {
  SEISMIC_SYSTEM_TABLE,
  governingResponseModificationFactor,
  seismicSystemCoefficients,
} from '../src/loads/seismicSystemCoefficients.js';

// KDS 41 17 00 table 6.2-1. Column order after the system name is R, Omega0,
// Cd, stated in 6.1(1) and owner-confirmed against pages 19~20.

const special = seismicSystemCoefficients({ family: 'moment-frame', detail: 'rc-special-moment-frame' });
assert.equal(special.status, 'OK');
assert.equal(special.responseModificationFactor, 8);
assert.equal(special.systemOverstrengthFactor, 3);
assert.equal(special.deflectionAmplificationFactor, 5.5);
assert.equal(special.designTransferAllowed, false);

// The point of keying on the family as well: the same detail system takes four
// different R values depending on what it sits inside.
const ordinaryWall = [
  ['bearing-wall', 4, 4],
  ['building-frame', 5, 4.5],
  ['dual-special-moment-frame', 6, 5],
  ['dual-intermediate-moment-frame', 5.5, 4.5],
  ['shear-wall-frame-interactive', 4.5, 4],
];
for (const [family, R, Cd] of ordinaryWall) {
  const row = seismicSystemCoefficients({ family, detail: 'rc-ordinary-shear-wall' });
  assert.equal(row.status, 'OK', `${family}: ${row.reason}`);
  assert.equal(row.responseModificationFactor, R, family);
  assert.equal(row.deflectionAmplificationFactor, Cd, family);
  assert.equal(row.systemOverstrengthFactor, 2.5, family);
}

// Special shear walls, same pattern.
assert.equal(seismicSystemCoefficients({ family: 'bearing-wall', detail: 'rc-special-shear-wall' }).responseModificationFactor, 5);
assert.equal(seismicSystemCoefficients({ family: 'building-frame', detail: 'rc-special-shear-wall' }).responseModificationFactor, 6);
assert.equal(seismicSystemCoefficients({ family: 'dual-special-moment-frame', detail: 'rc-special-shear-wall' }).responseModificationFactor, 7);
assert.equal(seismicSystemCoefficients({ family: 'dual-intermediate-moment-frame', detail: 'rc-special-shear-wall' }).responseModificationFactor, 6.5);

// Moment frames.
assert.equal(seismicSystemCoefficients({ family: 'moment-frame', detail: 'rc-intermediate-moment-frame' }).responseModificationFactor, 5);
assert.equal(seismicSystemCoefficients({ family: 'moment-frame', detail: 'rc-ordinary-moment-frame' }).responseModificationFactor, 3);

// A detail system with no family is ambiguous, not defaultable: the candidates
// come back instead of one of them being picked.
const ambiguous = seismicSystemCoefficients({ detail: 'rc-ordinary-shear-wall' });
assert.equal(ambiguous.status, 'NOT_CHECKED');
assert.equal(ambiguous.reason, 'SEISMIC_SYSTEM_FAMILY_REQUIRED');
assert.equal(ambiguous.candidates.length, 5);
assert.deepEqual(ambiguous.candidates.map((row) => row.R).sort((a, b) => a - b), [4, 4.5, 5, 5.5, 6]);
assert.equal(ambiguous.responseModificationFactor, undefined);

// Nothing declared, an unknown system, and a combination the table does not
// carry are each distinct.
assert.equal(seismicSystemCoefficients({}).reason, 'SEISMIC_SYSTEM_REQUIRED');
assert.equal(seismicSystemCoefficients({ family: 'moment-frame', detail: 'steel-special-moment-frame' }).reason, 'SEISMIC_SYSTEM_NOT_IN_TABLE');
const wrongPair = seismicSystemCoefficients({ family: 'bearing-wall', detail: 'rc-special-moment-frame' });
assert.equal(wrongPair.reason, 'SEISMIC_SYSTEM_COMBINATION_NOT_IN_TABLE');
assert.equal(wrongPair.candidates.length, 1);

// An OK coefficient is not a statement that the system is permitted here: the
// height limits and the system's qualifying conditions are separate.
assert.equal(special.heightLimitChecked, false);
assert.equal(special.systemQualificationChecked, false);
assert.ok(special.limitations.length >= 3);

// 6.4.3(1): the smallest R in one direction governs, and the governing row is
// named rather than only its number.
const governing = governingResponseModificationFactor([
  { family: 'moment-frame', detail: 'rc-special-moment-frame' },
  { family: 'bearing-wall', detail: 'rc-ordinary-shear-wall' },
  { family: 'building-frame', detail: 'rc-special-shear-wall' },
]);
assert.equal(governing.status, 'OK');
assert.equal(governing.responseModificationFactor, 4);
assert.equal(governing.governingSystem.family, 'bearing-wall');
assert.equal(governing.considered.length, 3);
assert.equal(governing.roofStoreyExcluded, false);

// One unresolvable system makes the whole direction unresolved rather than
// quietly governing on the systems that did resolve.
const partial = governingResponseModificationFactor([
  { family: 'moment-frame', detail: 'rc-special-moment-frame' },
  { detail: 'rc-ordinary-shear-wall' },
]);
assert.equal(partial.status, 'NOT_CHECKED');
assert.equal(partial.reason, 'SEISMIC_SYSTEM_UNRESOLVED');
assert.equal(partial.unresolved.length, 1);
assert.equal(governingResponseModificationFactor([]).reason, 'SEISMIC_SYSTEM_REQUIRED');

// The table holds only the reinforced concrete rows and says so.
assert.equal(SEISMIC_SYSTEM_TABLE.length, 12);
assert.ok(SEISMIC_SYSTEM_TABLE.every((row) => row.detail.startsWith('rc-')));
assert.match(special.sourceConfirmation.scope, /reinforced concrete rows only/);

console.log(JSON.stringify({
  ok: true,
  rows: SEISMIC_SYSTEM_TABLE.length,
  ordinaryShearWallRvalues: ambiguous.candidates.map((row) => row.R),
  governingR: governing.responseModificationFactor,
}, null, 2));
