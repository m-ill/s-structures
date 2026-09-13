# Phase 14 Reference Basis

```yaml
version: p14-reference-basis-v1
status: proposed
created_at: 2026-08-27
```

## 1. 사용 원칙

원문은 reference registry에 URL/path, 문서명, 판본, page/section, license note와 SHA-256을 기록한다. 유료·비공개 원문은 repository evidence에 복제하지 않고 승인된 locator와 hash만 보존한다.

## 2. Capability별 1차 근거

| Capability | Primary | Secondary | Cross-solver |
| --- | --- | --- | --- |
| SB7 | Timoshenko elastic-foundation continuum, CSI 1-013 | independent Hermite FE matrix | MIDAS/STRIX |
| TH1 | 동일 excitation hash의 damped SDOF exact piecewise-linear solution | independent RK4, Newmark convergence theory | MIDAS/STRIX; 공개 sample 미확보 시 blocked |
| SR2 | CSI 1-024, Peterson/Chopra modal response | independent modal-combination implementation | MIDAS/STRIX |
| SR2b | CSI 1-025, Peterson | explicit reduced 9-DOF mass/eigen model | MIDAS/STRIX |
| SB2 | NAFEMS LE1 | independent geometry/mesh/probe artifact | MIDAS/STRIX/other qualified FE |
| SB3 | Cook membrane literature convergence | independent mesh generator | MIDAS/STRIX/other qualified FE |
| SB5 | Timoshenko-Woinowsky-Krieger plate tables | independent Navier/table transcription review | MIDAS/STRIX |
| SB6 | Reissner-Mindlin/FSDT Navier solution | independent series implementation | MIDAS/STRIX |
| shell stabilization | formulation invariants, rigid/patch/modal physics | parameter sweep + energy audit | analogous only; no identical cross-solver claim |
| SP1 | CSI 1-026 moment-hinge scope, unit-load theory | independent backbone/driver model | MIDAS/STRIX where modeling-equivalent |

## 3. 현재 확보 자료

- `../STRIX-verification-21/`의 21개 상세 HTML·개별 PDF·통합 매뉴얼·교차검증 노트
- `../testreport/330357240-A-Index-Gen-MIDAS.pdf`의 MIDAS Gen Verification Examples 목차
- MIDAS 개별 example PDF·원본 model은 아직 전부 확보되지 않았다.

목차만으로 expected value를 만들지 않는다. 개별 원문과 모델이 확보되지 않으면 해당 R4 비교는 `BLOCKED`다.

## 4. 독립성 검토

- production 코드와 reference 코드가 같은 stiffness/mass/result 함수를 import하면 독립 reference가 아니다.
- 같은 JSON fixture를 공유할 수는 있지만 reference 구현이 입력을 자체 검증하고 별도 계산 경로를 가져야 한다.
- STRIX custom SH1/P3S2와 S-Structures formulation-specific 기능은 동일성보다 사양·불변식·민감도를 검증한다.
- 상용 solver comparison은 모델링 default를 끄거나 기록하지 못하면 reference eligibility를 부여하지 않는다.

## 5. M0 owner input

- 원문 판본과 허용 인용 범위
- benchmark별 tolerance 승인자
- MIDAS 제품명·버전과 export 가능 형식
- STRIX 실행본·입력 export 접근 여부
- 기관명·엔진 소유권·대외 claim 승인 범위
