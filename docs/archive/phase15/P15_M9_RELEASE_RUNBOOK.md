# Phase 15 M9 릴리스·벤치마크 준비 실행서

## 목적

M9 CLI는 1차 벤치마크 산출물, M8 아키텍처 감사, M0 거버넌스 기준선, 회귀·clean-run 증거,
독립 리뷰, MIDAS·STRIX R4 원본을 하나의 capability manifest로 결합한다. 입력이 비어 있으면
승인을 추정하지 않고 `BLOCKED` manifest를 만든다.

## 기본 실행

```powershell
npm.cmd run evidence:p15:m9
```

동일 배치를 3회 실행하여 계산·결과 해시 일치를 실제로 기록하려면 먼저 다음을 실행한다.

```powershell
npm.cmd run evidence:p15:determinism
```

결과는 `verification/evidence/validation/phase15/p15-m9-determinism-evidence.json`에 기록된다.
`m9ExecutionInputFragment.determinismRuns`를 실제 M9 입력의 `execution`에 복사한다. 실행시각,
소요시간과 `runRecordHash`는 실행별로 달라도 되지만 `calculationHash`와 `resultHash`는 세 번 모두
현재 benchmark artifact와 같아야 한다.

전체 mandatory regression은 수동 PASS 표시 대신 다음 evidence runner로 실행한다.

```powershell
npm.cmd run evidence:p15:full-regression
```

runner는 실제 `npm.cmd test`의 stdout/stderr를 그대로 표시하고 기본 2시간 timeout 안에서 한 번
실행한다. 결과는 `verification/evidence/validation/phase15/p15-m9-full-regression-evidence.json`에 기록된다.
mandatory suite는 `verification/specs/phase15/p15-m9-full-regression-suite.json`의 inventory hash와
planned count로 동결된다. 테스트·runner·`package.json`이 의도적으로 바뀐 경우에는 suite 변경을
별도 리뷰하고 manifest hash를 다시 승인해야 하며, 단순히 현재 hash로 자동 갱신하지 않는다.
M9 CLI에는 이 artifact 자체를 `--full-regression`으로 전달한다. child exit 0, signal·timeout 없음,
fail/skip/timeout/flake 0, 실행 전후 source digest와 test inventory hash 동일 조건을 모두 만족할
때만 `fullRegressionPassed=true`다. 실행시각·runtime·출력 hash는 `run`에 분리되어 결정론적
`calculationHash`와 `fullRegressionHash`를 바꾸지 않는다.

이 artifact는 현재 작업 환경의 full regression 증거일 뿐 clean-environment 증거가 아니다.
따라서 fragment는 항상 `cleanEnvironmentPassed=false`, `cleanRunHash=null`을 기록하며,
P15-REL-09에는 별도의 독립 clean-run artifact가 필요하다.

```powershell
node tools/run-p15-m9-release.mjs `
  --input=verification/evidence/validation/phase15/p15-m9-release-input.json `
  --baseline=verification/evidence/validation/phase15/p15-m0-corrective-baseline.json `
  --architecture=verification/evidence/validation/phase15/p15-m8-architecture-audit.json `
  --full-regression=verification/evidence/validation/phase15/p15-m9-full-regression-evidence.json
```

M9 manifest는 artifact schema·hash와 M8 source digest 결속을 검증한 뒤에만
`fullRegressionPassed`, `fullRegressionHash`, `mandatoryCounts`를 파생한다. 예전처럼 이 세 값을
직접 적은 legacy 입력은 P15-REL-08을 통과하지 못한다.

이 runner의 정책은 `single-run-no-retry`다. 따라서 한 번의 PASS에서 관찰된 `flake=0`은
P15-NFR-NUM-03의 동일 환경 10회·flake 0 요구를 충족하지 않으며, 해당 NFR은 별도 반복 실행
evidence가 생길 때까지 미충족 blocker로 남는다. 재시도로 실패를 숨기거나 이 artifact를 10회
안정성 증거로 승격하지 않는다.

기본 입력과 출력은 다음과 같다.

