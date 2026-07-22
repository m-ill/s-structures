# Phase 10 Implementation Status

```yaml
reviewed_at: 2026-07-22
phase_status: active
implementation_status: in-progress
completed_milestones: [P10-M0, P10-M1, P10-M2, P10-M3, P10-M4, P10-M5, P10-M6, P10-M7, P10-M8]
active_milestone: P10-M9
decision_gates_pending: []
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

P10-M3는 `member.releases.spring.{ryI,rzI,ryJ,rzJ}` 4축 회전스프링, absent 강접과 explicit-zero
release 구분, 안정 Schur 강성·fixed-end load·실제 부재단 회전 복구를 구현했다. DomainBinary v3는
4-wide Float64 강성과 presence mask로 zero를 보존한다. CN-F01 강접 극한 최대 상대오차는 약 `4.00e-12`,
CN-F02 zero-vs-pin은 약 `3.39e-16`이고 release moment residual은 `7.1054e-15`, CN-F03 EB/Timoshenko
폐형해는 각각 약 `1.9e-15`/`2.9e-15`로 기준을 통과했다. M3 전용 runner는 4/4 PASS했고 evidence
7/7 records의 artifact hash는 `aa4180cd16d91d6904a2db22`다. 외부 solver 기준해가 아니므로
`externallyCrossValidated=false`, `releaseQualified=false`다.
유한 spring Direct P-Delta는 `PARTIAL_FIXITY_PRISMATIC_KG_APPROXIMATION`을 명시하며 zero-spring
P-Delta, global buckling, nonlinear 경로는 검증되지 않은 spring을 무시하지 않고 fail-closed한다.
이는 M3 기능 게이트 완료 판정이며 외부 XV release 자격을 부여하지 않는다.

P10-M4는 숫자형 축방향 오프셋을 보존하면서 local/global 3D 강체팔, 9종 삽입점 및 절점 패널존을
공통 `T_off` 요소 변환으로 구현했다. DomainBinary v4와 hash, Agent action, 선형 복원·평형 audit 및
Direct P-Delta KG가 같은 계약을 사용한다. EL-O01~04는 모두 오차 0이며 evidence artifact hash는
`9052baa9bcd0cdf092b4db0d`다. 미검증 nonlinear corotational 경로는 fail-closed한다.
이는 M4 기능 게이트 완료이며 `externallyCrossValidated=false`, `releaseQualified=false`를 유지한다.

## 마일스톤 현황

| 마일스톤 | 상태 | 완료 증거 |
| --- | --- | --- |
| P10-M0 즉시 보정 (θ 3-tier · RSA scaling) | complete | [전용 테스트](../../tests/p10-m0-quick-corrections.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m0-quick-corrections.json) · [code review](reviews/P10-M0-CODE-REVIEW.md) · [WP-00 Review Log](workpackages/WP-00-quick-corrections.md#review-log) · 전체 회귀 PASS |
| P10-M1 교차검증 + 병적 모델 배터리 | complete — harness/evidence/review/full regression PASS | [artifact 테스트](../../tests/p10-m1-xval-artifacts.mjs) · [runner 테스트](../../tests/p10-m1-xval-runner.mjs) · [BM 테스트](../../tests/p10-m1-bm-battery.mjs) · [solver 안전 회귀](../../tests/p10-m1-solver-safety.mjs) · [topology/P-Delta 안전 회귀](../../tests/p10-m1-topology-pdelta-safety.mjs) · [evidence 계약 테스트](../../tests/p10-m1-evidence-contract.mjs) · [교차검증 evidence](../../reports/validation-evidence/phase10/p10-m1-cross-validation.json) · [hand-calc evidence](../../reports/validation-evidence/phase10/p10-m1-hand-calculations.json) · [BM evidence](../../reports/validation-evidence/phase10/p10-m1-pathological-battery.json) · [code review](reviews/P10-M1-CODE-REVIEW.md) · [WP-01 Review Log](workpackages/WP-01-cross-validation.md#review-log) · 전체 회귀 PASS |
| P10-M2 Timoshenko 전단변형 | complete — 전용 gate/evidence/review/full regression PASS | [요소 테스트](../../tests/p10-m2-timoshenko.mjs) · [schema 계약](../../tests/p10-m2-schema-contract.mjs) · [compute 계약](../../tests/p10-m2-compute-domain-contract.mjs) · [evidence 계약](../../tests/p10-m2-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m2-timoshenko.json) · [XV-09 pending artifact](../../reports/validation-evidence/phase10/xv/XV-09-pending-reference.json) · [code review](reviews/P10-M2-CODE-REVIEW.md) · [WP-02 Review Log](workpackages/WP-02-timoshenko.md#review-log) |
| P10-M3 부분강접 | complete — 4/4 dedicated gate, evidence 7/7 PASS | [부분강접 요소·폐형해](../../tests/p10-m3-partial-fixity.mjs) · [schema/DomainBinary v3 계약](../../tests/p10-m3-schema-contract.mjs) · [domain/solver route 계약](../../tests/p10-m3-domain-route-contract.mjs) · [evidence 계약](../../tests/p10-m3-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m3-partial-fixity.json) · [code review](reviews/P10-M3-CODE-REVIEW.md) · [WP-03 Review Log](workpackages/WP-03-partial-fixity.md#review-log) |
| P10-M4 3D 오프셋·삽입점·패널존 | complete — 전용 gate/evidence/review/full regression PASS | [요소·평형](../../tests/p10-m4-offsets-panelzone.mjs) · [schema/DomainBinary v4](../../tests/p10-m4-schema-domain-contract.mjs) · [evidence 계약](../../tests/p10-m4-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m4-offsets-panelzone.json) · [code review](reviews/P10-M4-CODE-REVIEW.md) |
| P10-M5 일반 MPC·rigid link | complete — 전용 gate/evidence/review PASS | [solver gate](../../tests/p10-m5-mpc-rigidlink.mjs) · [schema/DomainBinary v5](../../tests/p10-m5-schema-domain-contract.mjs) · [evidence contract](../../tests/p10-m5-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m5-mpc-rigidlink.json) · [code review](reviews/P10-M5-CODE-REVIEW.md) |
| P10-M6 변단면 부재 | complete — EL-P01~03/evidence/review PASS | [요소·계약 테스트](../../tests/p10-m6-tapered.mjs) · [evidence contract](../../tests/p10-m6-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m6-tapered.json) · [code review](reviews/P10-M6-CODE-REVIEW.md) |
| P10-M7 동적 확장 (prestressed·다중모드 좌굴·직접적분) | complete — DY-01~06/evidence/review PASS | [동적 gate](../../tests/p10-m7-dynamics-extension.mjs) · [evidence contract](../../tests/p10-m7-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m7-dynamics-extension.json) · [code review](reviews/P10-M7-CODE-REVIEW.md) |
| P10-M8 warping·LTB | complete — ADR-001 옵션 B, EL-W01~03/evidence/review PASS | [폐형식·설계 통합](../../tests/p10-m8-warping-ltb.mjs) · [evidence contract](../../tests/p10-m8-evidence-contract.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m8-warping-ltb.json) · [code review](reviews/P10-M8-CODE-REVIEW.md) |
| P10-M9 벽·슬래브 FEM (M9a membrane / M9b plate / M9c flat shell / M9d GPU 배치) | in progress — M9a~c CPU 기능 gate PASS, M9d f32 shadow/fallback PASS, native WebGPU K1~K3 pending | [M9 tests](../../tests/p10-m9a-wall-membrane.mjs) · [evidence](../../reports/validation-evidence/phase10/p10-m9-shell-fem.json) · [code review](reviews/P10-M9-CODE-REVIEW.md) |
| P10-M10 하중 생성·전달 | planned | 없음 |
| P10-M11 통합·성능·release gate | planned | 없음 |

## 완료 시 제품 판정 변화

- 탄성 트랙: "3D 건축 프레임 전역 탄성해석 엔진" → **"외부 교차검증 완료(externally-cross-validated) 건축 구조 탄성해석 엔진"**
- 리뷰 4단계: ① 완료 유지 · ② 완료(M2~M6·M10) · ③ 완료(M1·M11) · ④ 완료(M7~M9, ADR 범위 내)
- 등가셸 경고: M9 완료 모델에서만 'fem' formulation으로 해제, 등가 경로는 영구 유지

## 다음 작업

P10-M9의 CPU Shell FEM과 f32 shadow/fallback 경로를 구현했다. 다음 작업은 실제 WebGPU 장치에서 K1 요소 생성, K2 결정론 gather, K3 응력 복원 커널을 연결하고 SH-G02~05를 닫는 것이다. XV-10 외부 기준 비교 전에는 M11 release를 열지 않는다.

## P10-M5 완료 기록

`model.constraints[]`에 `mpc`, `rigidLink`, `masterSlave`를 additive로 도입했다. 기존 `u=Tq+u_bar`
계약을 재사용해 별도 구속 엔진을 만들지 않았으며, 선형·모달·Direct P-Delta와 DomainBinary v5를 같은 식으로 연결했다.
전용 gate 3/3과 evidence 5/5가 PASS했고 artifact hash는 `9cb8470ec77fd50f7a7ac138`다.
내부 기능 gate만 완료한 상태이므로 `externallyCrossValidated=false`, `releaseQualified=false`는 유지한다.

## P10-M6 완료 기록

`member.taper`에 `linear`, `parabolic-depth`, `segments` 프로파일과 5/10점 Gauss 설정을 additive로 도입했다.
force-based 유연도 적분으로 축·비틀림·2축 휨과 선택적 Timoshenko 전단을 조립하고, 21개 station 단면,
consistent fixed-end trace, `∫ρA dx` 질량, KG provenance, DomainBinary v6 및 element descriptor v4를 연결했다.
EL-P01~03 최대 오차는 각각 `5.9212e-16`, `4.0464e-9`, `4.0464e-9`이며 evidence artifact hash는
`bf73a838dd2c01d200741dae`다. 외부 상용 solver 교차검증 전이므로 release qualification은 부여하지 않는다.

## P10-M7 완료 기록

중력 조합 Direct P-Delta 수렴 축력으로 `Kt=Ke+Kg(N_G)`를 조립하고 prestressed 모달과 RSA가 같은 고정 Kt 모드를
사용하도록 연결했다. 모든 모달/RSA provenance는 `elastic-Ke` 또는 `gravity-tangent-Kt`를 명시하며, prestressed 요청에서
기준이 없으면 fail-closed한다. 좌굴은 공통 requested-mode sparse eigen을 유지하고 코어 기본값을
`analysisSettings.dynamics.bucklingModes ?? 6`으로 확장했다. `linearTha.integration`은 기존 `modal`과 새 `direct`를 선택하며,
direct 경로는 Rayleigh 감쇠, Newmark β=1/4·γ=1/2, P9 factorSession의 단일 K_eff 분해 재사용과 에너지 감사를 제공한다.
DY-01~06은 6/6 PASS했고 artifact hash는 `8d018a9af8d2a1bdc48b9175`다. 외부 상용 solver 교차검증 전이므로
`externallyCrossValidated=false`, `releaseQualified=false`를 유지한다.

## P10-M8 완료 기록

ADR-001 옵션 B를 승인 기록하고 기존 6DOF를 보존한 채 `E·G·Iz·J·Cw·Lb·C1·k·kw` 폐형식 M_cr을
steel design 및 상세보고서에 연결했다. 결과는 `{Mcr, Mmax, ratio, C1, Lb, governingCombinationId}`와
식·provenance·limitations를 제공하는 `design-check-not-analysis-result`다. 7DOF, warping 변위·bimoment·
warping 응력은 지원하지 않는다. EL-W01~03은 3/3 PASS했고 artifact hash는
`c4635024b9fea3c0a27786d7`다. 외부 기준해가 없으므로 release qualification은 부여하지 않는다.

## P10-M9 진행 기록

ADR-002 Option C-full 승인을 기록하고 QM6 계열 membrane, DKQ 호환 plate, 24×24 flat-shell 조립을 추가했다. 기존 equivalent 셸 경로는 유지하며 formulation을 명시한 경우에만 FEM을 사용한다. 전역 정적 해석, 압력하중, 응력/resultant 복원, DomainBinary 셸 배열과 modal/RSA 공용 lumped mass 조립을 연결했다. 내부 evidence 8/8은 PASS이고 artifact hash는 `ab151f4a13affa7081c48d30`이다. 다만 현재 M9d는 CPU 생성 배치의 f32 shadow qualification이므로 native WebGPU K1~K3 구현 전까지 P10-M9 전체 완료 및 release qualification은 부여하지 않는다.
