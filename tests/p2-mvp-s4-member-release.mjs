import assert from 'node:assert/strict';
import {
  ERROR_CODES,
  MEMBER_RELEASE_BENCHMARK_VERSION,
  MEMBER_RELEASE_SUMMARY_VERSION,
  MEMBER_RELEASE_VERSION,
  analyzeModel,
  buildMemberReleaseSummary,
  createFixedFixedUdl,
  memberReleaseDofs,
  migrateModel,
  runMemberReleaseBenchmark,
  validateModel,
} from '../src/index.js';
import { buildAgentManifest } from '../src/ui/agentManifest.js';
import { createIndexAgentApi } from '../src/ui/indexBridge.js';

const fixture = createFixedFixedUdl();
fixture.model.members[0].releases = { i: 'pin', j: 'rigid' };
assert.deepEqual(memberReleaseDofs(fixture.model.members[0]), [4, 5]);

const analysis = analyzeModel(fixture.model);
assert.equal(analysis.ok, true);
assert.equal(Math.abs(analysis.byCombo.D_ONLY.memberResults.M1.end[5]) <= 1e-8, true);

const summary = buildMemberReleaseSummary(fixture.model);
assert.equal(summary.version, MEMBER_RELEASE_SUMMARY_VERSION);
assert.equal(summary.releaseVersion, MEMBER_RELEASE_VERSION);
assert.equal(summary.releasedMemberCount, 1);
assert.equal(summary.counts.pin, 1);

const legacy = migrateModel({ ...fixture.model, members: [{ ...fixture.model.members[0], releases: null, rel2: 'pin' }] });
assert.equal(legacy.model.members[0].releases.j, 'pin');

const badEnd = validateModel({ ...fixture.model, members: [{ ...fixture.model.members[0], releases: { k: 'pin' } }] });
assert.ok(badEnd.errors.some((item) => item.code === ERROR_CODES.BAD_RELEASE_END));

const gate = runMemberReleaseBenchmark();
assert.equal(gate.version, MEMBER_RELEASE_BENCHMARK_VERSION);
assert.equal(gate.ok, true, JSON.stringify(gate.cases, null, 2));
assert.equal(gate.count, 3);

const agent = createIndexAgentApi({ model: () => fixture.model, reanalyze: () => {} }, {
  getLastResult: () => analysis,
});
assert.equal(agent.getMemberReleaseSummary().version, MEMBER_RELEASE_SUMMARY_VERSION);
assert.equal(agent.prepareResultView('getMemberReleaseBenchmark').version, MEMBER_RELEASE_BENCHMARK_VERSION);

const manifest = buildAgentManifest();
assert.equal(manifest.modules.memberRelease, MEMBER_RELEASE_VERSION);
assert.ok(manifest.readApis.includes('getMemberReleaseSummary'));
assert.ok(manifest.readApis.includes('getMemberReleaseBenchmark'));
assert.ok(manifest.dataContracts.includes('phase2MemberReleaseSummary'));

console.log(JSON.stringify({
  ok: true,
  release: MEMBER_RELEASE_VERSION,
  benchmark: MEMBER_RELEASE_BENCHMARK_VERSION,
  cases: gate.count,
}, null, 2));
