# Phase 10 Implementation Status

```yaml
reviewed_at: 2026-07-21
phase_status: active
implementation_status: in-progress
completed_milestones: [P10-M0, P10-M1, P10-M2]
active_milestone: null
decision_gates_pending: [ADR-001(warping/LTB 방식), ADR-002(shell 옵션 B 번복 — 오너 승인)]
owner_inputs_pending: [XV-02~08 외부 기준해 artifact (OpenSees/SAP2000/ETABS), XV-09 SAP2000 기준해 artifact, RSA V_min 기준값 정책]
```

## 현재 판정

Phase 10 구현을 시작했고 P10-M0 즉시 보정을 완료했다. θ 판정은 OK/CAUTION/REQUIRE-2ND/NG 4상태로 연결했으며, 비-direct REQUIRE-2ND 설계차단과 `statusLegacy` 호환 필드를 함께 제공한다. RSA 방향별 밑면전단 scaling은 최종 변위·관성력·부재력·층 결과에 적용되며, `V_min` 미지정 또는 적용 비활성 시 기존 수치 결과를 유지한다.
M0 전용 테스트와 영향 범위 회귀가 PASS했고, 통합 `npm.cmd test`도 종료 코드 0으로 완주했다.
상태는 코드·테스트·evidence·코드리뷰가 모두 끝난 뒤에만 `complete`로 변경한다 (phase8/9 규칙 승계).

P10-M1의 artifact 계약·러너, XV-01/02 hand-calc 기준해, XV-03~08 fixture·executor, BM-01~10 배터리와
evidence는 구현되었다. 전용 `node tools/run-phase10-tests.mjs M1` 게이트는 PASS했으며 코드리뷰 판정은
`PASS_FOR_P10_M1_HARNESS_GATE`다. 최종 통합 `npm.cmd test`도 2026-07-21
08:17:52.531~08:47:46.914 KST(29분 54.383초)에 종료 코드 0으로 PASS하여 P10-M1을 `complete`로 승격했다.
XV-03~08은 `pending-reference`, XV-09는 내부 폐형해 green/외부 SAP2000 기준해 pending,
XV-10은 후속 마일스톤 대기이며,
XV-02의 현재 hand-calc 기준해는 release 외부소스 요건에 부적격이다. 따라서
`externallyCrossValidated=false`이고 M11 release gate는 차단되어 있다.

P10-M2는 Timoshenko 강성·consistent fixed-end load·처짐 복원·release 응축·compute 계약을 하나의
요소 계약으로 구현했다. EL-T01~04 및 독립 point/partial-UDL q0를 포함한 evidence 8건은 모두 PASS했고
artifact hash는 `cf570a5579da4a3093dedb8c`다. XV-09의 내부 폐형해 대조는 green이지만 SAP2000 기준해는
`pending-reference`이므로 `externallyCrossValidated=false`는 유지한다. M2 전용 게이트와 코드리뷰는
PASS했다. 9-wide WebGPU kernel은 NVIDIA Ampere/Chrome 149 실제 장치에서도 최대 상대오차 `9.78e-8`로
PASS했으며, 다중 vendor/browser 행렬과 XV-09 외부 기준해는 M11 release 차단 항목으로 유지한다. 이번
변경을 포함한 최종 통합 `npm.cmd test`도 2026-07-21 KST 종료 코드 0으로 PASS했다.

## 마일스톤 현황

| 마일스톤 | 상태 | 완료 증거 |
| --- | --- | --- |
| P10-M0 즉시 보정 (θ 3-tier · RSA scaling) | complete | [전용 테스트](../../tests/p10-m0-quick-corrections.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m0-quick-corrections.json) · [code review](reviews/P10-M0-CODE-REVIEW.md) · [WP-00 Review Log](workpackages/WP-00-quick-corrections.md#review-log) · 전체 회귀 PASS |
| P10-M1 교차검증 + 병적 모델 배터리 | complete — harness/evidence/review/full regression PASS | [artifact 테스트](../../tests/p10-m1-xval-artifacts.mjs) · [runner 테스트](../../tests/p10-m1-xval-runner.mjs) · [BM 테스트](../../tests/p10-m1-bm-battery.mjs) · [solver 안전 회귀](../../tests/p10-m1-solver-safety.mjs) · [topology/P-Delta 안전 회귀](../../tests/p10-m1-topology-pdelta-safety.mjs) · [evidence 계약 테스트](../../tests/p10-m1-evidence-contract.mjs) · [교차검증 evidence](../../reports/validation-evidence/phase10/p10-m1-cross-validation.json) · [hand-calc evidence](../../reports/validation-evidence/phase10/p10-m1-hand-calculations.json) · [BM evidence](../../reports/validation-evidence/phase10/p10-m1-pathological-battery.json) · [code review](reviews/P10-M1-CODE-REVIEW.md) · [WP-01 Review Log](workpackages/WP-01-cross-validation.md#review-log) · 전체 회귀 PASS |
| P10-M2 Timoshenko 전단변형 | complete — 전용 gate/evidence/review/full regression PASS | [요소 테스트](../../tests/p10-m2-timoshenko.mjs) · [schema 계약](../../tests/p10-m2-schema-contract.mjs) · [compute 계약](../../tests/p10-m2-compute-domain-contract.mjs) · [evidence 계약](../../tests/p10-m2-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m2-timoshenko.json) · [XV-09 pending artifact](../../reports/validation-evidence/phase10/xv/XV-09-pending-reference.json) · [code review](reviews/P10-M2-CODE-REVIEW.md) · [WP-02 Review Log](workpackages/WP-02-timoshenko.md#review-log) |
| P10-M3 부분강접 | planned | 없음 |
| P10-M4 3D 오프셋·삽입점·패널존 | planned | 없음 |
| P10-M5 일반 MPC·rigid link | planned | 없음 |
| P10-M6 변단면 부재 | planned | 없음 |
| P10-M7 동적 확장 (prestressed·다중모드 좌굴·직접적분) | planned | 없음 |
| P10-M8 warping·LTB | planned (ADR-001 대기) | 없음 |
| P10-M9 벽·슬래브 FEM (M9a membrane / M9b plate / M9c flat shell / M9d GPU 배치) | planned (ADR-002 옵션 C-full 승인 대기) | 없음 |
| P10-M10 하중 생성·전달 | planned | 없음 |
| P10-M11 통합·성능·release gate | planned | 없음 |

## 완료 시 제품 판정 변화

- 탄성 트랙: "3D 건축 프레임 전역 탄성해석 엔진" → **"외부 교차검증 완료(externally-cross-validated) 건축 구조 탄성해석 엔진"**
- 리뷰 4단계: ① 완료 유지 · ② 완료(M2~M6·M10) · ③ 완료(M1·M11) · ④ 완료(M7~M9, ADR 범위 내)
- 등가셸 경고: M9 완료 모델에서만 'fem' formulation으로 해제, 등가 경로는 영구 유지

## 다음 작업

P10-M3 부분강접(회전스프링 단부)이 다음 구현 순서다. 동시에 오너에게 XV-02~08 및 XV-09 SAP2000
외부 기준해 입력 일정과 ADR-002 승인 여부를 확인한다. XV-09는 내부 폐형해 green/외부 기준해 pending,
XV-10은 M9 구현 뒤 추가하며, XV-01~10 required-source green 전에는 M11 release를 열지 않는다.
