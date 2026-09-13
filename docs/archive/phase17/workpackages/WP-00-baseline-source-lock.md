# WP-00 — P17-M0 Baseline & Source Lock

```yaml
workpackage: WP-00
milestone: P17-M0
completed_at: 2026-08-28
status: COMPLETE_WITH_SOURCE_BLOCKERS
canonical_revision: 2
baseline_hash: 06aed261d00b98c04317df8a5fd8ea33373229cbf55cc9ca8b7d65d623802e81
m1_entry_allowed: true
release_allowed: false
```

## 목적과 범위

이 작업은 구조해석을 실행하는 마일스톤이 아니다. 공식 21개 사례에 대해 어느 파일·판본·페이지·기준 lane을 사용할지 동결하고, Phase15 결과를 역사 자료로만 격리하며, 이후 결과를 보고 tolerance를 바꾸지 못하도록 source custody를 먼저 확정한다.

## 수행 결과

| 항목 | 결과 |
| --- | --- |
| 공식 사례 | manual 순서 21개 고정 |
| custom 분리 | `P3S2-SS` 공식 분모 제외 |
| source manifest | 51/51 파일, 4,613,613 B, mismatch 0 |
| source lock | R2 21/21, case별 SHA-256 및 hash chain |
| 판본 역할 | manual·개별 PDF v1.0.2 / HTML·catalog v1.0.4 분리 |
| reference lane | 독립 기준, STRIX 공개값, MIDAS, S-Structures lane 분리 |
| Phase15 보존 | 현재 JSON·Markdown·PDF를 content-addressed snapshot으로 복제 |
| discrepancy | 9개 등록 |
| 신규 해석 실행 | 0 |
| Phase17 승계 PASS | 0 |

## 구현물

- schema 4종: `verification/specs/phase17/`
- reference class와 claim evidence level 분리 사전: `verification/specs/phase17/reference-claim-vocabulary.json`
- DCR vault 원자료와 repository artifact의 path base 계약: `verification/specs/phase17/path-base-policy.json`
- source registry: `verification/benchmarks/strix21/suite-source-registry-r2.json`
- case source lock: `verification/benchmarks/strix21/references/source-locks-r2/`
- discrepancy: `verification/benchmarks/strix21/references/source-version-discrepancies-r2.json`
- evidence: `verification/evidence/validation/phase17/p17-m0-baseline-source-lock-r2.json`
- immutable snapshot: `verification/archive/phase17-m0/phase15-current-snapshot/`
- canonical runner: `verification/runners/run-p17-m0-source-lock.mjs`
- compatibility launcher: `tools/run-p17-m0-source-lock.mjs`
- negative-path test: `tests/p17-m0-source-lock.mjs`
- source value-presence audit R3: `verification/evidence/validation/phase17/p17-m0-source-value-presence-audit-r3.json`
- R2 content-claim qualification: `verification/evidence/validation/phase17/p17-m0-r2-claim-qualification-r1.json`
- report final manifest R3: `output/verification/phase17/P17-M0-BASELINE-SOURCE-LOCK-REPORT-R2.manifest-r3.json`
- implementation validation closure R3: `verification/evidence/validation/phase17/p17-m0-validation-closure-r3.json`

## 정정 이력

최초 R1 parser는 `SB12, PD1, SP1, SH1, TH1` HTML에서 설명용 `Engine: Tcl`을 증거용 `Engine: v1.0.4`보다 먼저 선택했다. 테스트가 이를 검출했다. R1 파일은 증거 보존 원칙에 따라 삭제·덮어쓰기하지 않았고 R2가 각 R1 hash와 정정 이유를 `supersedes`로 연결한다. R2에서는 동일 라벨의 마지막 evidence 필드를 선택한다.

후속 hardening에서 parser는 마지막 라벨 선택도 폐기하고 정확히 하나의 `dl.bm-evidence` scope와 다섯 필드 각각 한 개를 요구하도록 바뀌었다. baseline R2 값은 변하지 않으며 footer·부록에 동일 라벨이 추가돼도 증거 scope 밖 값은 선택하지 않는다.

최초 content audit R1은 PDF document-global text presence를 완전한 전사처럼 표현하고 SH1 clipping을 한 행처럼 축소했다. R2는 claim을 좁혔지만 HTML 행 순서를 강제하지 않았다. R3 value-presence audit은 R2를 보존한 채 catalog 순서대로 증가하는 HTML 행 match offset 131개, manual locked start page, PDF global text 391/393와 SH1 두 행 시각 결함을 분리했다.

## Gate 판정

| Gate | 상태 | 근거 |
| --- | --- | --- |
| 공식 21 ID·순서 | PASS | manual ordinal 고정 |
| custom 분리 | PASS | `P3S2-SS` excluded |
| checksum | PASS | 51/51 |
| source lock | PASS | 21 hash-valid |
| 판본 precedence | PASS | 용도별 authority 분리 |
| discrepancy | PASS | 9개 register |
| Phase15 현재본 보존 | PASS | 3개 content-addressed snapshot |
| 역할·claim vocabulary | PASS | registry에 고정 |
| 독립 reviewer 승인 | BLOCKED_RELEASE_ONLY | 아직 미지정 |
| STRIX raw runtime provenance | BLOCKED_RELEASE_ONLY | raw record/archive 미공개 |

## 종료 판정

M0의 기술 계약은 닫혔으므로 M1 framework 작업은 시작할 수 있다. 그러나 이 상태는 21개 검증 PASS, STRIX actual R4 재실행, MIDAS 교차검증 또는 제품 release를 의미하지 않는다. 위 release-only blocker가 남아 있어 `releaseAllowed=false`, `finalDesignTransferAllowed=false`를 유지한다.
