# Phase 10 Roadmap — 마일스톤 · 수용 게이트 · 의존

```yaml
doc: roadmap
phase: 10
date: 2026-07-21
cycle: 착수 → 구현 → /code-review high → 수정 → 검증표·evidence 갱신 → merge (npm test green)
```

정준 식·임계값은 [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md)의 대응 §를 단일 출처로 인용하고,
임계값은 `analysisCriteria` config로 읽는다. 기존 자산 계승 규칙은 [README §3](README.md#3-절대-원칙--앞선-개발의-계승-위반-시-코드리뷰-반려).

## 마일스톤

| M | 이름 | WP | § | 선행 | 핵심 수용 게이트 |
| --- | --- | --- | --- | --- | --- |
| **P10-M0** | 즉시 보정 (θ 3-tier · RSA scaling 적용) | [WP-00](workpackages/WP-00-quick-corrections.md) | §1 | — | θ 4상태 분기 + REQUIRE-2ND 설계차단 배선, scaling 전 응답 적용 + provenance, 기존 292 스위트 green |
| **P10-M1** | 독립 교차검증 + 병적 모델 배터리 | [WP-01](workpackages/WP-01-cross-validation.md) | §11 | M0 | XV artifact 계약·러너, XV-01·02 hand-calc green, XV-03~08 모델·executor·`pending-reference` artifact, BM-01~10 case-specific code·behavior·location pass |
| **P10-M2** ✅ complete | Timoshenko 전단변형 | [WP-02](workpackages/WP-02-timoshenko.md) | §2 | M0, M1 | Φ=0 회귀 <1e-12, 깊은 보 폐형해 <1e-9, 독립 point/partial-UDL q0·복원·release·compute 계약 PASS — [evidence 8/8](../../reports/validation-evidence/phase10/p10-m2-timoshenko.json) · [review](reviews/P10-M2-CODE-REVIEW.md) |
| **P10-M3** ✅ complete | 부분강접 (회전스프링 단부) | [WP-03](workpackages/WP-03-partial-fixity.md) | §3 | M2 | 4축·absent/zero 계약, 안정 Schur K/f0/복구, k_θ 양극한 <1e-9, EB/Timo 폐형해 <1e-7, solver limitation/fail-closed PASS — [evidence 7/7](../../reports/validation-evidence/phase10/p10-m3-partial-fixity.json) · [review](reviews/P10-M3-CODE-REVIEW.md) |
| **P10-M4** ✅ complete | 3D 오프셋 · 삽입점 · 패널존 | [WP-04](workpackages/WP-04-offsets-panelzone.md) | §4 | M0, M1 | r=0·N·e·패널존 등가·평형잔차 모두 오차 0 — [evidence 4/4](../../reports/validation-evidence/phase10/p10-m4-offsets-panelzone.json) · [review](reviews/P10-M4-CODE-REVIEW.md) |
| **P10-M5** | 일반 MPC · rigid link | [WP-05](workpackages/WP-05-mpc-rigidlink.md) | §5 | M0, M1 | u=Tq+ubar 행 확장(신규 엔진 금지), 충돌검출 3코드, 다이어프램 회귀 <1e-10 |
| **P10-M6** | 변단면 부재 | [WP-06](workpackages/WP-06-tapered.md) | §6 | M2 | 프리즘 회귀 <1e-12, 변단면 폐형해 <1e-6, 적분 수렴 <1e-8 |
| **P10-M7** | prestressed 모달·RSA / 좌굴 다중모드 / 직접적분 THA | [WP-07](workpackages/WP-07-dynamics-extension.md) | §7 | M2, M5 | N_G=0 회귀 <1e-10, 압축→주기증가 방향성, λcr 폐형해 <1e-6, P9 eigen·P8 Newmark 재사용 |
| **P10-M8** | warping · LTB | [WP-08](workpackages/WP-08-warping-ltb.md) | §8 | M2, **ADR-001 accepted** | **complete** — 옵션 B M_cr 폐형해 <1e-6, 6DOF 불변 |
| **P10-M9** | 벽·슬래브 FEM — 2D 분해 전 단계 (M9a membrane · M9b plate · M9c flat shell · M9d GPU 배치) | [WP-09](workpackages/WP-09-shell-fem.md) | §9a~§9d | M5, **ADR-002 옵션 C-full 승인** | M9a: patch+캔틸레버 벽 보이론 · M9b: 판 폐형해 · M9c: §6A 전체+warped patch+기생모드 · M9d: CPU↔GPU 일치·혼합정밀도·성능 예산. 전 단계 SoA 배치 규약·등가모델 병행 |
| **P10-M10** | 하중 생성·전달 완성 | [WP-10](workpackages/WP-10-load-generation.md) | §10 | M0 | 슬래브 1/2방향 분배 평형 <1e-10, 질량원 통합 dedup |
| **P10-M11** | 통합·성능·release gate | [WP-11](workpackages/WP-11-integration-release.md) | 전체 | M1~M10 | XV-01~10 required-source green, `pending-reference` 0, `externallyCrossValidated=true` + 신규 기능 UI/보고/Agent 계약 전파 + 대형모델 성능 예산 + release 판정 |

## 의존 그래프

```text
M0 ──┬── M1 ──────────────┬──────────────► M11
     ├── M2 ──┬── M3      │
     │        ├── M6      │
     │        ├── M7 ◄────┤ (M5도 선행)
     │        └── M8 (ADR-001)
     ├── M4               │
     ├── M5 ──┬── M7      │
     │        └── M9 (ADR-002 오너 승인)
     └── M10
```

- **M1을 요소 확장(M2~)보다 먼저 두는 이유**: 리뷰 결론 "기능보다 검증" — 교차검증 하네스가 있어야
  이후 모든 요소 확장이 즉시 외부 기준해 회귀망에 얹힌다.
- M4/M5/M10은 M2와 독립 — 병렬 가능.
- **결정 게이트**: M8은 ADR-001 옵션 B 승인·완료. M9는 ADR-002(오너의 옵션 B 번복 승인) 전 착수 금지.

## 마일스톤 공통 게이트 (모든 M)

1. **회귀 무손상**: 기존 전체 스위트 green (착수 시점 292 + 이후 누적). Φ=0/r=0/상수 프로파일 같은
   "기능 off 극한"에서 기존 결과와 tolerance-identical.
2. **compute 계약**: 새 요소/구속이 legacy 경로에만 붙는 것 금지 — `elasticProductionAdapter`·domainBinary
   통과 + CPU reference↔backend 일치(P9 게이트 재사용). domain hash 필드 추가는 additive migration + 해시 재현성 테스트.
3. **criteria 준수**: 신규 임계값은 [Config 레지스트리](FORMULAS_AND_CRITERIA.md#config-레지스트리-phase-10-추가) 키로만.
4. **설계 게이트 연결**: 신규 결과는 designEligibility 경로 통과, 미검증 조합은 `designBlocked` + 사유 코드.
5. **한계 표기**: 근사·미지원(예: rigidFactor<1, 옵션 B LTB의 "검토 계층" 성격)은 `limitations`·UI 경고로 노출.
6. **zero-dependency**: node_modules 무증가 (Rust/WASM 자체 빌드는 P8/P9 전례 허용 범위).
7. **evidence**: `reports/validation-evidence/phase10/p10-mN-*.json` + 코드리뷰 로그를 WP Review Log에 기록.

## 테스트 네이밍

`tests/p10-m0-quick-corrections.mjs` … `tests/p10-m11-release-gate.mjs` + M1 XV 계약·러너
`tests/p10-m1-xval-*.mjs`, evidence 계약 `tests/p10-m1-evidence-contract.mjs`, BM 배터리
`tests/p10-m1-bm-battery.mjs`, solver 안전 회귀 `tests/p10-m1-solver-safety.mjs`,
topology/P-Delta 안전 회귀 `tests/p10-m1-topology-pdelta-safety.mjs`.
M3 부분강접 `tests/p10-m3-partial-fixity.mjs`, schema/DomainBinary v3 계약
`tests/p10-m3-schema-contract.mjs`, solver domain/route 계약 `tests/p10-m3-domain-route-contract.mjs`,
evidence 계약 `tests/p10-m3-evidence-contract.mjs`.
M4 3D 오프셋·패널존 `tests/p10-m4-offsets-panelzone.mjs`, schema/DomainBinary v4 계약
`tests/p10-m4-schema-domain-contract.mjs`, evidence 계약 `tests/p10-m4-evidence-contract.mjs`.
