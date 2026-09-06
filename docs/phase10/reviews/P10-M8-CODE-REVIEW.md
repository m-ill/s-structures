# P10-M8 Code Review — Warping · LTB 설계 검토

```yaml
review: P10-M8
date: 2026-07-22
verdict: PASS_FOR_P10_M8_GATE
release_qualification: NOT_RELEASE_QUALIFIED
milestone_status: complete
dedicated_gate: PASS
phase10_regression: PASS
full_regression: PASS
externally_cross_validated: false
release_qualified: false
evidence_artifact: verification/evidence/validation/phase10/p10-m8-warping-ltb.json
evidence_records: 3/3 PASS
artifact_hash: c4635024b9fea3c0a27786d7
```

## 결정

ADR-001 옵션 B에 따라 7DOF Vlasov 요소를 추가하지 않고 기존 6DOF를 보존했다. 단면 Cw와
E·G·Iz·J·Lb·C1·k·kw를 소비하는 탄성 임계모멘트 M_cr을 steel design의 검토 계층에 연결했다.
결과는 해석값이 아닌 `design-check-not-analysis-result`이며 상세보고서에도 같은 구분과 한계를 표시한다.

## 검토 결과

1. 폐형식 구현은 FORMULAS §8과 동일하고 비유한·비양수 입력을 fail-closed한다.
2. steel member 결과는 M_cr, Mmax, ratio, C1, Lb, 지배조합과 식·provenance를 추적한다.
3. Cw 누락을 포함한 필수 입력 부족은 조용히 통과하지 않고 BLOCKED/WARN 검토로 노출한다.
4. 6DOF·전역 강성·compute domain은 변경하지 않았고 warping 응력 미제공 한계를 명시한다.

## 게이트 요약

| 범위 | 결과 |
| --- | --- |
| EL-W01 균일모멘트 M_cr 폐형식 | PASS — 상대오차 0 < 1e-6 |
| EL-W02 C1=1.25 배율 | PASS — 상대오차 1.7764e-16 < 1e-12 |
| EL-W03 steel design 통합 ratio | PASS — 오차 0 < 1e-12 |
| 기존 철골 설계·상세보고서 회귀 | PASS |
| 전역 해석 DOF 불변 계약 | PASS — `analysisDofChanged=false` |

이 리뷰는 옵션 B 내부 기능 게이트만 승인한다. 이중대칭 등단면·하중고 보정 미포함 한계가 있으며
외부 상용 solver 기준 artifact가 없으므로 M11 release 자격은 부여하지 않는다.
