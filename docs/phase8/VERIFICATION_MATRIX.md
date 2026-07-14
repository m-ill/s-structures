# Phase 8 Verification Matrix

```yaml
status: active-m0-through-m4-verified
evidence_root: reports/validation-evidence/phase8
runner: npm.cmd run test:p8
rule: implementation existence and regression stability are not qualification evidence
```

## 1. 검증 등급

| 등급 | 의미 |
| --- | --- |
| L0 | schema, contract, migration |
| L1 | 수학·재료·단면 unit test |
| L2 | 요소·제어 component test |
| L3 | 전역 solver benchmark |
| L4 | 모델 기능 통합과 UI/API workflow |
| L5 | 독립 solver/published benchmark 및 pilot |

`verified`에는 해당 기능의 L1~L4 필수항목과 지정된 L5 항목이 모두 필요하다.

## 2. 기준값 정책

허용되는 reference:

- 손으로 유도 가능한 closed-form solution
- analytical tangent의 독립 finite-difference/Jacobian 비교
- 코드 경로를 공유하지 않는 별도 reference implementation
- 입력과 결과가 고정된 published benchmark
- 보존법칙, objectivity, 평형, 에너지 같은 물리 invariant
- 승인된 외부 해석기의 버전 고정 결과와 입력 파일

qualification에 허용되지 않는 reference:

- 현재 함수가 만든 값을 expected로 다시 전달
- 현재 결과를 frozen baseline으로 저장한 값만 비교
- 미리 만든 정답 경로에 제약식을 대입
- 같은 helper를 actual과 expected 양쪽에서 공유
- 화면에 차트가 그려졌다는 사실만 확인

회귀 baseline은 계속 사용할 수 있으나 evidence의 `referenceType`은 `regression-only`이며 `verified` 판정에는 포함하지 않는다.

## 3. 허용오차 원칙

기본 비교식은 다음과 같다.

```text
error <= absTol + relTol * referenceScale
```

- 행렬/벡터 norm 종류와 scale을 evidence에 기록한다.
- 힘·길이·모멘트·에너지의 absolute tolerance는 model unit에 맞게 환산한다.
- 0 근처 비교는 relative tolerance만 사용하지 않는다.
- tangent finite-difference는 smooth branch에서 기본 relative `1e-5` 이하를 목표로 한다.
- 선형극한과 전역평형은 기본 relative `1e-7`~`1e-8`을 목표로 하되 solver/backend별 근거를 기록한다.
- published nonlinear benchmark는 discretization에 따라 1~3% 범위를 기본으로 하고 각 case에서 별도 확정한다.
- time-step/mesh convergence는 한 번의 기준값 일치보다 refinement trend를 함께 검사한다.

최종 수치는 P8-M0에서 단위계와 reference fixture를 고정하며 임의로 완화하려면 검토 기록이 필요하다.

## 4. Evidence schema

```json
{
  "id": "NL-EQ-05",
  "status": "pass | fail | blocked",
  "qualificationImpact": "required | advisory | regression-only",
  "referenceType": "closed-form | finite-difference | independent | published | invariant | workflow",
  "reference": { "source": "...", "version": "...", "hash": "..." },
  "model": { "id": "...", "hash": "...", "units": "..." },
  "engine": { "id": "...", "version": "..." },
  "settings": {},
  "actual": {},
  "expected": {},
  "tolerance": { "abs": 0, "rel": 0, "norm": "..." },
  "runtime": {},
  "artifacts": [],
  "verifiedAt": "ISO-8601"
}
```

