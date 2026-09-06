import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertJsonSchema,
  validateSchemaDefinition,
} from '../framework/phase17/jsonSchemaStrict.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUDIT_DATE = '2026-08-28';
const STATUS = 'CONTRACT_READY_NO_BENCHMARK_RUNS';
const M0_R3_CLOSURE_HASH = '4b0b748eadad0d48b2ffa80f9dbae7d37b2d4c1a808b4390fae1b9bc7abae224';
const REPORT_STEM = 'P17-M1-CASE-CONTRACT-SHARED-HARNESS-REPORT-R3';

const PATHS = Object.freeze({
  closure: 'verification/evidence/validation/phase17/p17-m1-validation-closure-r1.json',
  schema: 'verification/specs/phase17/p17-m1-validation-closure-schema.json',
  evidence: 'verification/evidence/validation/phase17/p17-m1-case-contract-shared-harness-r6.json',
  reportMarkdown: `output/verification/phase17/${REPORT_STEM}.md`,
  reportPdf: `output/verification/phase17/${REPORT_STEM}.pdf`,
  permanentQa: `output/verification/phase17/${REPORT_STEM}.qa-r3.json`,
  renderer: 'verification/benchmarks/strix21/reporting/render_p17_m1_report.py',
  launcher: 'tools/render-p17-m1-report.mjs',
  requirements: 'verification/benchmarks/strix21/reporting/requirements-p17-m1.txt',
  workPackage: 'docs/phase17/workpackages/WP-01-case-framework.md',
  codeAndArtifactReview: 'docs/phase17/reviews/P17-M1-CODE-AND-ARTIFACT-REVIEW-R1.md',
  m0R3Closure: 'verification/evidence/validation/phase17/p17-m0-validation-closure-r3.json',
  finalizer: 'verification/harnesses/finalize-p17-m1.mjs',
  checkLayout: 'verification/harnesses/check-layout.mjs',
  taxonomyGenerator: 'verification/harnesses/generate-test-taxonomy.mjs',
  publicImportChecker: 'verification/harnesses/check-public-import-contracts.mjs',
});

const CHECK_SPECS = Object.freeze([
  check('P17-M1-C01', 'deterministic 21+1 case scaffold', 'npm run check:p17:m1:scaffold', 'npm', ['run', 'check:p17:m1:scaffold']),
  check('P17-M1-C02', 'strict JSON Schema implementation and mutations', 'npm run test:p17:m1:validator', 'npm', ['run', 'test:p17:m1:validator']),
  check('P17-M1-C03', 'shared framework and negative contracts', 'npm run test:p17:m1:framework', 'npm', ['run', 'test:p17:m1:framework']),
  check('P17-M1-C04', 'data-only result extraction provenance', 'npm run test:p17:m1:extractor', 'npm', ['run', 'test:p17:m1:extractor']),
  check('P17-M1-C05', 'active Phase 17 import and reference boundary', 'npm run check:p17:m1:boundaries', 'npm', ['run', 'check:p17:m1:boundaries']),
  check('P17-M1-C06', 'canonical R6 evidence exact check', 'npm run check:p17:m1:evidence', 'npm', ['run', 'check:p17:m1:evidence']),
  check('P17-M1-C07', 'final report byte-identical reproduction and PDF QA', 'npm run report:p17:m1:final', 'npm', ['run', 'report:p17:m1:final']),
  check('P17-M1-C08', 'verification workspace layout', 'npm run check:verification-layout', 'npm', ['run', 'check:verification-layout']),
  check('P17-M1-C09', 'test taxonomy exact check', 'npm run check:test-taxonomy', 'npm', ['run', 'check:test-taxonomy']),
  check('P17-M1-C10', 'public import contracts', 'npm run check:public-imports', 'npm', ['run', 'check:public-imports']),
  check('P17-M1-C11', 'sealed M0 source custody regression', 'npm run check:p17:sources', 'npm', ['run', 'check:p17:sources']),
  check('P17-M1-C12', 'closure finalizer syntax', 'node --check verification/harnesses/finalize-p17-m1.mjs', 'node', ['--check', PATHS.finalizer]),
]);

