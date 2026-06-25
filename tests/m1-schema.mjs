import assert from 'node:assert/strict';
import {
  ERROR_CODES,
  SCHEMA_VERSION,
  analyzeModel,
  createModel,
  createPortalFrameSample,
  migrateModel,
  modelToJson,
  parseModelJson,
  validateModel,
} from '../src/index.js';

const sample = createPortalFrameSample();
const valid = validateModel(sample);
assert.equal(valid.ok, true, JSON.stringify(valid.errors, null, 2));
assert.equal(sample.schemaVersion, SCHEMA_VERSION);

const json = modelToJson(sample, { exportedAt: '2026-06-24T00:00:00.000Z' });
const parsed = parseModelJson(json);
assert.equal(parsed.ok, true, JSON.stringify(parsed.validation.errors, null, 2));
assert.equal(parsed.model.schemaVersion, SCHEMA_VERSION);
assert.equal(parsed.model.nodes.length, sample.nodes.length);
assert.equal(parsed.model.members.length, sample.members.length);

const parsedAnalysis = analyzeModel(parsed.model);
assert.equal(parsedAnalysis.ok, true, JSON.stringify(parsedAnalysis.validation.errors, null, 2));

const legacy = {
  nodes: [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 4, y: 0, z: 0 },
  ],
  members: [
    { id: 'M1', n1: 'N1', n2: 'N2', matId: 'steel', secId: 'h300', rel2: 'pin' },
  ],
  loads: [
    { id: 'L1', type: 'point', member: 'M1', P: 10, t: 0.5, dir: '-z', case: 'W' },
  ],
};
const migrated = migrateModel(legacy);
assert.equal(migrated.model.schemaVersion, SCHEMA_VERSION);
assert.ok(migrated.migrations.length >= 2, 'legacy migration should report load case and combination changes');
assert.ok(migrated.model.loadCases.some((loadCase) => loadCase.id === 'W'));
assert.ok(migrated.model.loadCombinations.some((combo) => combo.factors.W === 1));
assert.equal(migrated.model.members[0].releases.j, 'pin');

const badJson = parseModelJson('{bad json');
assert.equal(badJson.ok, false);
assert.equal(badJson.validation.errors[0].code, 'BAD_JSON');

