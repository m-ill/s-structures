import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STRIX21_COMPLETION_VERSION,
  runP3s2,
  runSb12,
  runSh1,
  runSm5b,
  runSm6,
  runSp1,
  runSr1Readiness,
  runSr2Readiness,
  runSr2bReadiness,
  runTh1,
} from '../verification/framework/benchmarks/strix21Completion.js';

const write = process.argv.includes('--write');
const root = fileURLToPath(new URL('..', import.meta.url));
const suiteRoot = join(root, 'verification', 'benchmarks', 'strix21');
const milestoneRoot = join(suiteRoot, 'milestones', 'P18');
const generatedAt = '2026-08-29';

const cases = {
  TH1: runTh1(),
  SP1: await runSp1(),
  SM6: runSm6(),
  SM5b: runSm5b(),
  SR1: runSr1Readiness(),
  SR2: runSr2Readiness(),
  SR2b: runSr2bReadiness(),
  P3S2: runP3s2(),
  SB12: runSb12(),
  SH1: runSh1(),
};

const records = Object.entries(cases).map(([id, result]) => ({
  schemaVersion: 'p18-case-evidence-v1',
  phase: 'P18',
  generatedAt,
  caseId: id,
  engineStatus: result.engineStatus,
  officialBenchmarkStatus: result.officialBenchmarkStatus,
  officialPassClaimed: result.officialPassClaimed,
  verdict: result.status,
  method: result.formulation || null,
  source: {
    publicPage: `https://dcr-st.com/verification/${id}.html`,
    suite: 'STRIX Verification 21',
    sourceLimitations: result.sourceLimitations || result.missingOfficialInputs || [],
  },
  productionModules: productionModules(id),
  modeling: result.model || null,
  result,
  audit: {
    probeCount: result.probes?.length || 0,
    failedProbeCount: result.probes?.filter((probe) => !probe.passed).length || 0,
    engineeringHash: result.engineeringHash,
  },
}));

const manifest = {
  schemaVersion: 'p18-completion-manifest-v1',
  phase: 'P18',
  generatedAt,
  engineVersion: STRIX21_COMPLETION_VERSION,
  releaseClaim: 'ENGINE_QUALIFICATION_ONLY_NO_THIRD_PARTY_PASS_CLAIM',
  counts: {
    total: records.length,
    enginePass: records.filter((record) => record.engineStatus === 'PASS').length,
    officialInputBlocked: records.filter((record) => record.officialBenchmarkStatus === 'INPUT_BLOCKED').length,
    officialPassClaimed: records.filter((record) => record.officialPassClaimed).length,
    failedProbe: records.reduce((sum, record) => sum + record.audit.failedProbeCount, 0),
  },
  cases: records.map((record) => ({
    caseId: record.caseId,
    verdict: record.verdict,
    engineStatus: record.engineStatus,
    officialBenchmarkStatus: record.officialBenchmarkStatus,
    probeCount: record.audit.probeCount,
    engineeringHash: record.audit.engineeringHash,
    evidencePath: `verification/benchmarks/strix21/milestones/P18/${record.caseId}/runs/p18-engine-result.json`,
    modelPath: `verification/benchmarks/strix21/milestones/P18/${record.caseId}/model/p18-engine-input.json`,
    reportPath: `verification/benchmarks/strix21/milestones/P18/${record.caseId}/report/P18-engine-verification.md`,
  })),
};

if (manifest.counts.enginePass !== 10 || manifest.counts.failedProbe !== 0) {
  throw new Error(`P18 completion gate failed: ${JSON.stringify(manifest.counts)}`);
}

if (write) {
  await mkdir(milestoneRoot, { recursive: true });
  for (const record of records) {
    const caseRoot = join(milestoneRoot, record.caseId);
    await mkdir(join(caseRoot, 'runs'), { recursive: true });
    await mkdir(join(caseRoot, 'model'), { recursive: true });
    await mkdir(join(caseRoot, 'report'), { recursive: true });
    await writeJson(join(caseRoot, 'runs', 'p18-engine-result.json'), record);
    await writeJson(join(caseRoot, 'model', 'p18-engine-input.json'), {
      schemaVersion: 'p18-engine-input-snapshot-v1',
      caseId: record.caseId,
      qualificationScope: 'S-Structures production-engine input snapshot; not an assertion of full STRIX model equivalence',
      method: record.method,
      productionModules: record.productionModules,
      input: record.modeling || record.result.property || record.result.result?.input || null,
      publicSourceLimitations: record.source.sourceLimitations,
      engineeringHash: record.audit.engineeringHash,
    });
    await writeFile(join(caseRoot, 'report', 'P18-engine-verification.md'), renderCaseReport(record), 'utf8');
  }
  await writeJson(join(milestoneRoot, 'p18-completion-manifest.json'), manifest);
  await writeFile(join(milestoneRoot, 'P18-STRIX21-ENGINE-COMPLETION.md'), renderSuiteReport(manifest), 'utf8');
}

