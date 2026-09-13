import assert from 'node:assert/strict';
import { designContext } from './fixtures/p24/context.js';

const ctx = designContext();
try {
  const before = JSON.stringify(ctx.model);
  assert.ok(ctx.tools.find(row => row.name === 'get_design_modules'), 'T00: module capabilities must be exposed by actual WebMCP definitions');
  const result = await ctx.call('get_design_modules');
  assert.equal(result.ok, true);
  assert.equal(result.version, 'p24-design-modules-v2');
  assert.deepEqual(result, ctx.bridge.getDesignModules());
  for(const module of result.modules) for(const name of module.currentTools) assert.ok(ctx.tools.some(tool=>tool.name===name),`Advertised tool exists: ${name}`);
  assert.deepEqual(result.modules.map(row => row.id), ['materials', 'sections', 'reinforcement', 'member-review', 'optimization', 'connections', 'foundations', 'drawings']);
  const module = (await ctx.call('get_design_modules', { moduleId: 'connections' })).modules[0];
  assert.equal(module.productionQualified, false);
  assert.equal(module.ruleStatus, 'CLAUSE_PARTIAL_IMPLEMENTED');
  assert.ok(module.ruleSources.some(source=>source.code==='KDS 14 20 80'));
  const rc=result.modules.find(row=>row.id==='reinforcement');
  assert.equal(rc.ruleStatus,'CLAUSE_PARTIAL_IMPLEMENTED');
  assert.equal(rc.ruleSources.find(source=>source.code==='KDS 14 20 52').edition,'2024');
  assert.equal(rc.ruleSources.find(source=>source.code==='KDS 14 20 50').edition,'2022');
  assert.ok(rc.ruleSources.every(source=>/^[a-f0-9]{64}$/.test(source.sha256)&&!source.url.includes('?')));
  rc.ruleSources[0].edition='mutated';
  assert.notEqual((await ctx.call('get_design_modules',{moduleId:'reinforcement'})).modules[0].ruleSources[0].edition,'mutated');
  assert.equal(module.milestone, 'M6');
  assert.ok(module.requiredChecks.includes('joint-shear'));
  assert.equal(result.modules.find(row => row.id === 'foundations').scope, 'rc-rectangular-isolated-footing');
  await assert.rejects(ctx.call('get_design_modules', { moduleId: 'unknown' }), { code: 'INVALID_INPUT' });
  result.modules[0].requiredChecks.push('client-change');
  assert.ok(!(await ctx.call('get_design_modules')).modules[0].requiredChecks.includes('client-change'));
  assert.equal(JSON.stringify(ctx.model), before, 'query must not mutate or solve');
  console.log('PASS T00/T18 module scope, unavailable rules, actual WebMCP, input/response isolation');
} finally { await ctx.dispose(); }