try {
  main();
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    code: error?.code || 'P17_M1_CLOSURE_FAILED',
    message: error?.message || String(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
}

function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => !['--write', '--check'].includes(arg));
  if (unknown.length || (args.includes('--write') && args.includes('--check'))) {
    throw closureError('P17_M1_CLOSURE_ARGUMENT_INVALID', `Use exactly one of --write or --check; unknown arguments: ${unknown.join(', ') || '(none)'}.`);
  }
  const write = args.includes('--write');
  const before = loadAndValidateInputs();
  const checks = CHECK_SPECS.map(runCheck);
  const after = loadAndValidateInputs();
  if (canonicalJson(before.bindings) !== canonicalJson(after.bindings)) {
    throw closureError('P17_M1_CLOSURE_INPUT_CHANGED_DURING_CHECKS', 'A closure input changed while exact checks were running.');
  }
  const closure = buildClosure(after, checks);
  const payload = `${JSON.stringify(closure, null, 2)}\n`;
  const closurePath = absolute(PATHS.closure);

  if (write) {
    if (existsSync(closurePath)) {
      if (readFileSync(closurePath, 'utf8') !== payload) {
        throw closureError('P17_M1_CLOSURE_IMMUTABLE_CONFLICT', `Refusing to overwrite non-identical closure: ${PATHS.closure}`);
      }
    } else {
      writeFileSync(closurePath, payload, { encoding: 'utf8', flag: 'wx', mode: 0o444 });
    }
  } else {
    if (!existsSync(closurePath)) throw closureError('P17_M1_CLOSURE_MISSING', `Closure does not exist: ${PATHS.closure}`);
    if (readFileSync(closurePath, 'utf8') !== payload) {
      throw closureError('P17_M1_CLOSURE_STALE', `Closure is not byte-identical to current inputs and checks: ${PATHS.closure}`);
    }
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: write ? 'write' : 'check',
    status: closure.status,
    closurePath: PATHS.closure,
    closureHash: closure.closureHash,
    checkCount: closure.checks.length,
    counters: closure.counters,
    releaseAllowed: closure.releaseAllowed,
  }, null, 2)}\n`);
}

function loadAndValidateInputs() {
  const schema = readJson(PATHS.schema);
  const schemaErrors = validateSchemaDefinition(schema);
  if (schemaErrors.length) {
    throw closureError('P17_M1_CLOSURE_SCHEMA_INVALID', schemaErrors.map((row) => `${row.schemaPath}:${row.keyword}:${row.message}`).join('; '));
  }

  const evidenceFile = requiredFile(PATHS.evidence);
  const evidence = parseJson(evidenceFile.bytes, PATHS.evidence);
  assertSelfHash(evidence, 'evidenceHash', 'P17-M1 R6 evidence');
  if (evidence.version !== 'p17-m1-case-contract-shared-harness-evidence-v6'
    || evidence.milestone !== 'P17-M1'
    || evidence.status !== STATUS
    || evidence.evidencePath !== PATHS.evidence
    || evidence.releaseAllowed !== false
    || evidence.finalDesignTransferAllowed !== false) {
    throw closureError('P17_M1_EVIDENCE_STATUS_INVALID', 'R6 evidence identity or no-release status is invalid.');
  }
  assertEvidenceZeroCounters(evidence);

  const markdown = requiredFile(PATHS.reportMarkdown);
  const pdf = requiredFile(PATHS.reportPdf);
  const qaFile = requiredFile(PATHS.permanentQa);
  const qa = parseJson(qaFile.bytes, PATHS.permanentQa);
  assertSelfHash(qa, 'qaHash', 'P17-M1 permanent report QA');
  validatePermanentQa(qa, evidenceFile, evidence, markdown, pdf);

  const m0File = requiredFile(PATHS.m0R3Closure);
  const m0 = parseJson(m0File.bytes, PATHS.m0R3Closure);
  assertSelfHash(m0, 'closureHash', 'P17-M0 R3 closure');
  if (m0.closureHash !== M0_R3_CLOSURE_HASH || m0.milestone !== 'P17-M0' || m0.closureRevision !== 3) {
    throw closureError('P17_M0_R3_BINDING_INVALID', 'P17-M0 R3 closure identity/hash mismatch.');
  }

  const bindings = {
    evidence: {
      ...binding(evidenceFile),
      version: evidence.version,
      evidenceHash: evidence.evidenceHash,
    },
    report: {
      markdown: binding(markdown),
      pdf: { ...binding(pdf), pageCount: qa.report.pdf.pageCount },
      permanentQa: {
        ...binding(qaFile),
        qaHash: qa.qaHash,
        status: qa.status,
        artifactScope: qa.artifactScope,
        pageCount: qa.report.pdf.pageCount,
      },
    },
    reportToolchain: {
      renderer: binding(requiredFile(PATHS.renderer)),
      launcher: binding(requiredFile(PATHS.launcher)),
      requirements: binding(requiredFile(PATHS.requirements)),
    },
    developmentDocuments: {
      workPackage: binding(requiredFile(PATHS.workPackage)),
      codeAndArtifactReview: binding(requiredFile(PATHS.codeAndArtifactReview)),
    },
    predecessor: {
      m0R3Closure: { ...binding(m0File), closureHash: m0.closureHash },
    },
    closureTooling: {
      finalizer: binding(requiredFile(PATHS.finalizer)),
      schema: binding(requiredFile(PATHS.schema)),
      checkLayout: binding(requiredFile(PATHS.checkLayout)),
      taxonomyGenerator: binding(requiredFile(PATHS.taxonomyGenerator)),
      publicImportChecker: binding(requiredFile(PATHS.publicImportChecker)),
    },
  };
  return { schema, evidence, qa, bindings };
}

function buildClosure(input, checks) {
  const core = {
    version: 'p17-m1-validation-closure-v1',
    closureRevision: 1,
    auditDate: AUDIT_DATE,
    phase: 17,
    milestone: 'P17-M1',
    status: STATUS,
    claimBoundary: {
      proven: 'CASE_CONTRACT_AND_SHARED_HARNESS_ONLY',
      notProven: 'NO_MODEL_SOLVER_BENCHMARK_RESULT_CAPTURE_CASE_REPORT_OR_PASS',
    },
    terminalQualification: {
      enabled: false,
      passAllowed: false,
      status: 'DISABLED_NO_BENCHMARK_RUNS',
    },
    counters: {
      officialCaseExecutionCount: 0,
      officialTerminalCaseCount: 0,
      officialPassCount: 0,
      solverExecutionCount: 0,
      benchmarkExecutionCount: 0,
      structuralModelCount: 0,
      engineeringResultCount: 0,
      chromeCaptureCount: 0,
      caseReportCount: 0,
    },
    bindings: input.bindings,
    checks,
    nextMilestone: {
      id: 'P17-M2',
      caseId: 'SB1',
      entryCondition: 'SOURCE_REFERENCE_PROBE_TOLERANCE_AND_MODEL_LOCKS_REQUIRED_BEFORE_PRODUCT_RUN',
    },
    reasonCodes: [
      'P17_M1_FRAMEWORK_ONLY_NO_BENCHMARK_EXECUTION',
      'P17_TERMINAL_QUALIFICATION_DISABLED',
      'P17_RELEASE_NOT_ALLOWED',
    ],
    releaseAllowed: false,
    finalDesignTransferAllowed: false,
  };
  const closure = { ...core, closureHash: canonicalHash(core) };
  assertJsonSchema(input.schema, closure, 'P17-M1 validation closure');
  if (closure.closureHash !== canonicalHash(without(closure, 'closureHash'))) {
    throw closureError('P17_M1_CLOSURE_HASH_INVALID', 'Generated closureHash is not canonical.');
  }
  return closure;
}

function validatePermanentQa(qa, evidenceFile, evidence, markdown, pdf) {
  if (qa.version !== 'p17-m1-report-qa-v1'
    || qa.artifactScope !== 'FINAL_ARTIFACT'
    || qa.status !== 'PASS'
    || qa.reportStatus !== STATUS
    || qa.releaseAllowed !== false
    || qa.finalDesignTransferAllowed !== false
    || qa.reproduction?.status !== 'PASS_BYTE_IDENTICAL') {
    throw closureError('P17_M1_PERMANENT_QA_STATUS_INVALID', 'Permanent report QA must be a passing byte-identical final artifact record.');
  }
  if (qa.evidence?.path !== PATHS.evidence
    || qa.evidence?.evidenceHash !== evidence.evidenceHash
    || qa.evidence?.fileSha256 !== evidenceFile.sha256
    || qa.evidence?.canonicalHashVerification !== 'PASS') {
    throw closureError('P17_M1_PERMANENT_QA_EVIDENCE_MISMATCH', 'Permanent QA does not bind the canonical R6 evidence.');
  }
  if (qa.report?.markdown?.path !== markdown.path
    || qa.report?.markdown?.sha256 !== markdown.sha256
    || qa.report?.markdown?.byteLength !== markdown.byteLength
    || qa.report?.pdf?.path !== pdf.path
    || qa.report?.pdf?.sha256 !== pdf.sha256
    || qa.report?.pdf?.byteLength !== pdf.byteLength
    || !Number.isInteger(qa.report?.pdf?.pageCount)
    || qa.report.pdf.pageCount < 1
    || qa.automatedPdfQa?.pageCount !== qa.report.pdf.pageCount
    || qa.automatedPdfQa?.renderedPageCount !== qa.report.pdf.pageCount
    || qa.automatedPdfQa?.blankPageCount !== 0) {
    throw closureError('P17_M1_PERMANENT_QA_REPORT_MISMATCH', 'Permanent QA report hashes, byte lengths or page counts are invalid.');
  }
  const execution = qa.engineeringExecution || {};
  for (const key of ['benchmarkExecutionCount', 'solverExecutionCount', 'structuralModelCount', 'engineeringResultCount', 'chromeCaptureCount', 'fakeScreenshotCount']) {
    if (execution[key] !== 0) throw closureError('P17_M1_PERMANENT_QA_COUNTER_NONZERO', `Permanent QA ${key} must equal zero.`);
  }
}

function assertEvidenceZeroCounters(evidence) {
  const counters = evidence.resultCounters || {};
  const required = [
    'benchmarkExecutionCount',
    'solverExecutionCount',
    'engineeringResultCount',
    'structuralModelCount',
    'chromeCaptureCount',
    'caseReportCount',
    'officialTerminalCaseCount',
    'officialPassCount',
  ];
  for (const key of required) {
    if (counters[key] !== 0) throw closureError('P17_M1_EVIDENCE_COUNTER_NONZERO', `R6 evidence ${key} must equal zero.`);
  }
  if (evidence.frameworkInventory?.officialCaseCount !== 21
    || evidence.frameworkInventory?.customCaseCount !== 1
    || evidence.contractSmoke?.benchmarkExecuted !== false
    || evidence.contractSmoke?.solverExecuted !== false) {
    throw closureError('P17_M1_EVIDENCE_SCOPE_INVALID', 'R6 evidence case denominator or no-execution boundary is invalid.');
  }
}

function runCheck(specification) {
  const npmOnWindows = specification.program === 'npm' && process.platform === 'win32';
  const executable = npmOnWindows
    ? (process.env.ComSpec || 'cmd.exe')
    : specification.program;
  const args = npmOnWindows
    ? ['/d', '/s', '/c', 'npm.cmd', ...specification.args]
    : specification.args;
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
    env: { ...process.env, P17_CLOSURE_FINALIZER: '1' },
  });
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stdout, result.stderr].filter(Boolean).join('\n').slice(-8_000);
    throw closureError('P17_M1_CLOSURE_CHECK_FAILED', `${specification.id} failed (${specification.command}).\n${detail}`);
  }
  const stdout = Buffer.from(result.stdout || '', 'utf8');
  const stderr = Buffer.from(result.stderr || '', 'utf8');
  const outputBinding = {
    stdout: {
      byteLength: stdout.byteLength,
      sha256: sha256(stdout),
    },
    stderr: {
      byteLength: stderr.byteLength,
      sha256: sha256(stderr),
    },
  };
  return {
    id: specification.id,
    purpose: specification.purpose,
    command: specification.command,
    status: 'PASS',
    exitCode: 0,
    outputBinding,
    resultHash: canonicalHash({
      id: specification.id,
      command: specification.command,
      exitCode: 0,
      ...outputBinding,
    }),
  };
}

function requiredFile(repositoryPath) {
  const target = absolute(repositoryPath);
  if (!existsSync(target)) throw closureError('P17_M1_CLOSURE_INPUT_MISSING', `Required closure input is missing: ${repositoryPath}`);
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink()) throw closureError('P17_M1_CLOSURE_INPUT_UNSAFE', `Closure input must be a regular non-link file: ${repositoryPath}`);
  const realRoot = realpathSync(ROOT);
  const realTarget = realpathSync(target);
  if (!realTarget.startsWith(`${realRoot}${path.sep}`)) throw closureError('P17_M1_CLOSURE_INPUT_ESCAPE', `Closure input resolves outside the repository: ${repositoryPath}`);
  const bytes = readFileSync(target);
  if (!bytes.byteLength) throw closureError('P17_M1_CLOSURE_INPUT_EMPTY', `Closure input is empty: ${repositoryPath}`);
  return {
    path: repositoryPath,
    bytes,
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

function binding(file) {
  return { path: file.path, byteLength: file.byteLength, sha256: file.sha256 };
}

function readJson(repositoryPath) {
  const file = requiredFile(repositoryPath);
  return parseJson(file.bytes, repositoryPath);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    throw closureError('P17_M1_CLOSURE_JSON_INVALID', `${label} is not valid UTF-8 JSON.`, error);
  }
}

function assertSelfHash(value, field, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !/^[a-f0-9]{64}$/u.test(String(value[field] || ''))) {
    throw closureError('P17_M1_CLOSURE_SELF_HASH_MISSING', `${label} lacks ${field}.`);
  }
  const computed = canonicalHash(without(value, field));
  if (value[field] !== computed) throw closureError('P17_M1_CLOSURE_SELF_HASH_MISMATCH', `${label} ${field} mismatch.`);
}

function absolute(repositoryPath) {
  if (typeof repositoryPath !== 'string'
    || !repositoryPath
    || repositoryPath.includes('\\')
    || repositoryPath.startsWith('/')
    || /^[A-Za-z]:/u.test(repositoryPath)
    || repositoryPath.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw closureError('P17_M1_CLOSURE_PATH_INVALID', `Invalid repository-relative path: ${repositoryPath}`);
  }
  const target = path.resolve(ROOT, ...repositoryPath.split('/'));
  if (!target.startsWith(`${ROOT}${path.sep}`)) throw closureError('P17_M1_CLOSURE_PATH_ESCAPE', `Path escapes repository root: ${repositoryPath}`);
  return target;
}

function check(id, purpose, command, program, args) {
  return Object.freeze({ id, purpose, command, program, args: Object.freeze(args) });
}

function without(value, key) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

function canonicalHash(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function closureError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}
