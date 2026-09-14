import assert from 'node:assert/strict';
import { createPracticalTools } from '../src/ui/webmcp/practicalTools.js';
import { getDesignModules } from '../src/metadata/designModuleCapabilities.js';

// Phase30 M6. The tool surface: explicitly invoked, bounded, and never an
// approval.

const calls = [];
const bridge = new Proxy({}, {
  get: (_target, name) => (args) => { calls.push({ name, args }); return { ok: true, name }; },
});
const tool = (name, description, schema, readOnly, handler) => ({ name, description, schema, readOnly, handler });
const object = (properties, required) => ({ type: 'object', properties, required });

const tools = createPracticalTools({ bridge, tool, object });
const byName = new Map(tools.map((row) => [row.name, row]));

const NAMES = ['open_global_design_iteration', 'submit_global_design_iteration', 'get_global_design_iteration'];
for (const name of NAMES) assert.ok(byName.has(name), `${name} is not registered`);

// Opening and submitting change state, so they are not read-only; reading the
// judgement is.
assert.equal(byName.get('open_global_design_iteration').readOnly, false);
assert.equal(byName.get('submit_global_design_iteration').readOnly, false);
assert.equal(byName.get('get_global_design_iteration').readOnly, true);

// The bound in the schema is the hard cap, not the default: a caller cannot ask
// for more iterations than practicalDesignLimits allows.
const openSchema = byName.get('open_global_design_iteration').schema;
assert.equal(openSchema.properties.maxGlobalIterations.maximum, 12);
assert.equal(openSchema.properties.maxGlobalIterations.minimum, 1);
assert.deepEqual(openSchema.required, ['resizeScope']);
// The ladder needs at least two rungs, which is what makes a step meaningful.
const ladderSchema = openSchema.properties.resizeScope.properties.sets.items.properties.sectionLadder;
assert.equal(ladderSchema.minItems, 2);
assert.deepEqual(openSchema.properties.resizeScope.properties.sets.items.required, ['memberIds', 'sectionLadder']);

// The submit schema demands the whole per-member row, so a caller cannot send
// ratios without the sections they belong to: the design state hash depends on
// the sections, and a missing one would make a settled design look unsettled.
const submitSchema = byName.get('submit_global_design_iteration').schema;
assert.deepEqual(submitSchema.properties.members.items.required, ['memberId', 'secId', 'governingRatio', 'status']);
assert.deepEqual(submitSchema.required, ['sessionId', 'members']);

// Each tool reaches its own bridge method.
byName.get('open_global_design_iteration').handler({ resizeScope: { sets: [] } });
byName.get('submit_global_design_iteration').handler({ sessionId: 'x', members: [] });
byName.get('get_global_design_iteration').handler({});
assert.deepEqual(calls.map((row) => row.name), [
  'openGlobalDesignIteration',
  'submitGlobalDesignIteration',
  'getGlobalDesignIteration',
]);

// The descriptions have to carry the two things a caller must not get wrong:
// the scope bounds what may be resized, and no outcome is design approval.
const openDescription = byName.get('open_global_design_iteration').description;
assert.match(openDescription, /never resized/);
assert.match(openDescription, /increasing in gross area/);
assert.match(openDescription, /does not authorize|no outcome authorizes/i);
const submitDescription = byName.get('submit_global_design_iteration').description;
for (const status of ['CONVERGED', 'CYCLE_DETECTED', 'FORCE_CONVERGED_SECTION_OSCILLATING', 'ITERATION_LIMIT_REACHED']) {
  assert.match(submitDescription, new RegExp(status), `${status} is not explained to the caller`);
}
assert.match(submitDescription, /not design approval/i);

// The optimization module advertises the tools and the limitation.
const modules = getDesignModules({ moduleId: 'optimization' });
const serialized = JSON.stringify(modules);
for (const name of NAMES) assert.ok(serialized.includes(name), `${name} is not advertised`);
assert.ok(serialized.includes('global-iteration-resizes-only-inside-a-declared-scope-and-never-authorizes-transfer'));

console.log(JSON.stringify({ ok: true, tools: NAMES, totalTools: tools.length }, null, 2));
