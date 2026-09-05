# Phase 10 — 탄성해석 실무 완성 (Elastic Production Completion)

```yaml
doc: readme
phase: 10
date: 2026-07-23
status: implementation-complete, release-blocked
owner-inputs-required: [XV-02~10 required-source 외부 기준해, 실제 formulation-native WebGPU 장치 qualification]
```

## 1. 목표

외부 기술 리뷰(2026-07-13)가 짚은 탄성해석의 잔여 격차를 **전부** 구현·검증하여, 제품 표현을
"3D 건축 프레임 전역 탄성해석 엔진"에서 **"실무 검증 완료된 건축 구조 탄성해석 엔진"**으로 승격한다.

리뷰 결론의 4단계 완료 판정 기준으로: 현재 ①(해석수학 코어)·②(3D 프레임 기능) 대부분 달성 상태에서,
Phase 10은 **② 잔여(모델링 세부) + ③(실무 검증) + ④(요소·shell·동적 확장)** 전체를 범위로 한다.

## 2. 범위 (리뷰 지적 → 마일스톤 매핑)

| 리뷰 지적 | 현재 상태 (2026-07-21 코드 검증) | Phase 10 |
| --- | --- | --- |
| θ 0.05~0.10 중간구간 판정 | `pDeltaDesignStatus` 2문턱만 분기 | **M0** |
| RSA 밑면전단 scaling 전 응답 적용 | trace 산정까지, 적용 정책 미확정 | **M0** |
| 독립 solver 교차검증 | M1 하네스·XV-01/02 hand-calc 기준해 PASS, 외부 기준해 미수입 | **M1**, release는 **M11** |
| 병적 모델 방어 배터리 | BM-01~10 product fixture PASS(명시적 단위 정규화·보조 kernel 회귀 한계 명시) | **M1** |
| Timoshenko 전단변형 | `sectionProperties`에 전단면적만, 강성 미반영 | **M2** |
| 부분강접(회전스프링 단부) | 이진 release만 | **M3** |
| 단부 offset 3D·편심접합·삽입점·패널존 | 축방향 강체 offset(rigidFactor=1)만 | **M4** |
| 일반 MPC·rigid link·master-slave | 다이어프램 구속만 | **M5** |
| 변단면(비프리즘) 부재 | 프리즘만 | **M6** |
| prestressed 모달/RSA·좌굴 다중모드 | elastic Ke만, 좌굴 최저모드 중심 | **M7** |
| warping torsion·정밀 LTB | ADR-001 옵션 B: Cw 기반 M_cr 설계 검토 완료, 6DOF 불변 | **M8 complete** |
| 실제 shell FEM | QM6-EAS·MITC4·curl drilling CPU f64 내부 qualification PASS, 사용자 모델 메시수렴 설계 전이 차단 | **M9 implementation complete / release blocked** |
| 하중 생성·전달 완성 | 1/2방향 슬래브 분배·평형·질량 dedup·풍 기하 trace 완료 | **M10 complete** |
| 통합·성능·release | 제품 계약·기능 토글·120-shell 성능·fail-closed gate 완료; 외부 XV/WebGPU 자격 대기 | **M11 implementation complete / release blocked** |

## 3. 절대 원칙 — 앞선 개발의 계승 (위반 시 코드리뷰 반려)

Phase 10의 모든 작업은 **기존 자산의 확장**이며 재작성이 아니다. 아래 계승표는 각 WP 문서가 인용해야 하는 단일 기준이다.