## 5. Governance와 status

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-GOV-01 | legacy Pushover 자격 | 항상 `legacy-preliminary`, `designBlocked=true` | L0/L4 |
| NL-GOV-02 | legacy SDOF NLTH 자격 | model-bound frame NLTH로 표시되지 않음 | L0/L4 |
| NL-GOV-03 | engine ID 전달 | UI/API/report/run record의 engine ID 일치 | L4 |
| NL-GOV-04 | case migration | 기존 case 수치·설정 보존, 새 engine으로 자동승격 없음 | L0 |
| NL-GOV-05 | no silent fallback | 새 solver 실패/미지원 시 legacy 결과 자동반환 금지 | L3/L4 |
| NL-GOV-06 | evidence gate | required evidence 누락 시 `verified` 저장 불가 | L0/L4 |

## 6. Domain과 상태

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-DOM-01 | domain hash 재현 | 같은 입력의 hash와 정렬 순서 동일 | L1 |
| NL-DOM-02 | 원본 model 불변 | build/run 전후 deep hash 동일 | L1 |
| NL-DOM-03 | DOF map | node/component와 full/reduced DOF 역매핑 일치 | L1 |
| NL-DOM-04 | rigid diaphragm transform | 강체운동 호환, `T^TKT` 독립 조립과 일치 | L2 |
| NL-DOM-05 | support/settlement | constraint와 `u_bar`가 지정 변위를 정확히 재현 | L2 |
| NL-DOM-06 | generated origin map | 결과가 원본 객체로 손실 없이 역추적 | L2/L4 |
| NL-DOM-07 | unsupported scan | 미지원 feature가 조립 전에 동일 code로 차단 | L1/L4 |
| NL-DOM-08 | load/mass snapshot | model 입력과 domain 합계·단위·부호 일치 | L2 |
| NL-STATE-01 | deep isolation | trial 변경이 committed/nested state에 영향 없음 | L1 |
| NL-STATE-02 | atomic commit | accepted step의 모든 전역·요소상태가 함께 교체 | L1 |
| NL-STATE-03 | rollback | 실패 전후 committed snapshot byte-equivalent | L1/L3 |
| NL-STATE-04 | line-search branch | reject 후보가 선택 후보 history를 변경하지 않음 | L2 |
| NL-STATE-05 | cutback | 원 증분 실패 후 분할해도 원 상태에서 다시 시작 | L3 |
| NL-STATE-06 | checkpoint/restart | 연속실행과 restart 결과·event sequence 일치 | L3 |
| NL-STATE-07 | dynamic state | `u,v,a,material,energy` commit/rollback 동시성 보장 | L3 |

## 6.1 모델링·탄성·비선형 통합

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-MEI-01 | schema v4→v5 migration | node/member/material/section/load/case 손실 0, legacy 결과 자동승격 없음 | L0/L4 |
| NL-MEI-02 | topology identity | 같은 model의 linear/P-Delta/modal/nonlinear node·element connectivity hash 일치 | L2/L4 |
| NL-MEI-03 | property identity | material/section/modifier snapshot hash와 실제 solver 입력 일치 | L2/L4 |
| NL-MEI-04 | constraint identity | support/diaphragm/release/offset DOF map이 solver adapter 간 일치 | L2/L4 |
| NL-MEI-05 | local-axis identity | viewport, elastic member result, hinge/fiber/result의 y/z 축 일치 | L3/L4 |
| NL-MEI-06 | material source | elastic E/G/rho와 nonlinear parameter가 같은 material/source snapshot 참조 | L1/L4 |
| NL-MEI-07 | section source | elastic A/I/J와 fiber area/centroid/inertia가 같은 geometry에서 파생 | L1/L4 |
| NL-MEI-08 | generated origin | semi-rigid/shell-equivalent generated object와 원본 result mapping 일치 | L3/L4 |
| NL-MEI-09 | load entity separation | load case/combo/analysis case가 섞이지 않고 factor·purpose 보존 | L0/L4 |
| NL-MEI-10 | self-weight ownership | elastic/gravity/nonlinear preload에서 동일 physical self weight 중복 0 | L3 |
| NL-MEI-11 | mass-source ownership | self/member/node/load-derived mass 합과 deduplication trace 일치 | L2/L4 |
| NL-MEI-12 | gravity predecessor | accepted nonlinear gravity run record만 Pushover/NLTH 초기상태로 사용 | L3/L4 |
| NL-MEI-13 | linear initial guess | 선형 결과는 guess로만 사용되고 material state 자동 commit 없음 | L3 |
| NL-MEI-14 | verified linear import | hash/equilibrium/admissible-state gate를 모두 통과한 경우만 import | L3/L4 |
| NL-MEI-15 | case dependency DAG | cycle, failed/stale predecessor, mismatched domain을 차단 | L1/L4 |
| NL-MEI-16 | granular stale | 변경 hash에 영향받는 case/state/cache/result만 정확히 stale | L1/L4 |
| NL-MEI-17 | run-record provenance | dependency run IDs, domain hashes, solver/backend/source 완전성 | L4 |
| NL-MEI-18 | result ID continuity | modeling selection과 elastic/nonlinear result object ID·location 일치 | L4 |
| NL-MEI-19 | result dimensions | velocity/curvature/strain/stress/energy의 internal/display unit 변환 일치 | L1/L4 |
| NL-MEI-20 | design-transfer guard | stale/failed/preliminary/domain-mismatch result 전달 0 | L4/L5 |

