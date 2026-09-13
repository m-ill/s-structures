# Phase 21 검증·증거·배포 gate

2026-09-10 · 아래 시험은 **실행 계획**이다. 신규 시험 실행 수·PASS 수는 아직 0이다.

## 검증 원칙

1. 현상마다 결함 재현 입력, 원시 수치, 기대값의 출처, 실제 호출 경로를 연결한다. 제품에서 나온 숫자를 그대로 golden으로 복사한 시험만으로 수치 정확성을 주장하지 않는다.
2. 기존 결함의 원인을 수정하는 시험과 정상 기능을 유지하는 회귀를 함께 둔다. 특히 D 반력합과 1.4D 선형 배율은 현재 정상 기준이다.
3. 수치 비교는 동일 단위·축·station·하중조합·이론·자중/강성 가정에서 한다. 외부 프로그램 또는 독립 식의 입력 차이를 숨기지 않는다.
4. 알고리즘 수렴, 평형/복원, 제품 결과 일치, 자원/복구, 구조설계 자격을 별도 판정한다. 한 종류의 PASS로 나머지를 대체하지 않는다.
5. 모든 필수 시험은 최종 source/build/rule/input hash에 결속한다. 미실행은 NOT_RUN이며 이전 후보 PASS를 합산하지 않는다.

## 신규 시험 추적표

아래 ID는 **제안 시험군 식별자**다. 실제 테스트 파일과 개수는 M0에서 manifest로 고정한다. 세부 parameter 조합을 시험 개수에 중복 집계하지 않는다.

### Direct 강체 다이어프램

| ID | 입력·관측 | 인수 기준 |
|---|---|---|
| PD-01 | 다이어프램 없는 기존 Direct, pure-diaphragm만 있는 1층, story/z 지정 group | 기존 수치 유지, pure-diaphragm 경로 실제 사용, 지원표 일치 |
| PD-02 | 수평 대칭 1층·3층, 작은 횡력, 압축력→0 | 강체 운동 잔차·양축/반전 대칭·1차 극한 충족. 정의한 안정 골조에서 압축 증폭 확인 |
| PD-03 | 편심 하중·비대칭 강성·사용자 center·좌표 평행이동/90도 회전 | 비틀림 전달과 힘/모멘트 균형. 좌표와 중심 표현을 바꿔도 동일 물리 응답 |
| PD-04 | 지점 spring/compatible 강제변위/일반 MPC + diaphragm | 단계별 uBar, 재하 전후 구속·반력·가상일 만족. 모순/중복/비공면은 원인과 ID로 차단 |
| PD-05 | 1층 독립 계산, 3층 독립 구현 또는 외부 solver | 변위·N/V/M·반력·층 합력의 동일 문제 비교. 제품 solver helper를 oracle로 재사용하지 않음 |
| PD-06 | 압축 증가·임계 접근·비수렴·특이 접선 | 안정구간 수치와 임계 bracket 비교, 양정성 상실·잔차 초과 시 차단. 낮은 반복 횟수 실패를 성공으로 처리하지 않음 |
| PD-07 | 요소 단부·station·절점·전체 구조의 별도 감사 | 6성분 외력/반력, 요소-절점 closure, 구속 내력 가상일. Kg*u 보정의 유도와 독립 계산 일치 |
| PD-08 | 동기 CPU/제품 Worker/async/hybrid, prestress 소비, release/unilateral 등 부정 입력 | 지원 경로 동일 수치·자격. 미지원 backend/입력은 실행 전 차단. fallback·구속 누락·이중 축약 없음 |

독립 기준은 두 종류를 포함한다. 첫째, 최소 골조의 자유도·강성·하중·구속을 별도로 유도한 계산이다. 둘째, 명시한 이론/요소 분할을 맞춘 독립 구현 또는 외부 solver의 3D 편심 골조 결과다. 같은 S-Structures core 함수를 호출한 비교는 경로 동등성 시험으로만 분류한다. 외부 검토자 자격 증거와 내부 독립 계산도 별도 기록한다.

