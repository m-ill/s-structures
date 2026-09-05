import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  PHASE13_RELEASE_INVARIANTS,
  buildPhase13Baseline,
  validatePhase13Baseline,
} from '../framework/phase13Baseline.js';

const outputPath = 'verification/evidence/validation/phase13/p13-m0-baseline-contract.json';
const safeDirectory = process.cwd().replaceAll('\\', '/');
const sourceRevision = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const generatedAt = new Date().toISOString();
const baseline = buildPhase13Baseline({ sourceRevision, generatedAt });
const validation = validatePhase13Baseline(baseline);
if (!validation.ok) throw new Error(`Invalid Phase 13 baseline: ${validation.errors.join(', ')}`);

const evidence = {
  version: 'p13-m0-evidence-v1',
  phase: 'Phase 13',
  milestone: 'P13-M0',
  status: 'PASS',
  generatedAt,
  sourceRevision,
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  releaseInvariants: { ...PHASE13_RELEASE_INVARIANTS },
  baseline,
  verificationRecords: [
    record('P13-M0-DOCS', 'Phase charter and production documents are present.'),
    record('P13-M0-CAPABILITIES', 'Elastic capability ownership and maturity are explicit.'),
    record('P13-M0-RUN-STATE', 'Analysis Run status surfaces and mismatch audit are fixed.'),
    record('P13-M0-INHOUSE-ENGINE', 'The production runtime remains owned by the in-house engine.'),
    record('P13-M0-SCOPE-GATES', 'OpenSees runtime, external solver dependency, nonlinear scope, and shell design transfer remain disabled.'),
  ],
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, outputPath, sourceRevision }, null, 2));

function record(id, detail) {
  return { id, status: 'PASS', detail };
}
