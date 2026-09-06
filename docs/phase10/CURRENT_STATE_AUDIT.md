# Phase 10 — 착수 시점 현황 감사

```yaml
doc: current-state-audit
phase: 10
date: 2026-07-20
basis: 소스 직접 검토 + 대표 테스트 실행 (p6 7종 · p7-m10 · p9-m3 PASS 확인)
```

이 문서는 Phase 10 착수 근거를 **코드 사실**로 고정한다. phase6 ENGINE_ASSESSMENT와 같은 성격의 baseline이며,
구현이 진행되면 이 값들은 과거 기록으로 보존된다 (현황 단일 출처는 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)).

## 1. 보유 자산 (Phase 10이 딛고 서는 것)

| 자산 | 소스 근거 | 상태 |
| --- | --- | --- |
| 3D 프레임 선형정적 (Euler–Bernoulli 12DOF) | `solver/linear3dElement.js` `localK12` | proven, P6 회귀 green |
| sparse LDLᵀ + 특이성/기구 진단 | `solver/sparse/`, threshold 48, pivot `solver.pivotSingular` | proven |
| consistent load 8종 + q0 복원 | `loads/fixedEnd/` | proven, 분할수-독립 |
| Direct P-Delta (`Kt=Ke+KG`) | `solver/pdelta/tangentStiffness.js:50`, `secondOrder.js` | proven (단부해제 부재는 차단) |
| 공용 KG (tangent/buckling) | `solver/geometricStiffness.js` | proven, 좌굴·P-Delta 공유 |
| 모달(lumped, mass-normalized, 잔여 DOF Schur 응축)·RSA(SRSS/CQC) | `dynamics/modal.js` (`condenseToModalDofs`) | proven |
| 선형 THA (모드중첩) | `dynamics/elasticCompleteness.js` `runModalSuperpositionTha`, case kind `linearTha` | 신규 구현 완료, `p7-m10-buckling-tha-integrity` PASS |
| RSA 밑면전단 scale trace | `results/rsa/baseShearScale.js` (`scale=max(1,V_min/V_RSA)`) | 산정·차단까지 구현, **전 응답 적용 정책 미확정** |
| 지지: fixed/pin/roller/custom·6DOF 스프링·침하·강제변위 | `linear3dAssembly.js` `applyNodeSprings`, `domain/supportConstraints.js` | proven |
| 강체·반강체 다이어프램 | `semiRigidDiaphragm.js`, diaphragm 계열 | proven |
| canonical domain·element descriptor·domain hash | P8-M1 `solver/domain/` | proven, 탄성·비선형 공유 |
| compute 런타임 (CPU/WASM/WebGPU, factor session, 탄성 이관) | P9 `src/compute/`, `p9-m3-elastic-runtime` PASS | proven |
| sparse requested-mode eigen | P9-M6 `compute/eigen/requestedModes.js` | proven (동적 경로) |
| 질량원(자중 dedup)·풍 부담폭·우발편심 | `loads/loadsV2.js`, `design/accidentalEccentricity.js` | proven |
| 검증 매트릭스 + evidence 스키마 | `verification/matrix/`, `verification/evidence/validation/` | proven, 292 스위트 green |

## 2. 격차 (Phase 10 작업 대상) — 전부 소스 확인 값

### (1) θ 판정 2문턱 — M0
`solver/linear3d.js:1718` `pDeltaDesignStatus(theta, negligible, limit)`는 caution/strong 두 문턱만 분기.
config `pdelta.thetaRequire`(0.10)는 `thetaLimits.require`로 보고만 되고 상태 분기에 미사용.

### (2) RSA scaling 적용 정책 부재 — M0
`buildBaseShearScaleTrace`가 방향별 scale·NG·designBlocked까지 산정하나, 소비처는 `results/phase6M4Trace.js`(트레이스 계층).
스케일된 값을 변위·부재력·층 결과에 곱해 설계 수요로 전달하는 정책·경로가 없다.

### (3) 탄성 외부 교차검증 부재 — M1
`opensees|etabs|sap2000` 검색 결과는 `nonlinear/referenceSources.js`(문헌 참조)와 P8-M11 pilot 패키지뿐.
탄성 결과(변위·반력·단부력·주기·질량참여·V_RSA·λcr)의 외부 기준해 자동 대조 체계 없음.

### (4) 병적 모델 배터리 부분 — M1
sparse 진단(기구 DOF 리스트)·validateModel·`modeling/repair.js`는 있으나, 리뷰가 요구한 체계적 배터리
(지점 누락/중복부재/zero-length/해제 기구/truss 회전 DOF/단위계 교차/분리 구조/near-singular)를 하나의 게이트로 묶은 스위트 없음.