### RC 수치·입력 계약

| ID | 입력·관측 | 인수 기준 |
|---|---|---|
| RC-01 | SQUARE300/400/500 vs 같은 RECT, 기존 300×600 정상 예제 | 형상 동등성·양축 대칭, 정사각형 fallback 결함 제거, 정상 RECT 회귀 |
| RC-02 | 300×500 국부 y/z 회전·하중 반전·비대칭 배근 | 단면 축과 Vy/Mz·Vz/My 연결 검증. 배근도 함께 회전한 동등 문제 비교 |
| RC-03 | 역할 명시/미명시, 보/기둥/경사부재 | N/M 숫자 비교 제거, 역할 출처·검증. 보 기둥최소철근비 경고 제거 |
| RC-04 | 치수·재료·배근 누락, null·0·비수치·피복 초과 | INPUT_REQUIRED/INVALID/UNSUPPORTED 등 명시적 결과. 무효 ratio=0·OK 없음 |
| RC-05 | 다른 조합/위치에 P/M 극값, 같은 위치 동시 tuple | 실제 동시 발생 수요만 P-M 검토에 사용. 예비/상세 배근과 미지원 Vs·규칙 범위 표시 |
| INPUT-01 | import 후 모든 wizard·탭·보고서 왕복 | input/designBasis hash 불변, 쓰기 command 0건 |
| INPUT-02 | dirty draft + WebMCP 적용 + undo/redo + 새 프로젝트 | 동기화/충돌·취소·적용 경로 보존. 이전 draft가 새 모델에 저장되지 않음 |
| INPUT-03 | 설계기준 apply, 하중 재생성/수동하중 유지 | 한 transaction의 변경 범위·identity·stale 일치. 적용 안 한 기본값을 실제 조건으로 표시하지 않음 |
| SAVE-01 | native/product-book/legacy import·export, alias 충돌 | format/model version 판별, 3D와 필수 필드 보존. 같은 schema roundtrip identity 일치 |

### 실행·화면·보고서

| ID | 입력·관측 | 인수 기준 |
|---|---|---|
| EXEC-01 | 한 조합, 전체 20조합, 19개 workflow, 없는 조합 | 실제 Worker 조합 목록·solve count·출력 일치. 없는 조합은 명시적 실패 |
| EXEC-02 | 같은 입력 재요청, request ID 충돌, 조건 변경 후 재요청 | idempotency 보존, 다른 입력 결과 재사용 0건, 재사용 출처 표시 |
| SEL-01 | 서로 다른 dmax의 중력/X/Y 조합 전환 | raw·DTO·UI·표·보고서가 선택 키·단위와 일치 |
| SEL-02 | Envelope 명시 선택 및 지배 조합 확인 | 수치별 governing 출처, 비동시 성분으로 단일 변형도/P-M tuple을 만들지 않음 |
| SEL-03 | 실패 Direct↔modal↔완료 static↔stale | 이전 그림/숫자 잔존 0건. 리본·상태·하위 자격 일치 |
| REVIEW-01 | 1개 check 실패 + 여러 message, 동일 부재 여러 조합 | 독립 check/실패 부재/원시 행 counts 정의대로 일치 |
| REVIEW-02 | 보의 기둥 검토, 강도조합 drift, 기초 면적·배근 누락 | 적용성에 따른 N_A와 NOT_CHECKED 분리. 미지원/누락 은폐 없음 |
| REVIEW-03 | 예비식·가정 접합부·unsupported RC 상세 | 계산 범위·가정·limitation 보존, 최종 설계 전달 차단 |
| REPORT-01 | 여러 성공 조합·일부 실패·평형감사·프로젝트/빌드/규칙 | top summary와 상세 scope 일치, identity 누락 이유 명시, 실패 사용 차단 |
| REPORT-02 | 동일 snapshot의 UI/HTML/JSON/CSV | checks·counts·수치·단위·ID·자격 동등. HTML 파생 표와 원본 JSON을 구분 |
| REPORT-03 | 옛 기록·다른 build/rule·복원 입력 hash 변경 | migration 기록·stale/unbound 보존. 현재 identity로 소급 채우기 금지 |
| EXPORT-01 | 생성 완료·한글·figure 누락·PDF adapter/qualification 부재 | 정확한 capability·차단 사유. 생성한 원본 길이/hash·scene manifest 완전성 |

