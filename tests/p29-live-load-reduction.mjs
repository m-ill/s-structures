import assert from 'node:assert/strict';
import {
  INFLUENCE_MULTIPLIER,
  LIVE_LOAD_REDUCTION_VERSION,
  MINIMUM_INFLUENCE_AREA,
  liveLoadReductionFactor,
} from '../src/loads/liveLoadReduction.js';
import { LOAD_AUDIT_CODES, buildLoadAudit } from '../src/loads/loadAudit.js';
import { getKdsLoadStandardRegistry } from '../src/core/kdsLoadCombinations.js';

// KDS 41 12 00 3.5. The factor is the fraction of the basic live load that is
// kept, so a smaller factor means a larger reduction.

const column = {
  role: 'column',
  loadedArea: 36,
  supportedStoryCount: 1,
  liveLoadIntensity: 3,
  occupancy: 'general',
};

// 3.5.2(1): an interior column carrying 36 m2 has a 144 m2 influence area, and
// 0.3 + 4.2/12 keeps 65 percent of the basic live load.
const worked = liveLoadReductionFactor(column);
assert.equal(worked.version, LIVE_LOAD_REDUCTION_VERSION);
assert.equal(worked.influenceArea, 144);
assert.equal(worked.influenceMultiplier, 4);
assert.ok(Math.abs(worked.factor - 0.65) < 1e-12, JSON.stringify(worked));
assert.equal(worked.applied, true);
assert.equal(worked.factorFloorGoverns, false);
assert.equal(worked.equation.expression, 'C = 0.3 + 4.2 / sqrt(A)');
assert.ok(worked.codeReferences.length > 0);
assert.equal(worked.codeReferences[0].clause, '3.5.1; 3.5.2; 3.5.3');
assert.equal(worked.designTransferAllowed, false);

// 3.5.2(1) multipliers.
assert.deepEqual(INFLUENCE_MULTIPLIER, { column: 4, foundation: 4, beam: 2, wall: 2, slab: 1 });
assert.equal(liveLoadReductionFactor({ ...column, role: 'beam' }).influenceArea, 72);
assert.equal(liveLoadReductionFactor({ ...column, role: 'slab', loadedArea: 40 }).influenceArea, 40);

// A cantilever part is added as it is, without the multiplier.
assert.equal(liveLoadReductionFactor({ ...column, cantileverArea: 10 }).influenceArea, 154);

// 3.5.1: below the threshold nothing is reduced.
assert.equal(MINIMUM_INFLUENCE_AREA, 36);
const small = liveLoadReductionFactor({ ...column, role: 'slab', loadedArea: 20 });
assert.equal(small.applied, false);
assert.equal(small.factor, 1);
assert.equal(small.reason, 'INFLUENCE_AREA_BELOW_THRESHOLD');

// 3.5.3 floors: one floor keeps at least 0.5, two or more at least 0.4.
const wide = liveLoadReductionFactor({ ...column, loadedArea: 400 });
assert.equal(wide.factorFloorGoverns, true);
assert.equal(wide.factor, 0.5);
// At 1,600 m2 the equation still gives 0.405, above the 0.4 floor, so the
// computed value is kept.
const wideMulti = liveLoadReductionFactor({ ...column, loadedArea: 400, supportedStoryCount: 3 });
assert.ok(Math.abs(wideMulti.factor - 0.405) < 1e-12, JSON.stringify(wideMulti));
assert.equal(wideMulti.factorFloorGoverns, false);
// The 0.4 floor governs only past 1,764 m2 of influence area.
const hugeMulti = liveLoadReductionFactor({ ...column, loadedArea: 600, supportedStoryCount: 3 });
assert.equal(hugeMulti.factor, 0.4);
assert.equal(hugeMulti.factorFloorGoverns, true);

// 3.5.3: above 5 kN/m2 there is no reduction, unless the member carries two or
// more floors, where 0.8 is kept.
const heavySingle = liveLoadReductionFactor({ ...column, liveLoadIntensity: 7.5 });
assert.equal(heavySingle.applied, false);
assert.equal(heavySingle.reason, 'LIVE_LOAD_ABOVE_5KPA_NOT_REDUCIBLE');
const heavyMulti = liveLoadReductionFactor({ ...column, liveLoadIntensity: 7.5, supportedStoryCount: 2 });
assert.equal(heavyMulti.factor, 0.8);
assert.equal(heavyMulti.factorFloorGoverns, true);

// 3.5.3: assembly occupancy is never reduced; car parking keeps 0.8 only when
// the member carries two or more floors.
assert.equal(liveLoadReductionFactor({ ...column, occupancy: 'public-assembly' }).reason, 'ASSEMBLY_OCCUPANCY_NOT_REDUCIBLE');
assert.equal(
  liveLoadReductionFactor({ ...column, occupancy: 'public-assembly', supportedStoryCount: 4 }).reason,
  'ASSEMBLY_OCCUPANCY_NOT_REDUCIBLE',
);
// 3.5.3(3) covers assembly only up to 5 kN/m2. Above it 3.5.3(2) governs: one
// storey is still not reducible, two or more may keep 0.8. That reading rests
// on the clause text alone, so it travels on the result.
const assemblyHeavy = { ...column, occupancy: 'public-assembly', liveLoadIntensity: 7.5 };
const assemblyOne = liveLoadReductionFactor({ ...assemblyHeavy, supportedStoryCount: 1 });
assert.equal(assemblyOne.factor, 1);
assert.equal(assemblyOne.reason, 'LIVE_LOAD_ABOVE_5KPA_NOT_REDUCIBLE');
assert.match(assemblyOne.interpretation.basis, /no separate official interpretation/);
const assemblyMulti = liveLoadReductionFactor({ ...assemblyHeavy, supportedStoryCount: 3 });
assert.equal(assemblyMulti.factor, 0.8);
assert.equal(assemblyMulti.factorFloorGoverns, true);
assert.match(assemblyMulti.interpretation.clauses, /3\.5\.3\(2\)/);
// At or below 5 kN/m2 assembly is never reducible, whatever the storey count,
// and that path carries no interpretation because the clause states it.
assert.equal(liveLoadReductionFactor({ ...column, occupancy: 'public-assembly', supportedStoryCount: 4 }).interpretation ?? null, null);
assert.equal(
  liveLoadReductionFactor({ ...column, occupancy: 'passenger-car-parking' }).reason,
  'PASSENGER_CAR_PARKING_LIMITED_REDUCTION',
);
assert.equal(liveLoadReductionFactor({ ...column, occupancy: 'passenger-car-parking', supportedStoryCount: 2 }).factor, 0.8);

