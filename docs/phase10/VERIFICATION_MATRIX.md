# Phase 10 — 검증 매트릭스

```yaml
doc: verification-matrix
phase: 10
date: 2026-07-21
record-schema: {reference, computed, relError, tolerance, modelHash, solverVersion}  # P6-M3 스키마 준수
evidence: reports/validation-evidence/phase10/
```

계층 접두어: **XV**(외부 교차검증) · **BM**(병적 모델) · **EL**(요소) · **CN**(접합·구속) · **DY**(동적) · **SH**(shell) · **LG**(하중생성).
tolerance는 [FORMULAS_AND_CRITERIA.md](FORMULAS_AND_CRITERIA.md) 해당 § / `criteria.xval.*`를 인용한다.

## M0 — 즉시 보정 (WP-00)

Evidence: [p10-m0-quick-corrections.json](../../reports/validation-evidence/phase10/p10-m0-quick-corrections.json)

| ID | 검증 | 기준 | 결과 |
| --- | --- | --- | --- |
| P10-M0-THETA-BOUNDARY | θ 4상태와 caution/require/strong 경계 `≥` | 이산값 정확 일치 | PASS — 6/6 |
| P10-M0-LEGACY-STATUS | `statusLegacy` OK/WARN/NG 매핑 | 이산값 정확 일치 | PASS — 6/6 |
| P10-M0-DESIGN-ELIGIBILITY | legacy/off REQUIRE-2ND 차단, direct 통과, direct NG 차단 | eligibility·사유코드 정확 일치 | PASS — 4/4 |
| P10-M0-RSA-ALL-RESPONSES | 변위·관성력·부재력·층 결과에 `scale_d=2` 적용 및 provenance | 상대오차 <1e-12, provenance 필수키 완비 | PASS |
| P10-M0-RSA-NO-MINIMUM | `V_min` 미지정 수치 무변화 | 최대 절대오차 <1e-15 | PASS — 0 |
| P10-M0-RSA-TOGGLE-OFF | scaling 비활성 시 trace-only·수치 무변화 | 최대 절대오차 <1e-15 | PASS |

회귀 게이트: `npm.cmd test` — PASS (레거시 및 Phase 7~10 runner, 문서 기준선 포함).

## M1 — 하네스·배터리 구현 상태 (WP-01)

Evidence: [cross-validation](../../reports/validation-evidence/phase10/p10-m1-cross-validation.json) ·
[hand-calculations](../../reports/validation-evidence/phase10/p10-m1-hand-calculations.json) ·
[pathological battery](../../reports/validation-evidence/phase10/p10-m1-pathological-battery.json)

M1 전용 게이트는 PASS(XV-01/02, BM-01~10)했다. 최종 통합 `npm.cmd test`도 2026-07-21
08:17:52.531~08:47:46.914 KST(29분 54.383초)에 종료 코드 0으로 PASS하여 P10-M1은 `complete`다.
이 완료 판정은 하네스 구현 판정이며 외부 교차검증 release 자격이 아니다.

| ID | 안전 회귀 | 결과 |
| --- | --- | --- |
| P10-M1-SOLVER-SAFETY | center/off-center diaphragm restraint, minimum-norm 물리 반력 복원, spring+explicit prescribed reaction, unresolved coupled constraint fail-closed(`UNSUPPORTED_COUPLED_DIAPHRAGM_CONSTRAINT`), cache 재분류·ID 충돌 격리 | PASS — dense/sparse |
| P10-M1-TOPOLOGY-PDELTA | memberless diaphragm master의 component topology 보존, Direct P-Delta explicit prescribed displacement 차단(`DIRECT_PDELTA_EXPLICIT_PRESCRIBED_UNSUPPORTED`) | PASS |
| P10-M1-XVAL-SNAPSHOT | executor가 artifact를 변조해도 validation 시점 snapshot으로 대조하여 forged PASS 방지(TOCTOU) | PASS |

## XV — 독립 교차검증 (WP-01, M11 release 조건)

| ID | 모델 | 기준해 소스 | 대조 응답량 |
| --- | --- | --- | --- |
| XV-01 | 2D 포털프레임 (수계산 가능) | hand-calc | 변위·반력·단부력 |
| XV-02 | 3층 대칭 3D 캔틸레버-기둥 + rigid-diaphragm 분석 하네스 | OpenSees + hand-calc | 변위·반력·기둥 단부모멘트·주기·질량참여 |
| XV-03 | 가새골조 (release·트러스 혼합) | OpenSees | 단부력·축력·반력 |
| XV-04 | 중력+횡하중 조합 (P-Delta on) | OpenSees / SAP2000 | 2차 변위·증폭·θ |
| XV-05 | RSA (설계 스펙트럼, SRSS·CQC) | ETABS / SAP2000 | 주기·질량참여·V_RSA·층전단 |
| XV-06 | 좌굴 (기둥군 + sway) | OpenSees + Euler 폐형해 | λcr 1~5모드 |
| XV-07 | 스프링지지·침하 모델 | SAP2000 | 반력·변위 |
| XV-08 | 다이어프램(강체·반강체) 건물 | ETABS | 층전단·CoM 변위 |
| XV-09 | (M2 후) 깊은 보 전단변형 | 폐형해 + SAP2000(shear def on) | 처짐·단부력 |
| XV-10 | (M9 후) 전단벽 실 shell | SAP2000/ETABS shell | drift·벽 base moment·응력 대표점 |

