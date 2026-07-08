# SPEC-B · 하중 조건 확장

track: P5-B / milestones: P5-M3, P5-M4, P5-M5 / status: spec
관련: FR-10~17, 엔진 스키마 `LOAD_TYPES`·`SUPPORT_TYPES`·`MEMBER_TYPES`

## B.0 목적

엔진에 이미 있으나 UI에서 못 누르는 하중·지지·거동을 입력 가능하게 한다. 팔레트 확장 + 속성 폼 + 전용 패널.

## B.1 지지 확장 (P5-M3)

### 스프링 지지
- **팔레트 도구 추가**: `spring`(스프링 지지). 기존 `pin/roller/fixed` 옆.
- 절점 클릭 → 지지 타입 `spring` 배정 → 속성 폼에서 6-자유도 계수 입력.
- 속성 폼 DOM: `#ssSpringKx`, `#ssSpringKy`, `#ssSpringKz`, `#ssSpringKrx`, `#ssSpringKry`, `#ssSpringKrz` (단위 표기 kN/m, kN·m/rad). 0=자유.
- model: `node.support='spring'`, `node.spring={kx,ky,kz,krx,kry,krz}`.
- 검증: 스프링 지정 절점은 최소 1개 유효 계수 필요(전부 0이면 경고).
- 확인: 스프링 반력이 결과 반력·평형 audit에 포함.

### 지점 침하
- 지지 속성 폼에 침하 입력: `#ssSettleDof`(축 선택), `#ssSettleValue`(변위), `#ssSettleCase`(소속 케이스).
- model: `node.settlement={ dof, value, case }`.
- 검증: 침하 DOF는 fixed 또는 spring 지지여야 함.

## B.2 부재 하중 확장 (P5-M4)

### 부분/사다리꼴 분포
- **팔레트 도구 확장**: `udl` 도구 선택 후 하중 다이얼로그에서 유형 선택 — 전장/부분/사다리꼴.
- 다이얼로그 DOM: `#ssLoadType`(udl/udl-partial/trapezoid), `#ssLoadW1`, `#ssLoadW2`, `#ssLoadFrom`, `#ssLoadTo`(0~1 비율), `#ssLoadDir`.
- model: `{ type:'udl-partial', member, w, direction, from, to }` / `{ type:'trapezoid', member, w1, w2, direction, from, to }`.

### 온도 하중
- **팔레트 도구 추가**: `temp`(온도). 부재 클릭 → 온도 다이얼로그.
- DOM: `#ssTempMode`(uniform/gradient), `#ssTempDt`(균일 ΔT), `#ssTempTop`, `#ssTempBot`, `#ssTempH`(구배).
- model: `{ type:'temperature', member, dT, case }` / `{ type:'tgradient', member, dTtop, dTbot, h, case }`.

### 부재 위 집중 하중/모멘트
- 기존 `pload`/`mload`를 부재 위 임의 위치로 확장: `#ssPointAt`(0~1). model: `{ type:'point', member, P, at, direction }`, `{ type:'mmoment', member, M, at, axis }`.

## B.3 부재 거동 지정 (P5-M4)

- 부재 속성 폼에 거동 선택: `#ssMemberBehavior`(frame/truss/tensionOnly/compressionOnly).
- model: `member.type`.
- 트러스: 양단 모멘트 해제 자동 안내. 인장/압축전담: 조합별 반복 활성상태 결과를 탄성 확장 trace에서 확인 안내.

## B.4 하중 케이스 매니저 (P5-M5)

- 전용 패널/모달: 케이스 목록·생성·타입·삭제.
- DOM: `#ssLoadCasePanel`, `#ssLcAdd`, `#ssLcList`, `.ss-lc-item[data-case-id]`, `#ssLcType`(dead/live/wind/seismic/snow/…).
- model: `loadCases[]`. 하중 입력 시 소속 케이스 지정을 이 목록에서.
- 조합 매니저(기존 `#lcModal`)와 연동 — 케이스가 조합 계수 편집의 소스.

## B.5 KDS 자동 산정 패널 (P5-M5)

- 패널: 설계 기본 입력(용도·지역·지반·중요도) → [미리보기] → [적용].
- DOM: `#ssKdsPanel`, `#ssKdsOccupancy`, `#ssKdsRegion`, `#ssKdsSoil`, `#ssKdsImportance`, `#ssKdsPreview`, `#ssKdsApply`.
- 실행: `bridge.getDesignBasisInput` → `bridge.applyDesignBasisLoads` (기존 엔진). 생성 하중이 WX/WY·EX/EY 케이스로 편입, 산정 trace 표시.

## B.6 층 질량·편심 (P5-M5)

- 패널 버튼: [층 질량 생성] → `bridge`의 층질량 생성 경로(`generateFloorMass` 상당).
- 결과: 층별 질량·질량중심·강성중심·편심 표. 모달/RSA/pushover 질량 소스로 사용.

## B.7 Acceptance Criteria

M3: 스프링·침하 입력 → 해석 반력 반영, 브라우저 실동작.
M4: 부분/사다리꼴/온도/부재점하중 입력·표시·해석 반영, 트러스 지정. 브라우저 실동작.
M5: 하중 케이스 CRUD, KDS 산정 생성+trace, 층질량 생성. 생성 하중이 조합에 편입. 브라우저 실동작.
공통: 신규 action(setSpringSupport/setSettlement/addTemperatureLoad/addPartialLoad/setMemberBehavior) 계약 등재, full suite green.