## 7. 전역 평형과 수치제어

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-EQ-01 | 1DOF 선형극한 | closed-form 변위·반력 일치 | L2 |
| NL-EQ-02 | MDOF 선형극한 | Phase 7 정적 결과와 norm 오차 기준 충족 | L3 |
| NL-EQ-03 | scalar nonlinear spring | 알려진 평형근과 iteration trace 일치 | L2 |
| NL-EQ-04 | coupled MDOF nonlinear | 독립 dense reference와 해·잔차 일치 | L3 |
| NL-EQ-05 | analytical tangent | finite-difference Jacobian relative error 기준 충족 | L2/L3 |
| NL-EQ-06 | 반복별 재조립 | 상태변화 반복마다 `Pint`와 `Kt` evaluation count 증가 | L2 |
| NL-EQ-07 | 전역 평형 | 외력-내력-반력 force/moment residual 기준 충족 | L3 |
| NL-EQ-08 | constraint 평형 | full/reduced solve의 독립 해가 일치 | L3 |
| NL-EQ-09 | member load | 고정단력 포함 외력과 요소단력 closure 만족 | L3 |
| NL-EQ-10 | singular tangent | 명시적 failure code, 정상 결과 미생성 | L2 |
| NL-EQ-11 | indefinite tangent | pivoted backend 선택 및 residual 수렴 | L3 |
| NL-EQ-12 | 취소·determinism | 취소 시 uncommitted 폐기, 재실행 결과 동일 | L3/L4 |
| NL-CTRL-01 | MDOF load control | lambda increment와 평형해 일치 | L3 |
| NL-CTRL-02 | line search | 선택 alpha가 residual 감소, 후보상태 오염 없음 | L2/L3 |
| NL-CTRL-03 | 수렴 scale | 단위/하중 크기 변경에도 동등한 판정 | L2 |
| NL-CTRL-04 | adaptive cutback | 실패 증분 rollback·분할·재수렴 또는 명시 종료 | L3 |
| NL-CTRL-05 | SDOF displacement control | target displacement와 solved lambda 일치 | L2 |
| NL-CTRL-06 | MDOF displacement control | augmented reference solve와 일치 | L3 |
| NL-CTRL-07 | constrained control DOF | diaphragm/reduced coordinate에서 물리 target 만족 | L3 |
| NL-CTRL-08 | target/cutback | event 근처 overshoot 제한, min step에서 명시 종료 | L3 |