console.log(JSON.stringify({ ok: true, write, manifest }, null, 2));

function productionModules(id) {
  const map = {
    TH1: ['src/dynamics/linearDirectIntegration.js'],
    SP1: ['src/nonlinear/pushover/productionPushover.js', 'src/nonlinear/properties/hingeRegistry.js'],
    SM6: ['src/dynamics/modal.js', 'src/solver/linear3dAssembly.js', 'src/solver/timoshenko.js'],
    SM5b: ['src/dynamics/modal.js', 'src/dynamics/modalDiaphragm.js'],
    SR1: ['src/dynamics/modal.js', 'src/dynamics/modalCombination.js', 'src/results/rsa/memberForces.js'],
    SR2: ['src/dynamics/modal.js', 'src/dynamics/modalDiaphragm.js', 'src/results/rsa/memberForces.js'],
    SR2b: ['src/dynamics/modal.js', 'src/dynamics/modalCombination.js', 'src/results/rsa/memberForces.js'],
    P3S2: ['src/solver/shell/realStabilizationQualification.js', 'src/solver/shell/wallMembraneQm6.js'],
    SB12: ['src/solver/link/elasticLink6dof.js', 'src/solver/linear3dAssembly.js'],
    SH1: ['src/nonlinear/materials/pmmHinge3d.js', 'src/nonlinear/math/monotonePchip.js', 'src/nonlinear/elements/zeroLengthPmmHinge3d.js'],
  };
  return map[id] || [];
}

function renderCaseReport(record) {
  const probes = record.result.probes || [];
  const missing = record.source.sourceLimitations;
  return `# ${record.caseId} — P18 엔진 검증 기록

## 판정

- S-Structures 엔진: **${record.engineStatus}**
- STRIX 공식 동일문제 판정: **${record.officialBenchmarkStatus}**
- 외부 프로그램 PASS 주장: **${record.officialPassClaimed ? '있음' : '없음'}**
- 결과 해시: \`${record.audit.engineeringHash}\`

## 모델링과 실행 방법

${record.method || '모델별 생산 엔진 실행'}

사용한 생산 모듈:

${record.productionModules.map((path) => `- \`${path}\``).join('\n')}

## 비교 결과

| 프로브 | S-Structures | 기준값 | 오차(%) | 단위 | 판정 |
|---|---:|---:|---:|---|---|
${probes.map((probe) => `| ${probe.id} | ${number(probe.actual)} | ${number(probe.reference)} | ${number(probe.errorPct)} | ${probe.unit || '-'} | ${probe.passed ? 'PASS' : 'FAIL'} |`).join('\n')}

## 공개 입력 제한

${missing.length ? missing.map((item) => `- ${item}`).join('\n') : '- 이 실행에서 별도 입력 누락 항목을 판정하지 않음.'}

## 해석

이 문서의 PASS는 S-Structures 생산 엔진과 독립 계산 또는 물리 불변량의 일치 판정이다. STRIX·MIDAS와 같은 입력으로 실행했다는 근거가 잠기지 않은 경우 외부 프로그램 동일문제 PASS로 승격하지 않는다.
`;
}

function renderSuiteReport(value) {
  return `# P18 — STRIX 21 잔여 10건 엔진 완성 결과

## 결론

- 엔진 기능 PASS: ${value.counts.enginePass}/${value.counts.total}
- 실패 프로브: ${value.counts.failedProbe}
- 공식 동일문제 입력 보류: ${value.counts.officialInputBlocked}
- 외부 프로그램 PASS 주장: ${value.counts.officialPassClaimed}

| 문제 | 엔진 | 공식 동일문제 | 프로브 | 결과 해시 |
|---|---|---|---:|---|
${value.cases.map((row) => `| ${row.caseId} | ${row.engineStatus} | ${row.officialBenchmarkStatus} | ${row.probeCount} | \`${row.engineeringHash.slice(0, 16)}…\` |`).join('\n')}

SR1·SR2·SR2b는 응답스펙트럼 엔진 자체는 실행·검증됐지만 공개 자료에서 정확한 질량, 단면, 배치 또는 스펙트럼 표가 빠져 있어 STRIX 공식 수치 비교를 보류했다. 나머지 7건도 외부 프로그램 실행 증거가 없으므로 이 단계에서는 S-Structures 엔진 검증 결과로만 사용한다.
`;
}

function number(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toPrecision(9) : '-';
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, jsonReplacer, 2)}\n`, 'utf8');
}

function jsonReplacer(_key, value) {
  if (typeof value === 'function') return undefined;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  if (value instanceof Set) return [...value];
  return value;
}
