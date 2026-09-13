# Phase 17 Current State Audit

```yaml
audited_at: 2026-08-28
phase17_status: p17-m0-complete-with-source-blockers
repository_separation_baseline: phase16-complete
official_strix_cases: 21
phase17_case_folders: 0
```

## 1. 출발 상태

Phase 16은 제품 실행영역과 검증 workspace의 물리 분리를 완료했다.

- product→verification import: 0
- 전체 import cycle: 0
- 검증 runner와 harness의 canonical 위치: `verification/`
- 테스트 재귀 inventory: 413개
- 제품 release: 기존 제품 부채와 외부 qualification 때문에 `BLOCKED`

Phase 17은 이 경계를 유지한 채 STRIX21 검증 정의와 실행물을 사례별로 분해한다.

## 2. 현재 STRIX 자산

| 자산 | 현재 상태 | Phase 17 판단 |
| --- | --- | --- |
| `verification/benchmarks/strix21/runs/first-batch-results.json` | aggregate 실행 결과 1개 | 역사 baseline으로 보존, 새 PASS로 재사용 금지 |
| `verification/benchmarks/strix21/runs/S-Structures_STRIX21_1차_비교보고서.md` | aggregate 비교 보고서 | 역사 보고서로 보존 |
| `verification/benchmarks/strix21/references/` | R2 source lock 21개와 discrepancy register 존재 | M0 기술 동결 완료, 사례별 reference 승인은 M2 이후 |
| `verification/framework/benchmarks/strix21FirstBatch.js` | 1,094줄 monolith | case builder·reference·runner·evaluator로 분해 필요 |
| `verification/benchmarks/strix21/cases/` | 없음 | 공식 21개 독립 폴더 신설 대상 |
| `STRIX-verification-21/` | manual, 21 HTML/PDF, catalog, checksum 존재 | 원본 수정 없이 source-of-custody manifest로 연결 |

## 3. 기존 실행 결과의 정확한 범위

기존 first batch는 공식 사례 11개와 custom 1개를 실행했다.

| 분류 | 사례 |
| --- | --- |
| 공식 수치 PASS | `SB1, SB2, SB3, SB5, SB6, SB7, SB8, SB9, SB10` |
| 공식 수치 PASS·자격 BLOCKED | `PD1, SM5` |
| 공식 미실행 | `SB12, SM5b, SM6, SR1, SR2, SR2b, P3S2, SP1, SH1, TH1` |
| 공식 분모 밖 custom | `P3S2-SS` |

52/52 metric PASS는 위 12개 실행의 내부 결과일 뿐 공식 21개 자격 완료율이 아니다.

## 4. 현재 evidence 한계

1. 현재 first-batch result의 `runId`는 `null`이다.
2. 단일 aggregate 파일명을 사용해 append-only case run 체계가 없다.
3. `artifactHash`와 `resultHash`가 동일하고 독립 evidence envelope가 없다.
4. reviewer, reference approval, model mapping approval와 source custody chain이 없다.
5. STRIX 숫자는 공개 문서 전사값이며 이 컴퓨터에서 STRIX를 다시 실행한 raw export가 아니다.
6. MIDAS 실제 모델·raw export는 포함되지 않았다.
7. expected/reference 숫자가 monolithic runner 안에 있고, reference·model·execution 책임이 결합돼 있다.
8. runner가 제품 public service 대신 다수의 production deep module을 직접 조합한다.

따라서 기존 결과는 내부 회귀 입력으로는 유효하지만 독립 재현검증 evidence로 승격할 수 없다.

## 5. 원자료 판본 불일치

- 통합 manual: document SVM-2026, revision 2026-07-11, Engine v1.0.2
- 개별 PDF 21개: 모두 Engine v1.0.2
- 현재 개별 HTML/catalog: 21개 모두 Engine v1.0.4 표기

개별 결과가 같은지 여부와 별개로 Phase 17은 다음을 M0에서 동결한다.

- case별 authoritative source 판본
- manual·개별 PDF와 HTML·catalog의 수치 차이
- 어느 판본의 tolerance와 probe를 사용하는지
- 출전 원본과 STRIX 계산값의 독립성 수준
- source file SHA-256과 추출 방식

판본 조정 전에는 `REFERENCE_LOCKED` 상태를 부여하지 않는다.

## 6. 알려진 사례 blocker

| 사례 | 현재 blocker | Phase 17 처리 |
| --- | --- | --- |
| `SB12` | 일반 경사 6-DOF link와 beta-angle 변환 요소 부재 | public capability 여부를 먼저 판정하고 없으면 `BLOCKED_ENGINE_API` |
| `PD1` | load-step별 external/internal work balance 미노출 | product result contract 보강 후 재실행 |
| `SM5` | 독립 full-precision mode vector 미확보 | source 확보 전 `BLOCKED_REFERENCE` |
| `SM5b, SM6, SR1, SR2, SR2b, TH1` | 동일 모델 재현에 필요한 입력표 일부 부족 | 원문·출전 추가 확보, 추정 금지 |
| `P3S2` | 공식 STRIX 모델·parameter와 custom P3S2-SS가 다름 | 공식 사례와 custom 사례 완전 분리 |
| `SP1` | 중립 hinge mapping fixture 미완 | mapping lock 뒤 production path 실행 |
| `SH1` | STRIX custom DcrPMMHinge3d와 동일 요소 부재 | 동등성 수준에 따라 `BLOCKED_ENGINE` 또는 `CROSS_CHECK_ONLY` |

## 7. Phase 17에서 먼저 고칠 구조

Phase 17의 첫 구현은 수치 알고리즘 변경이 아니라 검증 책임 분리다.

```text
source manifest
  -> reference extractor/approver
  -> canonical case model
  -> product adapter
  -> isolated run
  -> invariant/convergence evaluator
  -> comparison evidence
  -> artifact-only report renderer
```

수치 차이가 확인된 뒤에만 사례 discrepancy를 근거로 product solver 변경을 별도 change set에서 수행한다.