> 외부 solver 실행·기준값 추출은 **오너 입력물**. 저장소는 §11 artifact(JSON, modelHash 결속)로 수입해 자동 대조만 한다.
> 현재 M1 상태는 XV-01/02 hand-calc PASS, XV-03~08 `pending-reference`, XV-09/10 후속 마일스톤 대기다.
> XV-02 hand-calc는 M1 하네스 검증에는 유효하지만 M11의 외부-source 요건에는 부적격이다. 따라서
> `externallyCrossValidated=false`; XV-01~10 required-source green 및 pending 0 전까지 M11 release는 차단된다.

## BM — 병적 모델 배터리 (WP-01)

각 케이스의 pass 조건 = **정확한 사유 코드 + 위치 정보 반환** (단순 실패 아님).

| ID | 모델 | canonical 기대 결과 |
| --- | --- | --- |
| BM-01 | 지점 전무 | NO_SUPPORT |
| BM-02 | 중복 부재 (동일 절점쌍) | DUPLICATE_MEMBER + 부재 목록 |
| BM-03 | zero-length 부재 | ZERO_LENGTH_MEMBER + 부재 |
| BM-04 | 해제 조합 기구 (양단 모멘트 해제 연쇄) | MECHANISM_DOF + DOF 목록 |
| BM-05 | truss-only 절점 회전 DOF | AUTO_STABILIZED_FREE_ROTATIONS + DOF 목록 |
| BM-06 | 질량 없는 자유 DOF 모달 | MASSLESS_DOF_CONDENSED + residual domain 위치 |
| BM-07 | 극단 강성비 truss + spring 조립 구조모델 | SOLVER_CONDITION_WARN + condition estimate 약 1.333e12 + 의도된 SINGULAR |
| BM-08 | m-kN/mm-N 원본을 명시적 정규화한 두 axial truss 조립 모델 | UNIT_SYSTEM_PARITY + strain·reaction ratio 일치 + 두 unit-model 위치 |
| BM-09 | 분리 구조물 2개 | DISCONNECTED_COMPONENTS_ANALYZED + component 목록 |
| BM-10 | 극연성 spring + truss 조립 구조모델 | SOLVER_PIVOT_NEAR_SINGULAR + `B.uy`, validation WARN |

BM-07·08·10 본체는 end-to-end 조립 모델이다. BM-07은 병적 조건수에서 경고가 유실되지 않는 의도된 solver
실패를, BM-10은 해석 성공과 validation `WARN`을 검증한다. BM-08은 명시적으로 m-kN 정규화한 뒤 제품
assembly를 실행하므로 자동 단위 round-trip 지원을 뜻하지 않는다. 제품 모델 스키마는 m-kN 내부 단위를
요구하며, XV 외부값도 러너 응답 단위로 사전 정규화해야 한다. 함께 실행되는 coupled raw 2×2 dense /
sparse LDLT / CG 검사는 backend별 pivot localization을 고정하는 kernel-level 보조 회귀다.

## EL — 요소 (M2·M4·M6·M8)

| ID | 케이스 | 기준 | § |
| --- | --- | --- | --- |
| EL-T01 | Φ=0 → EB 회귀 | <1e-12 | §2 |
| EL-T02 | 깊은 단순보 중앙집중 δ=PL³/48EI+PL/4GAs | <1e-9 | §2 |
| EL-T03 | 깊은 고정단보 UDL (Φ 대칭 앵커 ±qL²/12) | <1e-9 | §2 |
| EL-T04 | Timoshenko + release 응축 조합 | <1e-8 | §2 |
| EL-O01 | r=0 오프셋 회귀 | <1e-12 | §4 |
| EL-O02 | 편심 보 N·e 결합 폐형해 | <1e-8 | §4 |
| EL-O03 | 패널존 스프링 자동부여 골조 vs 수동 스프링 등가 | <1e-9 | §4 |
| EL-P01 | 상수 프로파일 → 프리즘 회귀 | <1e-12 | §6 |
| EL-P02 | 선형 변단면 캔틸레버 폐형해 | <1e-6 | §6 |
| EL-P03 | 적분점 5→10 수렴 | <1e-8 | §6 |
| EL-W01 | (옵션별) M_cr 폐형해 / warping 캔틸레버 | <1e-6 | §8 |

