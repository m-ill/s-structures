import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import os from 'node:os';

const root = resolve('.');
const out = resolve(process.argv[2] || `output/revalidation/${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(out, { recursive: false }); // Never overwrite an earlier evidence run.
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { encoding: 'utf8' }).trim();
let source;
try { source = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), trackedChanges: git('status', '--porcelain', '--untracked-files=no') }; }
catch { source = JSON.parse(readFileSync('SOURCE-IDENTITY.json', 'utf8')); }
const tests = [
 'tests/webmcp-integration.mjs', 'tests/webmcp-bridge-security.mjs', 'tests/m31-agent-command-bridge.mjs',
 'verification/harnesses/check-public-import-contracts.mjs', 'verification/harnesses/check-agent-contract.mjs',
 'tests/p17-m1-json-schema-validator.mjs', 'tests/p17-m1-framework-contract.mjs', 'tests/p17-m1-result-extractor.mjs',
 'tests/p18-th1-sp1.mjs', 'tests/p18-modal-stabilization.mjs', 'tests/p18-link-pmm.mjs',
 'tests/p18-strix21-completion.mjs', 'tests/p18a-additional-comparisons.mjs',
];
const report = { schema: 'sstructures-public-validation-v1', startedAt: new Date().toISOString(), source,
 runtime: { node: process.version, platform: process.platform, arch: process.arch, release: os.release() },
 externalQualification: 'NOT_CLAIMED', scope: 'WebMCP, bridges, public contracts, P17 framework, P18/P18A numerical regressions', results: [] };
for (const [i, test] of tests.entries()) {
 const startedAt = new Date().toISOString();
 const result = spawnSync(process.execPath, [test], { encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
 const log = `${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`;
 const logPath = `${String(i + 1).padStart(2, '0')}-${test.split('/').at(-1)}.log`;
 writeFileSync(join(out, logPath), log);
 report.results.push({ test, startedAt, completedAt: new Date().toISOString(), exitCode: result.status,
 status: result.status === 0 ? 'PASS' : 'FAIL', log: logPath, sha256: createHash('sha256').update(log).digest('hex') });
 console.log(`${report.results.at(-1).status} ${test}`);
}
report.completedAt = new Date().toISOString();
report.passed = report.results.filter(x => x.status === 'PASS').length;
report.failed = report.results.length - report.passed;
writeFileSync(join(out, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
process.exitCode = report.failed ? 1 : 0;
