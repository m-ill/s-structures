# WP-02 — P17-M2 SB1 Euler–Bernoulli 외팔보

## 1. 현재 상태

`CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL / BLOCKED_PRE_EXECUTION`

SB1의 원자료, 독립 기준식, 기준값, 허용오차 제안, 결과 probe, canonical/native model, model equivalence와 제품 build hash를 P17-M2 overlay R1로 고정했다. 공식 해석과 벤치마크 실행은 0회이며 PASS/FAIL 판정은 없다.

## 2. 모델 계약

- 형상: N1 `(0,0,0)`에서 N2 `(3,0,0)`까지 global +X 방향 3.0 m frame 1개
- 단면: 300×500 mm, `A=0.15 m²`, `Iy=0.001125 m⁴`, strong `Iz=0.003125 m⁴`
- 재료: `E=26,700 MPa`, `ν=0.2`, `G=11,125 MPa`
- 경계: N1 6DOF 고정, N2 자유
- 하중: N2 global -Z 방향 1 kN, self-weight off
- 해석: linear static, Euler–Bernoulli, shear deformation off, geometric stiffness off
- 제품 경로: `src/index.js` 공개 API → product analysis service → 자체 3D frame solver

## 3. 독립 기준과 probe

| 응답 | 독립 full-precision 기준 | 제품 단위 | JSON Pointer |
| --- | ---: | --- | --- |
| N2 `uz` | `-0.00010786516853932584` | m | `/result/payload/byCombo/D_ONLY/disp/N2/2` |
| N2 `ry` | `5.393258426966292e-5` | rad | `/result/payload/byCombo/D_ONLY/disp/N2/4` |
| N1 `Rz` | `1` | kN | `/result/payload/byCombo/D_ONLY/reactions/N1/rz` |
| N1 `My` | `-3` | kN-m | `/result/payload/byCombo/D_ONLY/reactions/N1/rmy` |

독립식은 `uz=-PL³/(3EI)`, `ry=+PL²/(2EI)`, `Rz=+P`, `My=-PL`이다. 제안 허용오차는 네 mandatory metric 모두 signed-relative `0.01%`와 near-zero absolute tolerance를 함께 사용한다. 외부 수치검토 승인 전에는 공식 판정에 쓰지 않는다.

## 4. 구현 및 증거 경로

- milestone overlay: `verification/benchmarks/strix21/milestones/P17-M2/SB1/`
- package: `m2-case-package-r1.json`
- gate: `gates/gate-assessment-r1.json`
- trust template: `verification/benchmarks/strix21/trust/external-custodian-trust-registry.json`
- orchestration: `verification/milestones/phase17/m2/framework/officialExecutionOrchestrator.mjs`
- physics/mutation contract: `verification/milestones/phase17/m2/framework/sb1Qualification.mjs`
- readiness report: `output/verification/phase17/P17-M2-SB1-READINESS-REPORT-R1.pdf`
- closure: `verification/evidence/validation/phase17/p17-m2-sb1-readiness-closure-r1.json`

## 5. 실행 전 8개 gate

| Gate | 준비 | 종결 증거 |
| --- | --- | --- |
| official orchestrator/receipt | READY | PENDING |
| pinned external custodian registry | BLOCKED | BLOCKED |
| source byte audit | READY | PASS |
| extraction/comparison replay | READY | PENDING |
| physics/mutation replay | READY | PENDING |
| 서로 다른 external custody run 3회 | BLOCKED | BLOCKED |
| deterministic PDF/visual parity | READY | PENDING |
| scoped reviewer attestations | BLOCKED | BLOCKED |

현재 준비 `5/8`, 종결 증거 `1/8`이다. source만 `APPROVED`이고 나머지 일곱 lock은 `CONTENT_LOCKED_PENDING_EXTERNAL_APPROVAL`이다.

## 6. 외부 승인 후 실행 순서

1. 외부 authority가 5개 고유 역할/principal과 Ed25519 공개키를 registry에 제공한다.
2. registry SHA-256을 별도 채널로 전달하고 `P17_EXTERNAL_CUSTODIAN_REGISTRY_SHA256` pin과 대조한다.
3. reference/model/numerical/release reviewer가 artifact scope별 서명을 제공한다.
4. 8개 lock을 `APPROVED`로 전환하고 execution intent를 생성한다.
5. 공개 제품 API로 서로 다른 외부 custody run을 3회 수행한다.
6. signed response, equilibrium, energy, 1/2/4/8 subdivision, load reversal, deterministic replay를 판정한다.
7. 실제 모델/결과 화면을 Chrome에서 캡처하고 raw-content hash와 시각 parity를 검증한다.
8. 사례 terminal report와 release reviewer attestation으로 SB1을 닫는다.

## 7. 무효화와 rollback

다음 변경은 기존 lock을 재사용하지 않고 새 revision을 요구한다: geometry, material/section, axis routing, load/support, solver setting, probe, tolerance, reference, 제품 source/build, renderer 또는 trust registry. 결과를 본 뒤 tolerance·mesh·probe를 바꾸면 해당 run은 qualification에서 제외한다.

## 8. 완료 정의

SB1 완료는 8/8 readiness, 8/8 terminal evidence, 서로 다른 외부 custody 공식 run 3회 이상, solver/benchmark execution 3회 이상, 4개 mandatory metric 및 물리·mutation gate 통과, 화면/JSON/PDF hash chain, 독립 release reviewer 서명을 모두 요구한다.