## CN — 접합·구속 (M3·M5)

| ID | 케이스 | 기준 | § |
| --- | --- | --- | --- |
| CN-F01 | k_θ→∞ = 강접 | <1e-9 | §3 |
| CN-F02 | k_θ→0 = release | <1e-9 | §3 |
| CN-F03 | 단부 스프링 보 폐형해 | <1e-7 | §3 |
| CN-M01 | rigid link 2절점 = 단일절점 등가 | <1e-10 | §5 |
| CN-M02 | MPC 평형감사 (반력합=외력합) | <1e-10 | §5 |
| CN-M03 | 다이어프램 = T-행 표현 회귀 | <1e-10 | §5 |
| CN-M04 | 충돌검출 3종 (재정의·순환·지지충돌) | 코드 정확 반환 | §5 |

## DY — 동적 확장 (M7)

| ID | 케이스 | 기준 | § |
| --- | --- | --- | --- |
| DY-01 | N_G=0 prestressed = elastic 모달 | <1e-10 | §7 |
| DY-02 | 압축 중력 → 주기 증가 방향성 | 부호 검증 | §7 |
| DY-03 | 좌굴 다중모드 vs Euler 폐형해 | <1e-6 | §7 |
| DY-04 | 최저모드 vs 기존 inverse iteration | <1e-8 | §7 |
| DY-05 | 직접적분 vs 모드중첩 (선형 SDOF) | <1e-6 | §7 |
| DY-06 | 직접적분 에너지 보존 | < energyTol | §7 |

## SH — 벽·슬래브 FEM (M9 단계별, ADR-002 옵션 C)

| ID | 단계 | 케이스 | 기준 | § |
| --- | --- | --- | --- | --- |
| SH-A01 | M9a | 상수응력 membrane patch | <1e-10 | §9a |
| SH-A02 | M9a | 캔틸레버 벽 vs 보이론 δ=PH³/3EI+1.2PH/GA (메시수렴) | < shell.wallBeamTol | §9a |
| SH-A03 | M9a | 개구부 벽 평형감사 + drilling 안정화 에너지비 | §6A 규칙 | §9a |
| SH-A04 | M9a | 등가모델 대비 global drift 대조 (진단) | 보고 | §9a |
| SH-B01 | M9b | 단순지지 정사각판 UDL w_c=0.00406qa⁴/D | < shell.plateTol | §9b |
| SH-B02 | M9b | 고정단 정사각판 0.00126qa⁴/D | < shell.plateTol | §9b |
| SH-B03 | M9b | 상수 bending patch | <1e-4~1e-3 | §9b |
| SH-C01 | M9c | §6A 전체 게이트: 강체 6모드(λ비<1e-8)·locking·mesh 수렴(변위<1~5%, 응력<5~10%) | §6A | §9c |
| SH-C02 | M9c | XV-10 상용 shell 대조 | criteria.xval | §11 |
| SH-C03 | M9c | warped(비평면) patch — 사영·강체팔 보정 후 상수응력 유지 | <1e-6 | §9c |
| SH-C04 | M9c | Allman 기생모드 에너지비 | < shell.spuriousEnergyMax | §9c |
| SH-C05 | M9c | 벽-프레임 drilling 결합: 보 접합 벽 모델 vs 세분 프레임 등가 | 수렴 대조 | §9c |
| SH-G01 | M9d | CPU↔GPU 요소강성 배치 일치 (동일 SoA 입력) | 상대오차 게이트 | §9d |
| SH-G02 | M9d | CPU↔GPU 조립(CSC values)·응력 회복 일치 | 상대오차 게이트 | §9d |
| SH-G03 | M9d | 결정론: scatter 순서 독립 — 반복 실행 해시 동일 | bit-identical | §9d |
| SH-G04 | M9d | 혼합정밀도 반복개선 잔차 | < shell.gpuResidualRefine (실패 시 CPU 강등 동작 확인) | §9d |
| SH-G05 | M9d | 대형 벽식 모델 성능 예산 (생성+조립+solve, CPU 대비) | telemetry 기록 | §9d |

## LG — 하중 생성 (M10)

| ID | 케이스 | 기준 | § |
| --- | --- | --- | --- |
| LG-01 | 1방향 슬래브 분배 평형 Σ=총하중 | <1e-10 | §10 |
| LG-02 | 2방향 45° 분배 (삼각/사다리꼴) 평형 | <1e-10 | §10 |
| LG-03 | 슬래브 질량 변환 dedup (자중 중복 금지) | 규칙 검증 | §10 |
| LG-04 | 풍 층 전달 부호·방향 | 부호 검증 | §10 |