### 자원·복구·최종 배포

| ID | 입력·관측 | 인수 기준 |
|---|---|---|
| MEM-01 | 동일 S 모델 30회 실행/조회/보고서 | 소유 ledger·retained heap·peak·지연 예산 충족, 누적 참조 없음 |
| MEM-02 | 큰 report의 12,000자 범위 반복 읽기 | 요청당 전체 보고서 clone/재생성 0회, bounded 반환·할당, 내용 hash 불변 |
| MEM-03 | pin 결과·여러 프로젝트·예산 소진 | bytes+entries+전체 예약 제한, 필요한 자료 보존, 명시적 backpressure |
| MEM-04 | dense T/Ke/Kg/Kt·임계 탐색·확정 M fixture | full/reduced 자원 예측·peak 검증. 메모리 절감 후 수치 동등성 |
| MEM-05 | 실제 지원 Worker/WASM/GPU 경로 | detach된 배열 재사용·미해제 buffer 0건. 미측정 backend는 별도 상태 |
| LIFE-01 | queued/running 취소·dispose·예외 | ACK/종료/해제 시간, terminal 1회, pending/구독 해제 |
| LIFE-02 | 빠른 프로젝트 교체·host reload·늦은 응답 | 이전 generation publish·다른 프로젝트 접근·옛 handle 재사용 0건 |
| LIFE-03 | 1/2/4/8/16개 동시 조각 요청과 renderer/Worker 장애 | admission/queue 제한, 원인 계측·자료 보존. 미확정 원인은 UNKNOWN |
| SAVE-02 | reload/강제 종료/손상 checkpoint/이전 schema | 모델·완료 결과·artifact 복원과 hash 검증. 중단 job의 거짓 성공 0건 |
| SAVE-03 | 저장 불가·quota 초과·transaction 실패 | 부분 저장 complete 오인 0건, 원본 보존·다운로드 대안·오류 전달 |
| EXPORT-02 | 중복/역순/누락/변조 조각·중단 재개 | 누락 범위 재요청, 조각·전체 hash 확인, 다른 run 혼합 0건 |
| EXPORT-03 | export 취소/실패/다른 snapshot 요청 | stage/Blob URL/예약 해제, 미완성 상태 보존·완전본 오인 없음 |
| E2E-01 | 새 후보의 동일 상가주택 업무 전 과정 | 단계별 실제 화면·input/run/선택 키·판정·원인 기록 |
| E2E-02 | 일반 UI와 내부 브라우저 native WebMCP | 같은 입력의 수치·상태·자격·지원표 동등 |
| E2E-03 | 원본 3포맷·캡처 시험 PDF·재열기 | 파일 완전성·hash·PDF 시각 검수, 가능/불가 표·가정·미검토 기록 |
| RELEASE-01 | 최종 후보 Windows/Ubuntu·clean install | 고정 manifest 전체 통과, 미실행·source 차이 없음 |
| RELEASE-02 | 공개 ZIP 다운로드·Pages 실제 runtime | 파일/source identity 일치, 배포 후 Direct·선택·보고서 smoke |
| RELEASE-03 | rollback·새 schema 파일·외부 미충족 조건 | 사용자 파일 보존, 이전 runtime 복귀, production 오승격 없음 |

## 수치 오차와 기대값 정책

다음은 M0에서 확정할 **초기 제안**이다. SI 내부 단위를 기준으로 하고 허용오차·norm·scale·예외 입력을 결과 확인 전에 fixture별 manifest에 기록한다. 불량 조건수나 임계하중 근처 결과를 맞추기 위해 오차를 사후 완화하지 않는다.