- 벤치마크: `verification/benchmarks/strix21/runs/first-batch-results.json`
- M8 감사: 현재 source를 `tools/check-phase15-architecture.mjs`로 재검사
- 출력: `verification/evidence/validation/phase15/p15-m9-release-manifest.json`

2026-08-28 실제 snapshot:

- 3회 결정론 `PASS`: evidence hash `9f9799fe020e9526d496f9332b21f7042c1848d942761411b5ce09a4b019eb10`
- 전체 회귀 `PASS`: planned 364, fail/skip/timeout/flake `0/0/0/0`, full regression hash `c5ecb34f90de19e255ea4c8c8b424cbd6198181f0cf13664d63a6302b3e0fa21`
- M8/전체 회귀 source digest 일치: `7293013eaea14530412cd88980384f62b2a03da3d20da057e291a9a0a6fc2fc9`
- M9 `BLOCKED`: manifest hash `eb2675a834e6dcf3039931dcb1da1ef07122d0199368bbcd2d18e0867c8a7502`
- 현재 blocker: `P15-REL-09`, `P15-REL-10`, `P15-REL-11`, `P15-REL-12`, `P15-REL-13`, `P15-REL-14`, `P15-REL-15`, `P15-REL-16`

거버넌스·회귀·리뷰·R4 입력은
`verification/specs/phase15/p15-m9-release-input.example.json`을 복사하여 실제 승인 자료로 채운 뒤
다음처럼 전달한다.

```powershell
node tools/run-p15-m9-release.mjs `
  --input=verification/evidence/validation/phase15/p15-m9-release-input.json `
  --baseline=verification/evidence/validation/phase15/p15-m0-corrective-baseline.json `
  --require-release
```

`--require-release`는 BLOCKED manifest도 먼저 기록한 다음 종료 코드 1을 반환하므로 CI gate에 사용한다.

## Fail-closed 조건

다음 중 하나라도 해당하면 전체 `releaseAllowed`는 `false`다.

- calculation/result/run hash 불일치
- 12건 실행 누락, signed 수치 metric 실패, 또는 근거 없는 `REVIEW`/`BLOCKED` 상태
- capability blocker가 남아 있는데 전체 qualification을 `PASS`로 승격
- 외부 runtime solver 사용
- P3S2-SS를 STRIX 동일 요소로 표시하거나 근거 없는 R4 claim 사용
- 같은 calculation/result hash의 3회 실행, full regression, clean environment 증거 누락
- mutation 100% 또는 product surface parity 미달
- M0 거버넌스·manifest 승인·trace·freshness 누락
- M8 아키텍처 gate 또는 미종결 Critical/High finding 존재
- numerical, structural-domain, verification, architecture, release 독립 승인 누락
- MIDAS와 STRIX의 full-precision 실제 R4 결과·동일 모델 mapping 감사 누락

구조 책임자의 별도 승인 없이는 전체 릴리스 gate와 무관하게
`finalDesignTransferAllowed=false`를 유지한다.

현재 M7 계약에서는 수치 metric은 12건 모두 통과하지만 PD1은 stage work balance가 노출되지 않고,
SM5는 독립 reference mode vector가 없으므로 각각 명시적 `BLOCKED`다. 따라서 정직한 현재 batch는
`9 PASS + 1 CUSTOM_PASS + 2 BLOCKED`다. manifest는 나머지 10개 capability의 내부 자격 상태를
개별 기록하지만, 두 blocker를 전체 `PASS`로 상쇄하지 않는다. 향후 두 증거가 구현·검토되면 같은
계약에서 해당 capability만 승격한다.

## 해시 경계

`manifestHash`는 결정론적 입력과 판정만 포함한다. 실행 시각·host·invocation ID는 `run`에 분리되고
`runRecordHash`만 바뀐다. 따라서 같은 증거로 재생성한 manifest의 내용 해시는 동일하다.

first-batch v3의 `resultHashProjection`은 calculation hash에 포함한다. 실행시간·timestamp·handle 같은 명시된 telemetry만 result hash projection에서 제외하며 iterations·residual·equilibrium·solver method·fallback은 유지한다. v3 projection 선언 누락, projection field 변조 또는 중복 field는 `P15-REL-02`에서 fail-closed 처리한다.