## 8. 3D corotational 요소

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-COR-01 | 작은변위 frame | 선형 `localK12` 변환 결과와 일치 | L2 |
| NL-COR-02 | 강체병진 | 변형·내력·에너지 0 기준 | L2 |
| NL-COR-03 | 임의축 강체회전 | objectivity residual 기준 충족 | L2 |
| NL-COR-04 | 요소 일관접선 | finite-difference global tangent 일치 | L2 |
| NL-COR-05 | 축변형 | bar closed-form force/energy 일치 | L2 |
| NL-COR-06 | 비틀림 | torsion closed-form와 local/global 부호 일치 | L2 |
| NL-COR-07 | 2축 휨 | y/z cantilever 각각 이론해 일치 | L2 |
| NL-COR-08 | Euler beam-column | 하중-변위 및 임계 접근 trend 일치 | L3/L5 |
| NL-COR-09 | 대변위 cantilever | published/independent elastica 응답 기준 충족 | L3/L5 |
| NL-COR-10 | 3D skew frame | 독립 solver의 nodal/member response 일치 | L3/L5 |
| NL-COR-11 | release | 해제축 단력 0과 회전호환, 평형 만족 | L3 |
| NL-COR-12 | rigid offset | 강체팔 kinematics와 force/moment transfer 일치 | L3 |

## 9. 집중소성 힌지

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-HNG-01 | A-B-C-D-E envelope | 각 점과 segment moment 정확히 일치 | L1 |
| NL-HNG-02 | segment tangent | smooth 구간 finite-difference 일치 | L1 |
| NL-HNG-03 | +/- 비대칭 | 방향별 backbone과 event 독립 적용 | L1 |
| NL-HNG-04 | unloading/reloading | 지정 protocol의 교점·잔류회전 일치 | L2 |
| NL-HNG-05 | 소산에너지 | loop 수치적분과 state energy 일치 | L2 |
| NL-HNG-06 | degradation | cycle별 strength/stiffness rule 재현 | L2 |
| NL-HNG-07 | beam-spring 직렬 | closed-form 회전분담과 end moment 일치 | L2/L3 |
| NL-HNG-08 | y/z 축 독립 | 한 축 항복이 다른 축을 임의 저감하지 않음 | L2 |
| NL-HNG-09 | i/j 단부 독립 | 단부별 rotation/state/event 구분 | L2 |
| NL-HNG-10 | rollback | reject/cutback 후 history와 energy 복원 | L2/L3 |
| NL-HNG-11 | zero/negative tangent | regularization 정책과 solver 진단 일치 | L3 |
| NL-HNG-12 | assignment provenance | axis, capacity, source, assumption, override 추적 | L1/L4 |

## 10. Pushover

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-PUSH-01 | gravity preload | 지정 조합 lambda=1 수렴 후 상태 commit | L3 |
| NL-PUSH-02 | load pattern 합계 | 방향·부호·층분포·reference shear 일치 | L2 |
| NL-PUSH-03 | modal/user pattern | source vector와 실제 nodal load 일치 | L2/L4 |
| NL-PUSH-04 | control target | accepted step의 물리변위가 target 만족 | L3 |
| NL-PUSH-05 | step equilibrium | 모든 accepted step의 잔차 기준 충족 | L3 |
| NL-PUSH-06 | base shear | 반력합과 적용 횡하중 합 일치 | L3 |
| NL-PUSH-07 | capacity curve | 실제 accepted state만 포함, failed trial 제외 | L3 |
| NL-PUSH-08 | story response | 층전단·drift·torsion 합계와 nodal 결과 일치 | L3 |
| NL-PUSH-09 | hinge event | first yield/capping 시점이 state transition과 일치 | L3 |
| NL-PUSH-10 | portal mechanism | closed-form/independent collapse sequence와 일치 | L3/L5 |
| NL-PUSH-11 | multistory frame | 독립 solver capacity/hinge sequence 기준 충족 | L5 |
| NL-PUSH-12 | 종료사유 | target/mechanism/nonconvergence/instability 정확 분류 | L3 |
| NL-PUSH-13 | post-peak handoff | displacement-control와 arc-length 연속성 만족 | L3 |
| NL-PUSH-14 | provenance | gravity/pattern/control/hinge/solver hash 완전성 | L4 |

