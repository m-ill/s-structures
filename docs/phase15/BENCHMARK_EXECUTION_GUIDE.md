# Phase 15 Benchmark Execution Guide

## 목적

이 문서는 Phase 15 해석엔진 수정 뒤 같은 입력·판정 계약으로 STRIX 1차 실행군을 재현하고, M9 릴리스 준비 자료까지 연결하는 운영 절차다. 현재 결과는 내부 qualification evidence이며 MIDAS·STRIX 3자 교차검증 또는 설계전달 승인이 아니다.

## 현재 기준점

| 항목 | 값 |
| --- | --- |
| 실행 사례 | 12 |
| PASS | 9 |
| CUSTOM_PASS | 1 (`P3S2-SS`) |
| BLOCKED | 2 (`PD1`, `SM5`) |
| 수치 metric | 52/52 PASS |
| external runtime solver | 사용하지 않음 |

Blocker는 다음과 같다.

- PD1: `PD1_STAGE_WORK_BALANCE_NOT_EXPOSED`
- SM5: `SM5_INDEPENDENT_REFERENCE_MODE_VECTORS_UNAVAILABLE`

## 권장 실행 순서

저장소 루트에서 실행한다.

```powershell
npm.cmd run test:p15:list
npm.cmd run test:p15
npm.cmd run test:p14
npm.cmd run benchmark:strix21:first
npm.cmd run report:strix21:first
npm.cmd run evidence:p15:determinism
```

마일스톤 하나만 재실행하려면 다음 형식을 사용한다.

```powershell
node tools/run-phase15-tests.mjs M5
node tools/run-phase15-tests.mjs --from=2 --to=7
```

핵심 산출물:

- `verification/benchmarks/strix21/runs/first-batch-results.json`
- `verification/benchmarks/strix21/runs/S-Structures_STRIX21_1차_비교보고서.md`
- `output/pdf/S-Structures_STRIX21_1차_비교보고서.pdf`
- `verification/evidence/validation/phase15/p15-m9-determinism-evidence.json`
- `verification/evidence/validation/phase15/p15-m9-full-regression-evidence.json`
- `verification/evidence/validation/phase15/p15-m9-release-manifest.json`

## 모듈화·릴리스 사전점검

```powershell
node tools/check-phase15-architecture.mjs --output=verification/evidence/validation/phase15/p15-m8-architecture-audit.json
npm.cmd run check:p15:architecture
npm.cmd run evidence:p15:full-regression
node tools/run-p15-m9-release.mjs `
  --input=verification/evidence/validation/phase15/p15-m9-release-input.json `
  --baseline=verification/evidence/validation/phase15/p15-m0-corrective-baseline.json `
  --architecture=verification/evidence/validation/phase15/p15-m8-architecture-audit.json `
  --full-regression=verification/evidence/validation/phase15/p15-m9-full-regression-evidence.json
git diff --check
```

첫 명령은 현재 source의 감사 artifact를 재생성한다. package architecture gate의 non-zero는 알려진 High findings를 fail-closed로 차단한 결과다. 전체 회귀는 약 22분이 걸릴 수 있으며 정책은 `single-run-no-retry`다. 최종 순서는 `src 고정 → M8 감사 → 전체 회귀 → sourceDigest 일치 확인 → M9`로 유지한다. M9는 manifest를 기록하되 승인 자료가 없으면 릴리스를 허용하지 않는다.

2026-08-28 현재 M8 감사는 source `683`개, import edge `2307`개, cycle `0`, canonical owner `4×1`을 확인했다. 열린 Critical/High는 `0/52`이며 분류는 UI→numeric `40`, production→verification `11`, report→solver `1`이다. 미문서 wrapper `5`와 기한 초과 policy `4`는 별도 debt다.

실제 릴리스 후보에서는 다음 자료를 먼저 준비한다.

- 승인된 M0 reference/tolerance/probe manifest와 reviewer 서명
- 완료: calculation/result hash가 같은 3회 실행 evidence
- 완료: source-bound full regression planned 364, fail/skip/timeout/flake `0/0/0/0`
- 미완료: 독립 clean environment·mutation 100%·product surface parity·동일 환경 10회 NFR
- M0 대비 median runtime·peak RSS·dense allocation evidence
- Critical/High 0인 M8 architecture artifact
- MIDAS·STRIX full-precision R4 결과와 동일 모델 mapping audit

최초 전체 실행에서 노출된 M2 pin-roller singular와 P12 inventory 불일치는 수정했다. 최종 전체 회귀는 planned 364를 fail/skip/timeout/flake 없이 통과했고 M8 source digest와 결속됐다. 다만 이 결과는 현재 local 환경의 1회 실행이므로 clean-environment 또는 P15-NFR-NUM-03의 동일 환경 10회 안정성 증거로 승격하지 않는다.

최종 M9 manifest는 `BLOCKED`다. 현재 blocker는 `P15-REL-09`, `P15-REL-10`, `P15-REL-11`, `P15-REL-12`, `P15-REL-13`, `P15-REL-14`, `P15-REL-15`, `P15-REL-16`이며, 벤치마크 hash integrity·3회 결정론·전체 회귀 gate는 통과했다.

준비 후 `docs/phase15/P15_M9_RELEASE_RUNBOOK.md`의 `--require-release` 명령을 실행한다.

## 결과 판정 규칙

- metric PASS와 사례 qualification PASS를 구분한다.
- `CUSTOM_PASS`는 STRIX 동일 formulation PASS로 승격하지 않는다.
- `BLOCKED`는 계산 실패가 아니라 mandatory qualification evidence 부재일 수 있다.
- PD1·SM5 evidence가 추가되면 해당 capability만 재판정한다.
- timestamp와 host는 calculation hash에 넣지 않는다.
- reference, tolerance, probe, source 또는 build가 바뀌면 영향 capability evidence를 stale 처리한다.
- 구조 책임자 승인 전 `finalDesignTransferAllowed=false`다.

## 다음 벤치마크 준비

현재 12건을 회귀 기준으로 고정한 뒤 나머지 STRIX 공개군은 입력 완전성, 요소 지원, 독립 reference 확보 순으로 queue에 넣는다. 새 사례는 기존 runner에 expected 값을 끼워 넣지 않고 다음 묶음을 분리해 추가한다.

1. canonical model·축·단위·하중·지점·probe manifest
2. source page/file hash와 full-precision reference
3. signed primary metric과 convergence·equilibrium·mutation gate
4. production public API runner와 case failure isolation
5. evidence hash·report·capability manifest
