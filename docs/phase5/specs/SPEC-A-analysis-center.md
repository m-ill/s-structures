# SPEC-A · 해석 실행 센터

track: P5-A / milestones: P5-M1, P5-M2 / status: spec
관련: `ARCHITECTURE.md` §2·§3·§4, FR-01~09

## A.0 목적

"버튼을 눌러 해석하는" 경험의 핵심. 해석 케이스를 만들고 종류를 골라 실행하고 결과를 관리하는 전용 화면.

## A.1 화면 구성

해석 센터는 우측 도크(`#ssAnalysisCenter`, 폭 300px, 접이식)로 주입한다. 위치는 `#main` 우측, `#propPanel`과 탭 공유 또는 별도 토글.

```text
┌ 해석 센터 ───────────────────┐
│ [+ 케이스 추가 ▾]  [모두 실행] │
│ ──────────────────────────── │
│ ● AC1 정적 (P-Δ)      ok  ▶  │  ← 상태 뱃지 + 실행 버튼
│ ○ AC2 모달 12모드    stale ▶  │
│ ◐ AC3 응답스펙트럼  running… │
│ ✕ AC4 좌굴          failed ▶ │
│ ──────────────────────────── │
│ [선택 케이스 설정]            │
│  종류: 모달                   │
│  모드 수: [ 12 ]              │
│  질량 소스: [D+0.25L ▾]       │
│ ──────────────────────────── │
│ [결과]  주기 T1=0.82s …       │
└──────────────────────────────┘
```

## A.2 DOM 계약 (fake DOM 테스트가 참조)

| id | 요소 | 역할 |
| --- | --- | --- |
| `#ssAnalysisCenter` | div | 도크 컨테이너 |
| `#ssAcAdd` | button | 케이스 추가 (드롭다운 종류 선택) |
| `#ssAcKind` | select | 추가할 종류 (static/modal/…) |
| `#ssAcRunAll` | button | 모두 실행 |
| `#ssAcList` | ul | 케이스 목록 |
| `.ss-ac-item[data-case-id]` | li | 케이스 행 |
| `.ss-ac-run[data-case-id]` | button | 개별 실행 |
| `.ss-ac-status[data-case-id]` | span | 상태 뱃지 |
| `#ssAcSettings` | div | 선택 케이스 설정 폼 |
| `#ssAcResult` | div | 선택 케이스 결과 요약 |

상태 뱃지 텍스트: `not-run`=미실행, `running`=실행중, `ok`=완료, `failed`=실패, `stale`=모델변경(재실행필요).

## A.3 해석 종류별 설정·실행·결과

각 종류는 `analysisRunners.js`의 `runners[kind]`로 매핑. 실행은 `bridge`/엔진 함수 호출 → 결과 정규화 → 결과 핸들 저장.

### static (정적)
- 설정: `pDelta`(체크박스), `combo`(현재 조합 또는 전체).
- 실행: `bridge.analyzeModel(model)` (pDelta 시 analysisSettings.includeGeometricStiffness). 자동 미리보기와 동일 경로, 결과를 케이스에 고정.
- 결과: 조합별 최대 변위/부재력/반력 요약. 3D는 기존 변형 표시 재사용.

### modal (모달)
- 설정: `modeCount`(기본 12), `massSource`(층질량 조합).
- 실행: `analyzeDynamics(model, { modeCount })`.
- 결과: 모드별 주기 T·진동수 f·질량참여율(x/y), 참여질량 합계. 표 + (M9에서 3D 형상).

### responseSpectrum (RSA)
- 설정: `spectrum`(주기-가속도 점 또는 프리셋), `directions`(x/y), `combination`(SRSS/CQC), `dampingRatio`.
- 실행: 모달 선행 필요 → `runResponseSpectrum(modes, modalDofs, mass, totalMass, spectrum)`. 모달 케이스가 없으면 자동으로 모달 먼저 실행.
- 결과: 방향별 밑면전단·층응답. 표 + (M10 차트).

### buckling (좌굴)
- 설정: `referenceCombo`(축력 상태), `modeCount`.
- 실행: `estimateGlobalBucklingTrace(model, ...)`.
- 결과: 좌굴계수 λcr, 좌굴 모드. 표 + (M9 3D 모드).

### linearTha (선형 시간이력)
- 설정: `record`(지반가속도 배열/프리셋), `dt`, `direction`, `dampingRatio`.
- 실행: 모달 선행 → `runModalSuperpositionTha({ modes, direction, dampingRatio, dt, accelerations })`.
- 결과: 최대 응답 + (M10 시간이력 차트).

### pushover / nlth
- SPEC-C에서 상세. 해석 센터에서는 케이스로 관리하되 설정·결과 뷰는 비선형 워크플로 화면과 연동.

## A.4 실행 오케스트레이션

```text
runCase(caseId):
  1. 케이스 조회, status=running, UI 갱신
  2. 선행 의존 처리 (rsa/tha → 모달 필요 시 먼저 실행)
  3. runners[kind](model, settings, bridge) 호출 (try/catch)
  4. 성공: 결과 정규화 → SStructuresAnalysisResults.set(caseId, handle),
     status=ok, lastRun 기록, 결과 요약 렌더
  5. 실패: status=failed, message 표시 (수렴 로그 포함)
  6. 완료 이벤트 dispatch (결과 뷰 갱신용)
```

모델 변경 감지: `reanalyze`/모델 mutation 훅에서 실행된 케이스를 `stale`로 표시(결과는 유지하되 경고). 재실행 시 stale 해제.

## A.5 엔진 결과 형상 (정규화 입력)

| kind | 엔진 반환 위치 | 정규화 결과 payload |
| --- | --- | --- |
| static | `analyzeModel().byCombo`, `.envelope` | `{ byCombo, envelope, maxDisp, reactions }` |
| modal | `analyzeDynamics().modes` | `{ modes:[{mode,period,frequency,massParticipation}] }` |
| responseSpectrum | `runResponseSpectrum()` | `{ directions:[{dir,baseShear,story:[…]}] }` |
| buckling | `estimateGlobalBucklingTrace()` | `{ lambdaCr, modes:[…] }` |
| linearTha | `runModalSuperpositionTha()` | `{ peak, timeHistory:[…] }` |

runner는 엔진 반환이 기대와 다르면 방어적으로 흡수하고, 근본 불일치는 엔진 티켓으로 분리(엔진 불가침 원칙 예외).

## A.6 Acceptance Criteria (P5-M1)

1. 케이스 추가(static/modal/rsa) → 목록에 표시, 종류별 설정 폼 렌더.
2. [실행] → 상태 running→ok, 결과 요약 표시. RSA는 모달 자동 선행.
3. 정적 명시 실행이 자동 미리보기를 깨지 않음 (기존 m2/m26 테스트 green).
4. fake DOM 테스트: 케이스 CRUD·실행·상태 전이. 실엔진 호출로 modal 주기 산출 확인.
5. 브라우저: 대표건물에서 3종 실행, 콘솔 에러 0, 스크린샷 증빙.
6. agent action(addAnalysisCase/runAnalysisCase/listAnalysisCases) 계약 등재.

## A.7 Acceptance Criteria (P5-M2)

1. buckling/P-Delta/linearTha 케이스 실행·결과.
2. 실패 케이스의 message·수렴 로그 표시. stale 전이·재실행.
3. 브라우저 실동작 + full suite green.