| 항목 | 초기 기준 | 조건 |
|---|---|---|
| T 확장/축약·동일 문제 변환 | relative 1e-10 + absolute 1e-12 | 정규화된 무차원 algebra fixture. 물리 단위와 분리 |
| 강체 운동 | 병진 오차≤1e-9 m, 회전≤1e-10 rad | 표준 소형 fixture, 별도로 크기 정규화 잔차도 기록 |
| 독립 동일 이산계의 정적/Direct 응답 | relative 1e-5, near-zero는 항목별 absolute 기준 | force/moment/displacement 각각 scale 고정. 서로 다른 요소 이론이면 먼저 모델 차이를 해소 |
| 전체 평형·closure·수렴 | force/moment 각각 relative 1e-8 목표 | 기존 더 엄격한 기준이 있으면 유지. 원시 6성분·normalization·구속 가상일 보존 |
| P→0 선형 극한 | 동일 결과량 relative 1e-7 목표 | 축력 축소의 단계와 residual·discretization 조건 고정 |
| 임계 부근·불안정 | 값 하나의 오차 대신 안정/불안정 bracket·구간 폭 | 조건수·하중 단계·수렴 실패 분리. 모든 구조에 증폭 단조성을 가정하지 않음 |
| UI 표시 | raw→단위 변환 후 표시 최하위 자리의 0.5 단위 | 내부 exact DTO 일치와 화면 반올림 비교 분리. 3자리 mm이면 0.0005mm |
| identity·파일 무결성 | 완전 일치 | same schema/hash version일 때 적용. migration은 이전/새 hash와 변환 기록 |

수치와 무관한 날짜·실행시간·job ID 등은 기존 결정적 비교 projection으로 분리한다. 이 분리를 이용해 조합·자격·입력·부재력 같은 의미 있는 차이를 숨기지 않는다.

## 기존 회귀를 포함하는 방법

- 출발점은 [Phase20 manifest](../../../verification/specs/phase20/tests.json)다. PD/RC/저장/상태/자원 변경의 실제 import·호출 영향으로 추가 회귀를 선정한다.
- 관련 기존 시험에는 `tests/p2-mvp-s4-rigid-diaphragm.mjs`, `p6-pdelta-tangent.mjs`, `p9-m5-pdelta-hybrid.mjs`, `p15-m8-pdelta-first-order-ownership.mjs`, `m6-rc-design.mjs`, `p19-m3-design-workflow.mjs`, `p19-m4-webmcp-workflow.mjs`, `p19-review-session-disposal.mjs`, `p20-m2-prepared-views.mjs`, `p20-m3-elastic-parity.mjs`, `p20-m4-module-boundaries.mjs`, `p20-m5-browser-input-boundaries.mjs`가 있다.
- Phase20의 수치 동일성 시험에서 의도된 RC/선택 변경이 생기면 변경 이유·이전/새 기대값·독립 근거를 남긴다. 기존 기준 파일을 덮어 과거 PASS 의미를 바꾸지 않는다.
- STRIX21/P17/P18/P18A, 일반 제약·modal/RSA·nonlinear·Worker/WASM·공개 API 중 영향을 받는 경로를 포함한다. nonlinear의 기존 생산 자격을 확대하거나 trace 경로를 production으로 우회하지 않는다.
- 향후 실행 형태는 기존 runner를 활용하는 `node tools/run-p19-validation.mjs <run-dir> --manifest=verification/specs/phase21/tests.json`을 검토한다. **Phase21 manifest는 아직 없으므로 지금 실행 가능한 새 검증 명령이 아니다.**

## 브라우저 및 메모리 시험 환경

수치 회귀는 로컬과 Windows/Ubuntu CI의 고정 Node 환경에서 수행한다. 실제 사용 시험은 지원 일반 브라우저와 Codex 내부 브라우저 native WebMCP에서 실행하고 브라우저/host 버전·viewport·backend·device를 기록한다. 실제 브라우저에서 못 한 조작은 자동 stub PASS와 구분한다.

