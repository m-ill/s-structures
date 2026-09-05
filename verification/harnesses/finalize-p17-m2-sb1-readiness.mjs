#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Canonical, prettyJson } from '../framework/phase17/canonical.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const outputPath = 'verification/evidence/validation/phase17/p17-m2-sb1-readiness-closure-r1.json';
const argumentsSet = new Set(process.argv.slice(2));
if ([...argumentsSet].some((value) => !['--write', '--check'].includes(value)) || argumentsSet.size > 1) throw new Error('Usage: node verification/harnesses/finalize-p17-m2-sb1-readiness.mjs --write|--check');
const mode = argumentsSet.has('--write') ? 'write' : 'check';

const files = {
  package: 'verification/benchmarks/strix21/milestones/P17-M2/SB1/m2-case-package-r1.json',
  gate: 'verification/benchmarks/strix21/milestones/P17-M2/SB1/gates/gate-assessment-r1.json',
  reportMarkdown: 'output/verification/phase17/P17-M2-SB1-READINESS-REPORT-R1.md',
  reportPdf: 'output/verification/phase17/P17-M2-SB1-READINESS-REPORT-R1.pdf',
  reportQa: 'output/verification/phase17/P17-M2-SB1-READINESS-REPORT-R1.qa-r1.json',
};
const readJson = (repositoryPath) => JSON.parse(readFileSync(absolute(repositoryPath), 'utf8'));
const packageDocument = readJson(files.package);
const gateDocument = readJson(files.gate);
const qaDocument = readJson(files.reportQa);
if (packageDocument.status !== 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL' || gateDocument.status !== 'BLOCKED_PRE_EXECUTION') throw new Error('Unexpected P17-M2 readiness status.');
if (packageDocument.gateAssessmentHash !== gateDocument.assessmentHash) throw new Error('Package/gate binding mismatch.');
if (qaDocument.status !== 'PASS' || qaDocument.reproduction.status !== 'PASS_BYTE_IDENTICAL') throw new Error('Final report QA/reproduction is not sealed PASS.');
if (qaDocument.engineeringExecution.solverExecutionCount !== 0 || qaDocument.engineeringExecution.benchmarkExecutionCount !== 0) throw new Error('Readiness closure cannot contain solver or benchmark execution.');

const bindings = Object.fromEntries(Object.entries(files).map(([role, repositoryPath]) => [role, binding(repositoryPath)]));
const testFiles = [
  'tests/p17-m2-terminal-gates.mjs',
  'tests/p17-m2-sb1-qualification.mjs',
  'tests/p17-m2-sb1-lock-package.mjs',
].map((repositoryPath) => binding(repositoryPath));
const core = {
  version: 'p17-m2-sb1-readiness-closure-v1',
  phase: 17,
  milestone: 'P17-M2',
  caseId: 'SB1',
  status: 'CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL',
  gateStatus: 'BLOCKED_PRE_EXECUTION',
  packageHash: packageDocument.packageHash,
  gateAssessmentHash: gateDocument.assessmentHash,
  readyGateCount: gateDocument.readyGateCount,
  passedTerminalGateCount: gateDocument.passedTerminalGateCount,
  executionAuthorized: false,
  terminalAuthorization: false,
  sourceByteAudit: 'PASS_3_OF_3',
  reportVisualQa: 'PASS_6_OF_6_NONBLANK',
  reportByteReproduction: 'PASS_BYTE_IDENTICAL',
  testCommands: [
    { command: 'node verification/milestones/phase17/m2/run-sb1.mjs --check + three P17-M2 tests', status: 'PASS' },
    { command: 'P17-M1 scaffold + validator + framework + extractor + boundary', status: 'PASS' },
    { command: 'P17-M1 sealed R6 evidence byte-identity check', status: 'EXPECTED_STALE_AFTER_M2_INVENTORY_EXPANSION' },
    { command: 'npm.cmd run test:p15', status: 'PASS' },
    { command: 'npm.cmd run check:public-imports', status: 'PASS' },
  ],
  testFileBindings: testFiles,
  artifactBindings: bindings,
  counters: {
    officialExecutionCount: 0,
    externallyCustodiedRunCount: 0,
    solverExecutionCount: 0,
    benchmarkExecutionCount: 0,
    engineeringResultCount: 0,
    officialPassCount: 0,
  },
  reasonCodes: [...packageDocument.reasonCodes, 'P17_M1_SEALED_EVIDENCE_PRESERVED_STALE_AFTER_M2_INVENTORY_EXPANSION'],
  releaseAllowed: false,
  finalDesignTransferAllowed: false,
};
const closure = { ...core, closureHash: sha256Canonical(core) };
const expected = Buffer.from(`${prettyJson(closure)}\n`, 'utf8');
const target = absolute(outputPath);
if (mode === 'write') {
  mkdirSync(path.dirname(target), { recursive: true });
  if (existsSync(target) && !readFileSync(target).equals(expected)) throw new Error(`Refusing to overwrite non-identical closure: ${outputPath}`);
  if (!existsSync(target)) writeFileSync(target, expected, { flag: 'wx' });
} else if (!existsSync(target) || !readFileSync(target).equals(expected)) {
  throw new Error(`P17-M2 readiness closure is missing or differs: ${outputPath}`);
}
process.stdout.write(`${JSON.stringify({ mode, status: closure.status, gateStatus: closure.gateStatus, closurePath: outputPath, closureHash: closure.closureHash, readyGateCount: closure.readyGateCount, passedTerminalGateCount: closure.passedTerminalGateCount, solverExecutionCount: 0, benchmarkExecutionCount: 0, releaseAllowed: false }, null, 2)}\n`);

function absolute(repositoryPath) {
  const result = path.resolve(root, ...repositoryPath.split('/'));
  if (result !== root && !result.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe repository path: ${repositoryPath}`);
  return result;
}

function binding(repositoryPath) {
  const bytes = readFileSync(absolute(repositoryPath));
  return { path: repositoryPath, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length };
}