## 11. Fiber와 PMM

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-FIB-01 | fiber 면적·도심 | analytic section geometry와 일치 | L1 |
| NL-FIB-02 | `Iy/Iz/Iyz` | analytic section property와 mesh 수렴 | L1 |
| NL-FIB-03 | steel mesh | H/BOX/PIPE flange/web/corner 누락 없음 | L1 |
| NL-FIB-04 | RC mesh | cover/core/bar 좌표·면적·재료 합계 일치 | L1 |
| NL-FIB-05 | material monotonic | 지정 stress-strain curve와 tangent 일치 | L1 |
| NL-FIB-06 | material cyclic | reversal/history/energy reference protocol 일치 | L2 |
| NL-FIB-07 | section force | 직접합과 `N,My,Mz` 및 sign 일치 | L1 |
| NL-FIB-08 | section tangent | 3x3 finite-difference tangent 일치 | L2 |
| NL-FIB-09 | 목표 축력 평형 | solved `epsilon0`의 axial residual 기준 충족 | L2 |
| NL-FIB-10 | steel M-phi | independent/published curve와 기준 충족 | L2/L5 |
| NL-FIB-11 | RC M-phi | 지정 axial ratio별 independent curve와 일치 | L2/L5 |
| NL-FIB-12 | biaxial curvature | 회전축 변환과 coupled response 일치 | L2/L5 |
| NL-FIB-13 | state/energy | commit/rollback과 section energy 일치 | L2/L3 |
| NL-FIB-14 | element integration | integration-point refinement response 수렴 | L3/L5 |
| NL-PMM-01 | uniaxial axes | P-My와 P-Mz 절편 기준값 일치 | L2 |
| NL-PMM-02 | pure axial | tension/compression capacity와 sign 일치 | L2 |
| NL-PMM-03 | pure bending | zero-P axis capacities와 section solve 일치 | L2 |
| NL-PMM-04 | biaxial surface | selected grid가 independent section solve와 일치 | L2/L5 |
| NL-PMM-05 | interpolation | node exactness, continuity, bounds 만족 | L1 |
| NL-PMM-06 | convexity/sign | invalid surface가 validation에서 차단 | L1 |
| NL-PMM-07 | out-of-range | clamp 없이 blocked와 사유 반환 | L1/L4 |
| NL-PMM-08 | hinge coupling | axial 변화 시 moment capacity/tangent가 같은 반복에서 갱신 | L3 |
| NL-PMM-09 | cold runtime | RC 400x600 기준 fixture가 격리 process에서 60초 이내 PMM 생성 | L3 |
| NL-PMM-10 | cache/dedup | normalized key, memory/persistent hit, 동일 source member dedup 일치 | L2/L3 |
| NL-PMM-11 | deterministic artifact | memoization on/off numerical surface·hash·progress 순서 일치 | L2 |
| NL-PMM-12 | Worker/cancel | 실제 Worker 실행, progress, 취소 시 uncommitted artifact 미저장 | L3/L4 |
| NL-PMM-13 | content stale protection | 재료·단면·철근·수치옵션 변경은 miss, 무관 source는 재사용 | L2/L3 |
| NL-PMM-14 | full/envelope parity | steel·대칭/비대칭 RC section, root, PMM 수치가 tolerance 이내 일치 | L2/L5 |