메모리와 지연은 고정 장비·warmup·표본·동시 작업 없음 조건에서 비교한다. [메모리 계획](MEMORY_MANAGEMENT.md)의 제안 예산을 M0에서 확정한다. GitHub hosted runner의 elapsed time을 장비 성능 자격으로 대체하지 않는다. 실제 세션 리셋 원인은 lifecycle event·renderer/Worker 종료·가능한 crash 정보·heap/RSS·입력 저장 시각으로 구분한다. 원인 미확정과 복구 성공 여부는 각각 기록한다.

## 증거 디렉터리와 캡처 기록

아래는 **생성 예정 구조**다. 빈 PASS 파일이나 구현 전 evidence는 만들지 않는다.

```text
verification/specs/phase21/
  baseline.json                # 소스·입력·기존 실패·결함 ID
  tests.json                   # 실제 파일·명령·gate·필수 여부
  contracts.json               # 지원표·수치/단위·상태·schema
  resource-budgets.json         # 장비·규모·측정·예산 확정
  fixtures/                    # 원본·복원·synthetic 구분
verification/evidence/phase21/<milestone>/<run>/
  manifest.json                # 소스/환경/해시/실행 상태
  commands.log
  comparison.json              # expected/actual/error/source
  memory/                      # ledger·측정·retainer·장애 기록
  screenshots/                 # 실제 화면 원본
  screens.json                 # 단계·입력·run·선택·카메라·판정
  artifacts/                   # 원본 포맷·조각 manifest·완전성
  report.md                    # 가능/불가·원인·수정·남은 가정
  SHA256SUMS
```

큰 raw/캡처/원본 보고서/PDF는 `output/phase21/<run>/`에 수집하고 공개 때 검토한 release evidence ZIP으로 보존한다. 저장소에는 재현 fixture·필수 비교값·manifest·요약·release 링크를 남긴다. artifact를 생략할 때도 누락과 검증 범위를 표시한다. 이전 `output/reports/.../run-001`과 Phase20 봉인 증거는 수정하지 않는다.

화면 한 장의 기록은 다음 필드를 가진다: `stepId/action/expected/actual/status/defectId/projectId/inputHash/runId/method/comboId/view/camera/units/timestamp/screenshotPath/sha256` 및 실행 환경. 실패 화면도 보존한다. 보고서에는 대지 출처, 가정한 36㎡×3층 모델, 해석·설계 미확정 조건, 프로그램이 수행한 것과 사용자의 독립 확인이 필요한 것을 기록한다.

원본 JSON/CSV가 불완전하면 `partial`이며, HTML 추출본은 `derived`다. 파일 전체 hash와 원본 출처가 확인돼야 `complete-native`라고 표시한다. 새 보고서가 과거 부분본을 대체했다는 관계는 기록하되 과거 파일 내용과 완전성 상태를 바꾸지 않는다.

## 최종 판정

- **G0 수치:** PD/RC/기존 정상 수치, 독립 기준, 평형·수렴·부호·단위.
- **G1 계약:** 입력 불변·실행 조합·선택/포락·상태·보고서 identity·counts.
- **G2 자원/복구:** 확정 규모의 메모리·지연·취소·저장/내보내기 무결성.
- **G3 제품:** 실제 UI·native WebMCP·전체 상가주택 흐름·원본 파일·화면 기록.
- **G4 릴리스:** 동일 candidate CI/설치/다운로드/Pages/rollback.
- **G5 독립 생산 자격:** 외부 비교 2건·pilot 5건·규모별 qualification·사용자 독립 검토. 미완료를 유지할 수 있으나 생산 자격으로 표시할 수 없다.

G0~G4 필수 항목의 실패/미실행은 해당 지원 범위의 릴리스를 막는다. 예외를 허용하려면 기능을 명시적으로 비활성화하고 지원표·영향·검증을 수정한 별도 후보로 재판정한다. P0 치수 결함, 잘못된 성공/자격, 자료 손실은 문서상 제한만 추가해 통과시킬 수 없다.