// 3.5.3: a one-way slab may only count a width up to 1.5 times its span.
assert.equal(
  liveLoadReductionFactor({ ...column, role: 'slab', loadedArea: 60, oneWaySlab: { span: 4, width: 9 } }).reason,
  'ONE_WAY_SLAB_WIDTH_LIMIT_EXCEEDED',
);
assert.equal(liveLoadReductionFactor({ ...column, role: 'slab', loadedArea: 60, oneWaySlab: { span: 4, width: 6 } }).applied, true);

// Roof live load is outside 3.5.
assert.equal(liveLoadReductionFactor({ ...column, isRoofLiveLoad: true }).reason, 'ROOF_LIVE_LOAD_NOT_REDUCIBLE');

// Missing input never reduces; it says what is missing.
for (const [patch, reason] of [
  [{ role: undefined }, 'LIVE_LOAD_REDUCTION_ROLE_REQUIRED'],
  [{ loadedArea: 0 }, 'LOADED_AREA_REQUIRED'],
  [{ supportedStoryCount: undefined }, 'SUPPORTED_STORY_COUNT_REQUIRED'],
  [{ liveLoadIntensity: undefined }, 'LIVE_LOAD_INTENSITY_REQUIRED'],
  [{ cantileverArea: -1 }, 'CANTILEVER_AREA_INVALID'],
]) {
  const result = liveLoadReductionFactor({ ...column, ...patch });
  assert.equal(result.applied, false, JSON.stringify(result));
  assert.equal(result.factor, 1);
  assert.equal(result.reason, reason);
}

// The audit is where a reduction becomes visible. A reduction lowers the design
// result, so a factor with no declaration behind it must fail, not warn.
const auditModel = (loads, declarations) => ({
  loadCases: [{ id: 'L1', type: 'live' }],
  nodes: [{ id: 'n1' }, { id: 'n2' }],
  members: [{ id: 'm1', i: 'n1', j: 'n2' }],
  loads: loads.map((load) => ({ case: 'L1', member: 'm1', type: 'memberUdl', w: -5, ...load })),
  liveLoadReduction: declarations,
});

const declaration = { id: 'col-A2', ...column, appliesToLoadIds: ['q1'] };

const supported = buildLoadAudit(auditModel([{ id: 'q1', liveLoadReductionFactor: 0.65 }], [declaration]));
assert.equal(supported.summary.liveLoadReductionDeclaredCount, 1);
assert.equal(supported.summary.liveLoadReductionAppliedCount, 1);
assert.equal(supported.issues.filter((issue) => issue.code.startsWith('live-load-reduction')).length, 0);
assert.equal(supported.liveLoadReduction.declarations[0].factor, 0.65);

const undeclared = buildLoadAudit(auditModel([{ id: 'q2', liveLoadReductionFactor: 0.5 }], []));
assert.equal(undeclared.status, 'invalid');
assert.equal(undeclared.byCode[LOAD_AUDIT_CODES.LIVE_REDUCTION_UNDECLARED].length, 1);

const stale = buildLoadAudit(auditModel([{ id: 'q1', liveLoadReductionFactor: 0.5 }], [declaration]));
assert.equal(stale.status, 'invalid');
assert.equal(stale.byCode[LOAD_AUDIT_CODES.LIVE_REDUCTION_MISMATCH].length, 1);

// A declaration the clause does not let reduce is recorded, not silently dropped.
const notReducible = buildLoadAudit(auditModel([{ id: 'q1' }], [{ ...declaration, occupancy: 'public-assembly' }]));
assert.equal(notReducible.byCode[LOAD_AUDIT_CODES.LIVE_REDUCTION_NOT_APPLIED].length, 1);
assert.equal(notReducible.status, 'clean');

// A load with no factor at all is the unreduced case and raises nothing.
assert.equal(buildLoadAudit(auditModel([{ id: 'q3' }], [])).status, 'clean');

// The load registry must advertise the implementation, so the clause cannot go
// back to being a declared-only input without this failing.
const registered = getKdsLoadStandardRegistry().designInputs.find((row) => row.id === 'liveLoadReduction');
assert.ok(registered?.implementation, 'liveLoadReduction is not registered as implemented');
assert.equal(registered.implementation.module, 'loads/liveLoadReduction.js');
assert.deepEqual(registered.implementation.documents, ['411200']);
assert.equal(registered.implementation.clause, '3.5.1; 3.5.2; 3.5.3');

console.log(JSON.stringify({
  ok: true,
  version: LIVE_LOAD_REDUCTION_VERSION,
  workedExample: { influenceArea: worked.influenceArea, factor: worked.factor },
}, null, 2));