### (5) Timoshenko 미반영 — M2
`materials/sectionProperties.js`에 전단면적 산정법(`5A/6`, `0.9A-engineering-approximation`)이 **존재**하고
Ay/Az가 스냅샷·어댑터로 흐르지만, `localK12(E,G,A,Iy,Iz,J,L)` 시그니처에 전단항이 없다 — 순수 Euler–Bernoulli.

### (6) 부분강접 없음 — M3
단부는 이진 release(`condenseReleasedDofs`)만. 회전스프링 유한강성 단부 없음.

### (7) offset 축방향 한정 — M4
`linear3dAssembly.js:36` `member.endOffset.{i,j,rigidFactor}` — 축방향 강체 단축만, `rigidFactor=1`만 허용.
3D 편심(삽입점·보-기둥 편심접합)·패널존 강성 없음.

### (8) 일반 MPC 없음 — M5
구속은 지지 + 다이어프램뿐. `u = Tq + u_bar` 계약(P8-M1)은 존재하므로 **확장 지점은 이미 준비됨**.

### (9) 변단면 없음 — M6
프리즘 단면만. 요소 적분 인프라 없음.

### (10) prestressed 모달 없음·좌굴 최저모드 — M7
`dynamics/modal.js`는 elastic Ke 고정. 중력 Kt 모달·RSA 없음. 좌굴은 inverse iteration 최저모드 중심.
선형 직접적분 THA 없음(모드중첩만).

### (11) warping/LTB 설계 검토 — M8 완료
Cw는 단면 스냅샷에서 steel design의 폐형식 M_cr 검토로 소비된다. C1·횡지지 길이·지배 모멘트와
ratio를 제공하며 기존 6DOF는 불변이다. 7번째 DOF, warping 변위·bimoment·warping 응력은 비지원 한계로 명시한다.

### (12) 실 shell CPU 정식화·수치 정정 — M9 내부 CPU qualification 완료
ADR-002 Option C-full 승인 후 공용 6자유도 전역 조립과 `equivalent` 하위호환 경로를 유지하면서 CPU 셸 정식을
QM6-EAS membrane(중심 Jacobian 및 `detJ0/detJ` 보정), MITC4 plate, Hughes–Brezzi curl-compatible drilling,
warped 기준면 강체팔, Q4 consistent pressure로 정정했다. raw 강체모드·왜곡 membrane patch·직사각판 종횡비/두께·
메시수렴·모달·drilling·압력 평형을 포함한 내부 CPU f64 evidence 계약은 35개 record 전부 PASS를 요구한다.

M9d의 실제 구현 범위는 CPU가 미리 계산한 24×24 행렬의 f32 reconstruction, fixed-order gather, generic recovery
operator 적용이다. QM6-EAS·MITC4·drilling을 재료·기하에서 직접 만드는 formulation-native WebGPU stiffness
generation은 구현되지 않았고 qualification도 없다. 따라서 transport parity를 “native shell formulation kernel”
완료로 해석하면 안 된다.

### (13) 슬래브 하중 전달 자동화 — M10 완료
`slabPanels[]`에서 1방향 부담폭 및 2방향 45° 삼각·사다리꼴 분포하중을 생성해 fixed-end 경로로 전달한다. 보 없는 변은 벽/직접 기둥으로 분류하고, 패널 평형·질량원 dedup·풍상/풍하 기하 trace까지 LG-01~04에서 검증했다. 외부 교차검증과 제품 표면 통합은 M11 release gate에 남는다.

## 3. 리스크 메모

- **M9(shell)의 내부 CPU 요소 수치 결함은 정식 교체와 35-record 계약으로 닫았지만 release-qualified는 아니다.**
  요소/커널 qualification은 사용자 모델의 메시 적절성을 증명하지 않으므로 현재 모든 FEM 셸 결과의 설계 전이는
  `SHELL_MODEL_MESH_CONVERGENCE_REQUIRED`로 차단한다. warning-warped 요소에는 별도 공학검토도 필요하다.
  XV-10 외부 검증과 formulation-native WebGPU 구현·실장치 qualification은 M11에서 계속 요구한다.
- M2(Timoshenko)는 강성·고정단력·복원·KG·응축 5개 지점을 동시에 건드린다 — Φ=0 극한에서 기존 결과와 bit-identical이 아닌 **tolerance-identical** 회귀 기준을 명시해야 한다(부동소수 재배열).
- 현재 셸 WebGPU는 precomputed transport 계층뿐이다. formulation-native 생성이 추가되기 전까지 CPU f64가
  유일한 셸 정식 owner이며 GPU 자동 설계 라우팅을 허용하지 않는다.
