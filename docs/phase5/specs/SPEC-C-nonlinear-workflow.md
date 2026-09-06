# SPEC-C · 비선형 성능평가 워크플로

track: P5-C / milestones: P5-M6, P5-M7, P5-M8 / status: spec
관련: FR-18~22, Perform-3D 성능평가 참조, 엔진 `src/nonlinear/*`

## C.0 목적

Perform-3D식 흐름 — 힌지 배정 → pushover/NLTH 실행 → capacity/성능점/힌지 상태 판정 — 을 화면으로 완성한다.

## C.1 힌지 배정 (P5-M6)

- 상단 [비선형해석] 모드에서 힌지 배정 서브모드 활성.
- 부재 선택 → 힌지 배정 패널에서 i단/j단, backbone(재료 nonlinear 참조), 힌지 종류(M-θ / PMM) 지정.
- DOM: `#ssHingePanel`, `#ssHingeEndI`(체크), `#ssHingeEndJ`(체크), `#ssHingeBackbone`(select, 재료 라이브러리 backbone), `#ssHingeType`(moment/pmm), `#ssHingeAssign`(버튼), `#ssHingeClear`.
- model: `member.nonlinear.hinges = [{ end:'i', type, backbone, id? }, ...]`, `member.nonlinear.hingeEnds`는 기본 선택 단부를 보조 기록. 현재 `assignMemberHinges`가 읽는 계약을 우선한다.
- 3D 표시: 배정된 힌지 위치를 부재 단부에 마커로 (M9 결과 뷰와 공유).
- 검증: 힌지 backbone은 nonlinear 파라미터를 가진 재료여야 함(없으면 안내).

## C.2 Pushover 케이스 (P5-M7)

해석 센터의 pushover 케이스 설정을 비선형 워크플로 화면과 연동.

- 설정 DOM: `#ssPoDirection`(±x/±y), `#ssPoPattern`(triangular/uniform/mass), `#ssPoSteps`, `#ssPoTarget`(목표변위), `#ssPoControlNode`, `#ssPoMaxLoadFactor`, `#ssPoReferenceBaseShear`.
- 실행: `bridge.runPushover({ direction, pattern, steps, targetDisplacement, controlNodeId, maxLoadFactor, referenceBaseShear })` (기존 엔진). `#ssPoControl`을 둘 경우 load-factor는 실제 실행, displacement/arcLength는 현재 control trace/preliminary 안내로 분리한다.
- **기존 experimental 경로 흡수**: 지금 `?experimental_ui=1`에서만 뜨는 pushover 패널을 정규 UI로 승격. `installIndexPushoverPanel`을 해석 케이스 경로로 통합하거나 대체.

### Capacity Curve 뷰
- 차트(자체 SVG): x=제어변위, y=밑면전단. 항복점·목표변위 마커.
- DOM: `#ssPoCurve`(svg 컨테이너), 데이터는 결과 핸들 `curve:[{step, loadFactor, controlDisplacement, baseShear, yieldedMemberCount, ultimateMemberCount, ok, reason}]`.

### 힌지 상태 진전 뷰
- 스텝 슬라이더로 힌지 상태(elastic→yield→capping→residual) 색상 3D 표시.
- DOM: `#ssPoStepSlider`, 힌지 상태는 결과 핸들 `memberStates`와 curve step 요약을 우선 사용한다. 스텝별 상세 이벤트가 없으면 마지막 상태/요약 기준으로 limitation 표기.

## C.3 성능 판정 (P5-M8)

- capacity curve에서 성능점(성능기반: 수요-능력 교차 또는 목표변위) 산정.
- 사용비(usage ratio) = 수요/능력, 성능수준 IO/LS/CP 판정 (힌지 회전 대비).
- DOM: `#ssPerfPoint`(성능점 표), `#ssPerfLevel`(IO/LS/CP 뱃지), `#ssPerfHingeTable`(힌지별 상태·회전·수준).
- 엔진: pushover 결과의 힌지 회전·상태를 기준값과 비교(기준은 재료 backbone의 ductility/limit). 기준이 없으면 limitation 표기.

## C.4 NLTH 케이스 (P5-M8)

- 설정 DOM: `#ssNlthRecord`(지진파 select/업로드), `#ssNlthScale`(배율), `#ssNlthDamping`(Rayleigh α/β 또는 모드 감쇠), `#ssNlthDt`.
- 실행: `analysisRunners.js`가 core `runNewmarkNlth({ accelerations, dt, mass, stiffness, damping, yieldForce, postYieldRatio })`를 호출한다. 지진파 parsing/scaling/Rayleigh trace는 기존 `buildNonlinearAnalysisTrace` 경로를 재사용할 수 있다.
- 결과: 시간이력 응답(변위/층전단/힌지 상태), 최대치 envelope. 시간이력 차트(M10)와 연동.
- 현재 엔진은 SDOF/bilinear Newmark trace이므로 전체 frame NLTH처럼 표기하지 않는다. scaling trace(설계 스펙트럼 맞춤 배율)를 결과에 표기하고 preliminary limitation을 유지한다.

## C.5 Acceptance Criteria

M6: 힌지 배정·해제 UI, backbone 참조, 3D 마커. 배정이 pushover 입력으로 소비됨. 브라우저 실동작.
M7: pushover 케이스 실행(정규 UI, 실험 플래그 불요), capacity curve 차트, 힌지 진전 슬라이더. 브라우저 실동작.
M8: 성능점·사용비·IO/LS/CP 판정 표시. NLTH 실행·시간이력 응답. 브라우저 실동작.
공통: 신규 action(assignHinge/removeHinge/runAnalysisCase[pushover|nlth]) 계약 등재, full suite green. 비선형은 preliminary 상태 문구 유지(Phase 4 실증 전).
