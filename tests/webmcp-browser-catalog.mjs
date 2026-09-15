import assert from 'node:assert/strict';
import { createWebMcpTools } from '../src/ui/webmcp/tools.js';
import { createBrowserTools, browserDescriptorBytes, BROWSER_DESCRIPTOR_BUDGET } from '../src/ui/webmcp/browserTools.js';
import { registerDefinitions } from '../src/ui/webmcp/register.js';

const canonical = createWebMcpTools({ agent: {}, bridge: {} });
try {
  const surface = createBrowserTools(canonical);
  const [list, describe, read, write] = surface;
  const seen = [];
  for (let offset = 0; offset !== null;) {
    const page = list.execute({ offset }); seen.push(...page.tools.map(t => t.name)); offset = page.nextOffset;
  }
  assert.deepEqual(seen, canonical.map(t => t.name));
  for (const name of seen) {
    const spec = describe.execute({ name });
    assert.equal(spec.name, name);
    assert.ok(spec.description && spec.inputSchema);
    assert.equal(spec.invokeWith, spec.annotations.readOnlyHint ? read.name : write.name);
  }
  assert.throws(() => read.execute({ name: 'apply_design_changes', arguments: {} }), /Wrong read\/write/);
  assert.throws(() => write.execute({ name: 'get_design_input_schema', arguments: {} }), /Wrong read\/write/);
  await assert.rejects(write.execute({ name: 'apply_design_changes', arguments: { bad: true } }), { code: 'INVALID_INPUT' });
  assert.throws(() => list.execute({ limit: 10000 }), /Invalid catalog/);
  assert.throws(() => describe.execute({ name: '__proto__' }), /Unknown tool/);
  assert.throws(() => read.execute({ name: 'get_design_input_schema', arguments: [] }), /arguments/);
  const many = Array.from({length: 1000}, (_, i) => ({ ...canonical[0], name: `future_${i}` }));
  assert.equal(createBrowserTools(many).length, 4);
  assert.ok(browserDescriptorBytes(createBrowserTools(many)) < BROWSER_DESCRIPTOR_BUDGET);
  const recorded = [];
  const state = registerDefinitions({ isSecureContext: true, document: { modelContext: { registerTool(t) { recorded.push(t); } } } }, canonical, {});
  assert.equal(state.availableToolCount, canonical.length);
  assert.equal(state.discoveryConfirmed, undefined);
  recorded[0].execute({});
  assert.equal(state.discoveryConfirmed, true);
  state.dispose();
  assert.throws(() => recorded[0].execute({}), /inactive/);
  console.log(JSON.stringify({ functions: seen.length, browserTools: surface.length, descriptorBytes: browserDescriptorBytes(surface), validationAndSessionPreserved: true }));
} finally { canonical.dispose(); }