| 계승 자산 | 출처 | Phase 10 규칙 |
| --- | --- | --- |
| 부호규약 (축력 인장 양수) | `core/signConvention.js`, [phase6 FORMULAS §0](../phase6/FORMULAS_AND_CRITERIA.md) | 모든 신규 식(Timoshenko KG, warping, shell 초기응력 포함) 동일 규약. `Kt=Ke+Kg(N)` 유지 |
| 임계값 config | `core/analysisCriteria.js` (`resolveCriterion`) | 신규 임계값 전부 `analysisCriteria` 키로. 하드코딩 PR 반려. 신규 키는 [FORMULAS_AND_CRITERIA.md Config 레지스트리](FORMULAS_AND_CRITERIA.md#config-레지스트리-phase-10-추가) |
| canonical domain·구속 계약 | P8-M1 `solver/domain/` (`u = Tq + u_bar`, element descriptor, domain hash) | MPC/rigid link(M5)·offset(M4)은 이 계약의 **확장**. 별도 구속 시스템 신설 금지. descriptor/hash 필드 추가는 additive migration |
| compute 런타임 | P9 `src/compute/` (domainBinary·executionPlan·factorSession·WebGPU/WASM backend) | 신규 요소 강성(M2/M4/M6/M8/M9)은 `elasticProductionAdapter`·domainBinary 계약을 통과해야 함. CPU reference ↔ backend 일치 게이트(P9 방식) 재사용 |
| 공용 기하강성 | `solver/geometricStiffness.js` (`mode: tangent\|buckling`) | Timoshenko·변단면·warping KG는 이 모듈 확장. 좌굴/P-Delta 중복 조립 금지 |
| sparse eigen | P9-M6 `compute/eigen/requestedModes.js` | prestressed 모달·좌굴 다중모드(M7)는 이 solver 재사용. dense Jacobi 신규 사용 금지 |
| fixed-end 하중 라이브러리 | P6-M2 `loads/fixedEnd/` | Timoshenko(M2)·변단면(M6)·offset(M4)은 강성만 아니라 **q0/복원함수도 함께** 갱신. 분할수-독립 게이트 유지 |
| 설계 적격성 게이트 | `linear3d.js` designEligibility, combination completeness | 신규 결과 전부 동일 게이트 경유. 미검증 경로는 `designBlocked` + 사유 코드 |
| Newmark 시간적분 | P8 `nonlinear/dynamics/` · P9 resident session | 선형 직접적분 THA(M7 부속)는 이 적분기 재사용 (선형 요소 + 상수 K) |
| 검증 체계 | P6-M3 `verification/matrix/` + evidence artifacts (`verification/evidence/validation/`) | 신규 케이스는 기존 record 스키마({reference, computed, relError, tolerance, modelHash, solverVersion}) 준수 |
| 등가셸 scope 경고 | P6-M6 옵션 B | 등가 경로는 영구 유지. 실 shell도 사용자 모델 메시수렴 provenance와 warning-warped 공학검토 없이는 설계 전이 차단 |
| 테스트·머지 규칙 | `npm test` green(착수 기준선 292 스위트), `p10-mN-*.mjs` 네이밍, `/code-review high` 사이클 | 전 마일스톤 공통 |

## 4. 문서 맵

| 문서 | 내용 |
| --- | --- |
| [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md) | 착수 시점 코드 검증 스냅샷 (격차의 소스 근거) |
| [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md) | 정준 식·판정 기준·config 키 (WP 공통 단일 출처) |
| [ROADMAP.md](ROADMAP.md) | 마일스톤 M0~M11, 수용 게이트, 의존, 리뷰 체크포인트 |
| [VERIFICATION_MATRIX.md](VERIFICATION_MATRIX.md) | 검증 케이스 계층(XV/BM/EL/CN/DY/SH/LG)과 tolerance |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | 마일스톤 상태 추적 (구현 진행하며 갱신) |
| [workpackages/WP-00~WP-11](workpackages/) | 마일스톤별 작업 명세 |
| [adr/ADR-001](adr/ADR-001-WARPING-LTB-SCOPE.md) | warping/LTB 구현 방식 결정 |
| [adr/ADR-002](adr/ADR-002-SHELL-FEM-OPTION-B-REVERSAL.md) | shell 옵션 C-full 승인 기록, 등가 경로 병행 및 현재 qualification 범위 |

## 5. 진행 규칙

각 마일스톤은 phase6 이후의 공통 사이클을 따른다:
**착수 → 구현(마이크로 모듈, 단일책임) → `/code-review high` → 수정 → 검증표·evidence 갱신 → merge(npm test green)**.
이전 게이트 미통과 시 다음 마일스톤 착수 금지. 상태 변경은 코드·테스트·evidence·코드리뷰 완료 후에만 `complete`.

P10-M0~M11 구현은 전용 게이트, evidence와 코드리뷰를 통과해 모두 `complete`다.
다만 XV-02~10의 required-source 외부 기준해 요건이 충족되지 않았고 formulation-native WebGPU 장치
qualification도 남았으므로 제품의 `externally-cross-validated` 배지는
`false`이며 M11 release gate는 차단 상태다.