## 12. Arc-length와 cyclic static

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-ARC-01 | predictor | 초기 tangent 방향과 arc radius 만족 | L2 |
| NL-ARC-02 | corrector | 평형잔차와 구면제약 동시 수렴 | L3 |
| NL-ARC-03 | branch sign | 이전 increment와 연속인 root 선택 | L2/L3 |
| NL-ARC-04 | limit point | peak에서 load increment 부호전환 추적 | L3 |
| NL-ARC-05 | snap-through | hard-coded path 없이 benchmark 경로 산출 | L3/L5 |
| NL-ARC-06 | snap-back | 선택 benchmark의 후퇴변위 경로 추적 | L3/L5 |
| NL-ARC-07 | radius adaptation | 반복 수 기준 증가/감소와 bounds 준수 | L2 |
| NL-ARC-08 | indefinite solve | augmented residual 수렴과 pivot trace 존재 | L3 |
| NL-ARC-09 | rollback/restart | failed branch 오염 없음, checkpoint 재현 | L3 |
| NL-ARC-10 | control handoff | displacement-control state와 연속 | L3 |
| NL-CYC-01 | target history | 각 reversal target 도달 | L3 |
| NL-CYC-02 | reversal event | 방향변경과 material event 일치 | L2/L3 |
| NL-CYC-03 | residual deformation | 독립 spring/frame reference와 일치 | L3 |
| NL-CYC-04 | loop energy | 외력일과 소산/저장에너지 balance | L3 |
| NL-CYC-05 | degradation history | cycle별 peak와 stiffness trend 일치 | L3 |
| NL-CYC-06 | deterministic restart | 중간 restart와 연속 protocol 일치 | L3 |

## 13. MDOF NLTH

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-DYN-01 | mass assembly | nodal/member mass 합과 `M` symmetry/positive mass 일치 | L2 |
| NL-DYN-02 | diaphragm mass | reduced mass와 translational/rotational inertia 일치 | L3 |
| NL-DYN-03 | influence vector | 방향별 uniform excitation DOF와 sign 일치 | L2 |
| NL-DYN-04 | record parser | dt/unit/point count/invalid token 검증 | L1/L4 |
| NL-DYN-05 | scaling | 목표 PGA와 실제 scaled PGA 일치, spectrum match 오표기 없음 | L1 |
| NL-DYN-06 | Rayleigh damping | 두 target mode damping과 `C` assembly 일치 | L2 |
| NL-DYN-07 | linear SDOF | 독립 Newmark/closed-form harmonic response 일치 | L2/L5 |
| NL-DYN-08 | linear MDOF | modal/direct reference history와 peak 일치 | L3/L5 |
| NL-DYN-09 | nonlinear SDOF | independent bilinear history/energy 일치 | L3/L5 |
| NL-DYN-10 | nonlinear frame | independent solver node/hinge history 기준 충족 | L5 |
| NL-DYN-11 | effective tangent | finite-difference dynamic residual Jacobian 일치 | L3 |
| NL-DYN-12 | step rollback | nonconvergence 후 상태복원과 substep 재적분 | L3 |
| NL-DYN-13 | time-step convergence | `dt`, `dt/2`, `dt/4` 응답이 지정 trend로 수렴 | L3/L5 |
| NL-DYN-14 | energy balance | input-kinetic-damping-strain-plastic residual 기준 충족 | L3/L5 |
| NL-DYN-15 | gravity preload | 초기 정적상태와 동적 t=0 상태 연속 | L3 |
| NL-DYN-16 | model binding | run record의 model/domain/mass/element count가 실행대상과 일치 | L4 |

