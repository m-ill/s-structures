# S-Structures Verification Workspace

이 폴더는 S-Structures 제품 실행영역과 분리된 검증 정본이다. benchmark 결과가 PASS인지와 무관하게 reference, tolerance, runner, evidence와 보고서의 책임을 production runtime 밖에 둔다.

## Phase 17 현재 상태

`P17-M1` 상태는 `CONTRACT_READY_NO_BENCHMARK_RUNS`다. 공식 21개와 별도 custom 1개 사례에 대해 사례별 19개 파일, 총 419개 결정론적 scaffold와 runtime manifest schema 16종을 준비했다. 공식+custom canonical wrapper의 process-isolated contract smoke는 `22/22 CONTRACT_VALIDATED`다. 일반 child exit code 0은 `CHILD_SUCCEEDED_UNQUALIFIED`로 남는다.

이 숫자는 폴더·manifest 계약 검사다. 실제 구조 모델, solver·benchmark 실행, engineering result, Chrome capture, 사례 보고서와 공식 `PASS`는 모두 0이다. M1 terminal authorization은 강제로 `false`이고 pre-report 상태는 `QUALIFICATION_CANDIDATE`까지만 허용한다. `releaseAllowed=false`와 `finalDesignTransferAllowed=false`를 유지한다.

다음 마일스톤은 `P17-M2 / SB1`이다. official execution receipt, pinned external custodian registry, reference byte audit, extraction/comparison·physics/mutation replay, 외부 custody 3회 run, deterministic PDF·화면 parity, scoped reviewer attestation과 SB1 lock이 승인되기 전에는 terminal 판정 경로를 열지 않는다.

## 현재 canonical 위치

| 자산 | canonical path | 정책 |
| --- | --- | --- |
| 검증 명세·schema | `verification/specs/` | Git 추적 정본 |
| 검증 framework | `verification/framework/` | production이 import하지 않는 qualification 구현 |
| P17 사례 framework | `verification/framework/phase17/` | builder·reference·adapter·runner·append-only·report 책임 분리 |
| P17 strict schema validator | `verification/framework/phase17/jsonSchemaStrict.mjs` | M1 정본 validator; unknown keyword fail-closed |
| 검증 runner | `verification/runners/` | 검증 명령의 canonical entrypoint |
| 검증 harness | `verification/harnesses/` | 구조·결정론·성능·수집 gate |
| 테스트 분류 | `verification/tests/taxonomy.json` | 두 테스트 루트의 재귀 inventory |
| 일반 검증 evidence | `verification/evidence/validation/` | 실행 단위 append-only |
| STRIX21 실행 결과 | `verification/benchmarks/strix21/runs/` | JSON이 기계 판정 정본 |
| STRIX21 사례 계약 | `verification/benchmarks/strix21/suite-manifest.json`, `cases/`, `custom/` | 공식 21개와 custom 분모 분리 |
| 외부 reference | `verification/benchmarks/strix21/references/` | 출처·버전·license·SHA-256 필수 |
| 이전 경로 mapping | `verification/archive/legacy-layout-map.json` | byte hash 보존 |
| canonical path API | `verification/workspace-paths.mjs` | runner에서 공통 사용 |

Phase 16에서 명세 58개, validation evidence 149개, STRIX21 실행물 2개를 이동했다. 이어서 기존 `src/verification` 48개를 제품 진단(`src/diagnostics`), 제품 release 정책(`src/platform`), 독립 검증 framework로 책임 분리하고 검증 runner 49개와 harness 14개를 canonical 경로로 이동했다. 기존 `tools/` 진입점은 외부 자동화 호환 wrapper로만 남는다.

## 실행 원칙

- production은 verification을 import하지 않는다.
- verification만 production public service를 호출한다.
- 역사 evidence 파일은 이동 중 내용을 수정하지 않는다.
- 새 evidence는 기존 파일을 덮어쓰지 않고 run ID 또는 milestone ID로 저장한다.
- 최종 구조설계 전이는 별도 전문가 승인 없이는 허용하지 않는다.
- `CONTRACT_VALIDATED`를 구조해석 성공 또는 benchmark PASS로 집계하지 않는다.
- 사례 실행 전 source/reference/probe/tolerance/model을 동결하고 새 run ID의 append-only evidence로만 상태를 전이한다.

## 운영 명령

```powershell
npm.cmd run check:verification-layout
npm.cmd run check:test-taxonomy
npm.cmd run test:p17:m1
npm.cmd run test:p17
```

M1 개별 gate는 다음과 같다.

```powershell
npm.cmd run check:p17:m1:scaffold
npm.cmd run test:p17:m1:validator
npm.cmd run test:p17:m1:framework
npm.cmd run test:p17:m1:extractor
npm.cmd run check:p17:m1:boundaries
npm.cmd run check:p17:m1:evidence
npm.cmd run report:p17:m1:final
npm.cmd run check:p17:m1:closure
```

위 명령의 `PASS`는 schema·scaffold·격리·append-only·boundary 계약 판정이다. 사례 수치 PASS가 아니다.

검사는 이동 전 manifest와 현재 파일을 대조한다. 역사 evidence 내부에 기록된 옛 경로 문자열은 당시 기록이므로 수정하지 않으며, 현재 코드에서 옛 경로를 다시 사용하는 경우에만 실패한다. 기록된 비결정적 legacy 생성물 예외는 `verification/archive/post-move-exceptions.json`에서 확인한다.