const invalidCases = [
  ['missing model', null, ERROR_CODES.NO_MODEL],
  ['non-object model', [], ERROR_CODES.MODEL_NOT_OBJECT],
  ['missing collection', { ...createModel(), nodes: null }, ERROR_CODES.BAD_COLLECTION],
  ['bad schema version', { ...validMini(), schemaVersion: 99 }, ERROR_CODES.BAD_SCHEMA_VERSION],
  ['node missing id', mutateValid((m) => { m.nodes[0].id = ''; }), ERROR_CODES.NODE_MISSING_ID],
  ['duplicate node id', mutateValid((m) => { m.nodes[1].id = m.nodes[0].id; }), ERROR_CODES.DUPLICATE_NODE_ID],
  ['bad node coords', mutateValid((m) => { m.nodes[1].x = Number.NaN; }), ERROR_CODES.BAD_NODE_COORDS],
  ['bad support type', mutateValid((m) => { m.nodes[0].support = 'hinged-ish'; }), ERROR_CODES.BAD_SUPPORT_TYPE],
  ['bad custom support', mutateValid((m) => { m.nodes[0].support = 'custom'; m.nodes[0].fix = [true]; }), ERROR_CODES.BAD_CUSTOM_SUPPORT],
  ['duplicate member id', mutateValid((m) => { m.members.push({ ...m.members[0] }); }), ERROR_CODES.DUPLICATE_MEMBER_ID],
  ['bad member type', mutateValid((m) => { m.members[0].type = 'shell'; }), ERROR_CODES.BAD_MEMBER_TYPE],
  ['bad member node ref', mutateValid((m) => { m.members[0].n2 = 'NOPE'; }), ERROR_CODES.BAD_MEMBER_NODE_REF],
  ['zero length member', mutateValid((m) => { m.nodes[1].x = 0; }), ERROR_CODES.ZERO_LENGTH_MEMBER],
  ['missing section', mutateValid((m) => { m.members[0].secId = 'missing-section'; }), ERROR_CODES.NO_SECTION],
  ['bad section props', mutateValid((m) => { m.sections.push({ id: 'bad-sec', A: 0, Iy: 1, Iz: 1, J: 1 }); m.members[0].secId = 'bad-sec'; }), ERROR_CODES.BAD_SECTION_PROPS],
  ['missing material', mutateValid((m) => { m.members[0].matId = 'missing-material'; }), ERROR_CODES.NO_MATERIAL],
  ['bad material props', mutateValid((m) => { m.materials.push({ id: 'bad-mat', E: 0, G: 0 }); m.members[0].matId = 'bad-mat'; }), ERROR_CODES.BAD_MATERIAL_PROPS],
  ['bad release type', mutateValid((m) => { m.members[0].releases.i = 'free-ish'; }), ERROR_CODES.BAD_RELEASE_TYPE],
  ['duplicate load id', mutateValid((m) => { m.loads.push({ ...m.loads[0] }); }), ERROR_CODES.DUPLICATE_LOAD_ID],
  ['bad load type', mutateValid((m) => { m.loads[0].type = 'temperature'; }), ERROR_CODES.BAD_LOAD_TYPE],
  ['bad load member ref', mutateValid((m) => { m.loads[0].member = 'NOPE'; }), ERROR_CODES.BAD_LOAD_MEMBER_REF],
  ['bad load node ref', mutateValid((m) => { m.loads = [{ id: 'LN', type: 'nodal', node: 'NOPE', P: 1, dir: '-z', case: 'D' }]; }), ERROR_CODES.BAD_LOAD_NODE_REF],
  ['bad load magnitude', mutateValid((m) => { m.loads[0].w = Number.NaN; }), ERROR_CODES.BAD_LOAD_MAGNITUDE],
  ['bad point load location', mutateValid((m) => { m.loads = [{ id: 'LP', type: 'point', member: 'M1', P: 1, t: 1.5, dir: '-z', case: 'D' }]; }), ERROR_CODES.BAD_POINT_LOAD_LOCATION],
  ['duplicate load case id', mutateValid((m) => { m.loadCases.push({ ...m.loadCases[0] }); }), ERROR_CODES.DUPLICATE_LOAD_CASE_ID],
  ['bad load case type', mutateValid((m) => { m.loadCases[0].type = 'gravity-ish'; }), ERROR_CODES.BAD_LOAD_CASE_TYPE],
  ['duplicate combo id', mutateValid((m) => { m.loadCombinations.push({ ...m.loadCombinations[0], factors: { ...m.loadCombinations[0].factors } }); }), ERROR_CODES.DUPLICATE_COMBO_ID],
  ['bad combo factors', mutateValid((m) => { m.loadCombinations[0].factors.D = Number.NaN; }), ERROR_CODES.BAD_COMBO_FACTORS],
  ['no support', mutateValid((m) => { m.nodes.forEach((node) => { node.support = null; }); }), ERROR_CODES.NO_SUPPORT],
];

for (const [name, model, code] of invalidCases) {
  const result = validateModel(model);
  assert.ok(
    result.errors.some((error) => error.code === code),
    `${name}: expected ${code}, got ${result.errors.map((error) => error.code).join(', ')}`,
  );
}

console.log(JSON.stringify({
  ok: true,
  schemaVersion: SCHEMA_VERSION,
  roundTripNodes: parsed.model.nodes.length,
  legacyMigrations: migrated.migrations.length,
  invalidCases: invalidCases.length,
}, null, 2));

function validMini() {
  const model = createModel();
  model.nodes = [
    { id: 'N1', x: 0, y: 0, z: 0, support: 'fixed' },
    { id: 'N2', x: 4, y: 0, z: 0, support: null },
  ];
  model.members = [
    {
      id: 'M1',
      type: 'frame',
      n1: 'N1',
      n2: 'N2',
      matId: 'steel',
      secId: 'h300',
      localAxis: { roll: 0, strongAxis: 'z' },
      releases: { i: 'rigid', j: 'rigid' },
    },
  ];
  model.loads = [
    { id: 'L1', type: 'udl', member: 'M1', w: 2, dir: '-z', case: 'D' },
  ];
  return model;
}

function mutateValid(mutator) {
  const model = validMini();
  mutator(model);
  return model;
}