## 14. 모델 통합과 결과회복

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-INT-01 | rigid diaphragm static | constraint, reaction, story torsion 일치 | L3 |
| NL-INT-02 | rigid diaphragm dynamic | mass/inertia와 history recovery 일치 | L3 |
| NL-INT-03 | semi-rigid generated | 전개 topology와 origin result mapping 일치 | L3/L4 |
| NL-INT-04 | member release | released force 0, hinge 중복 차단 | L3 |
| NL-INT-05 | rigid offset | 변형·단력·결과위치 일치 | L3 |
| NL-INT-06 | local-axis rotation | y/z hinge/fiber/result 축 일치 | L3 |
| NL-INT-07 | nodal load | 외력·반력·내력 closure | L3 |
| NL-INT-08 | member load | fixed-end force와 current geometry 정책 일치 | L3 |
| NL-INT-09 | support spring | 선형 spring force와 reaction/energy 일치 | L3 |
| NL-INT-10 | settlement preload | prescribed displacement state와 반력 일치 | L3 |
| NL-INT-11 | truss | axial-only kinematics와 frame coupling 일치 | L3 |
| NL-INT-12 | unilateral | active-set 통합 검증 또는 실행 전 unsupported 차단 | L3/L4 |
| NL-INT-13 | story recovery | node 합계와 story shear/drift/torsion 일치 | L3 |
| NL-INT-14 | member station | end/station closure와 local/global sign 일치 | L3 |
| NL-INT-15 | result provenance | generated/source/case/step/time 역추적 가능 | L4 |
| NL-INT-16 | stale result | model hash 변경 시 표시·보고·API 전달 차단 | L4 |

## 15. UI와 agent/API

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-UI-01 | setup workflow | 검증→중력→속성→제어→실행→결과 순서 재현 | L4 |
| NL-UI-02 | smart defaults | 출처·가정이 표시되고 사용자 승인 전 model 미변경 | L4 |
| NL-UI-03 | unsupported | 차단 사유와 해당 객체로 이동 가능 | L4 |
| NL-UI-04 | settings parity | UI 입력과 stored/run settings 동일 | L4 |
| NL-UI-05 | progress/cancel | step/iteration progress와 안전한 취소 | L4 |
| NL-UI-06 | failure recovery | 실패 step, 원인, cutback/수정 경로 표시 | L4 |
| NL-UI-07 | Pushover chart | accepted step과 선택 step/view 연동 | L4 |
| NL-UI-08 | hinge visualization | member end/axis/state/time 정확 연동 | L4 |
| NL-UI-09 | story/member charts | 선택 객체와 source result 일치 | L4 |
| NL-UI-10 | NLTH charts | raw/downsample peak와 시간축 보존 | L4 |
| NL-UI-11 | movable popup | 이동·resize·snap·viewport containment 동작 | L4 |
| NL-UI-12 | responsive layout | 지정 desktop/tablet viewport 겹침·잘림 0 | L4 |
| NL-UI-13 | qualification display | completed/verified/designBlocked 구분 | L4 |
| NL-UI-14 | report parity | 화면, raw result, 계산서 주요값 일치 | L4 |
| NL-API-01 | validate case | UI와 같은 capability/error code | L4 |
| NL-API-02 | create/update case | schema round-trip과 hash 갱신 | L4 |
| NL-API-03 | run | UI와 동일 engine/settings/result | L4 |
| NL-API-04 | progress | case/step/iteration monotonic event | L4 |
| NL-API-05 | cancel | committed state 보존, status cancelled | L4 |
| NL-API-06 | result slice | node/story/member/hinge/time pagination 정확 | L4 |
| NL-API-07 | explain failure | solver code와 사용자 조치 연결 | L4 |
| NL-API-08 | qualification | evidence 누락 시 verified 반환 금지 | L4 |
| NL-API-09 | stale protection | model hash mismatch 실행/조회 차단 | L4 |
| NL-API-10 | deterministic automation | 같은 case 반복실행 주요결과 일치 | L4 |

P8-M10 통과 증거는 `reports/validation-evidence/phase8/p8-m10-ui-api.json`에 고정한다. UI와 Agent/MCP는 `src/nonlinear/product/`의 동일 case/preflight/job/result/report 계약을 사용하며, M10 통과 후에도 P8-M11 독립 수치검증 전 결과는 `candidate`, `designBlocked:true`다.

## 16. 성능과 pilot

| ID | 검증내용 | 합격기준 | 등급 |
| --- | --- | --- | --- |
| NL-PERF-01 | small reference | dense/sparse cross-check와 baseline runtime 기록 | L3 |
| NL-PERF-02 | medium Pushover | 대표 3D frame 100 step의 median/p95/memory 기록 | L4 |
| NL-PERF-03 | target Pushover | P8-M0 확정 target DOF에서 memory budget 준수 | L4 |
| NL-PERF-04 | long NLTH | history streaming으로 memory가 step 수에 선형 폭증하지 않음 | L4 |
| NL-PERF-05 | cancel/restart | 장시간 case 취소 응답과 checkpoint 재개 기준 충족 | L4 |
| NL-PERF-06 | no dense production fallback | target model에서 전체 dense matrix 생성 경로 없음 | L4 |
| NL-PERF-07 | main-thread responsiveness | M-tier 실행 중 input latency p95 100 ms 이하 | L4 |
| NL-PERF-08 | cancellation latency | 취소 요청 2초 이내 acknowledge, committed state 보존 | L4 |
| NL-PERF-09 | backend preflight | production WASM backend 부재 시 dense fallback 없이 실행 전 차단 | L2/L4 |
| NL-PERF-10 | symbolic reuse | topology 불변 step에서 pattern/order 재사용, numeric factor count 추적 | L3/L4 |
| NL-PERF-11 | bounded trial memory | line-search/cutback 증가에도 state buffer가 설정 상한 내 유지 | L3/L4 |
| NL-PERF-12 | M-tier Pushover | 승인 reference hardware의 시간·메모리 budget 통과 | L4/L5 |
| NL-PERF-13 | M-tier NLTH | 승인 reference hardware의 시간·메모리 budget 통과 | L4/L5 |
| NL-PERF-14 | result streaming | output step 증가 시 worker analysis memory 무제한 증가 없음 | L4 |
| NL-PERF-15 | chunk/checkpoint integrity | chunk hash와 restart 결과가 연속실행과 일치 | L3/L4 |
| NL-PERF-16 | deterministic parallel | single/multithread 결과 norm과 event ordering 정책 통과 | L3/L4 |
| NL-PILOT-01 | 2D steel portal | Pushover/arc-length 전체 artifact 통과 | L5 |
| NL-PILOT-02 | 3D steel moment frame | diaphragm, gravity, Pushover 결과 독립검토 통과 | L5 |
| NL-PILOT-03 | steel braced frame | truss/unilateral 정책과 결과 검토 통과 | L5 |
| NL-PILOT-04 | RC moment frame | PMM/fiber Pushover와 detailing input 검토 통과 | L5 |
| NL-PILOT-05 | 3D frame NLTH | record부터 energy/report까지 독립검토 통과 | L5 |

M11 현재 증거는 `reports/validation-evidence/phase8/p8-m11-qualification-release.json`과 `docs/verification/phase8/release-manifest.json`에 고정한다. `NL-PERF-01/03~06/08~11/14~16`은 실제 기준 프로파일에서 PASS다. `NL-PERF-02/07/12/13`은 M-tier end-to-end 및 browser latency 부재로 BLOCKED다. 파일럿 5종의 입력-보고 재현 artifact는 PASS지만 L5 독립비교와 소유자 승인이 없어 `NL-PILOT-01~05`는 BLOCKED다.

## 17. Release gate

기능별 release는 다음 조건을 모두 만족해야 한다.

1. 해당 검증군의 required ID 100% pass
2. 최소 한 개 이상의 L5 독립 비교
3. 선형극한, tangent, 평형, rollback 검증 pass
4. unsupported 조합의 fail-closed test pass
5. UI/API/report qualification parity pass
6. `NL-MEI-01`~`NL-MEI-20` pass
7. required 성능 budget과 Worker/WASM production path pass
8. 전체 legacy 및 Phase 7 regression pass
9. Critical/High 코드리뷰 finding 0

조건을 만족하지 못한 기능은 다른 기능의 통과 여부와 무관하게 `candidate`, `blocked`, `unsupported` 중 하나로 남긴다.
