# Phase 21 작업 패키지

2026-09-10 · 전 단계 `PLANNED`. 구현 완료는 [실제 상태](IMPLEMENTATION_STATUS.md)에 증거를 연결한 뒤에만 기록한다.

각 마일스톤은 변경 전 재현 → 최소 책임 범위 수정 → 집중 시험 → 영향 회귀 → 증거·상태 갱신 순으로 수행한다. 수치가 바뀌면 golden을 먼저 바꾸지 않고 원인·독립 기대값·영향 범위를 검토한다. 실패한 실행과 이전 보고서는 보존한다.

## M0 — 강체 다이어프램 Direct P-Delta 구현

**진입:** 작업 트리와 수정 시작 소스 고정. 다른 기능 수정에 앞서 이 마일스톤을 구현한다.

### 작업

1. 원래 상가주택 증거를 읽기 전용 기준선으로 복사·hash 고정한다. 원본/부분/파생/복원 자료의 관계를 manifest에 기록한다. 원래 입력과 복원 입력의 차이를 비교하고 재실행 fixture를 명시적으로 선택한다. 재현 입력은 최종 설계 모델로 표현하지 않는다.
2. 강체 다이어프램 1층·3층·편심 예제와 현재 실패 케이스를 만든다. 수평 XY, 소회전, 중복 group·지점·MPC 처리, 허용 backend를 지원표에 고정한다. 공통 제약식을 쓰는 기존 일반 MPC·비강체 케이스도 포함한다.
3. `secondOrder.js`, `tangentStiffness.js`, `domain/constraintSystem.js`에서 동일 affine 구속계로 탄성/기하강성·하중·강제변위·잔차를 처리한다. 구속 topology를 한 run에서 재사용하고 단계별 상태와 분리한다.
4. 안정성 평가와 임계하중 bracket의 좌표계를 통일한다. 축약 DOF의 단위 분류, 서로 다른 단위의 수렴 norm, reference matrix의 차원·좌표 일치를 고친다.
5. 변위·부재력·단부력·지점 반력·다이어프램 내력을 일관되게 복원한다. 전체 평형과 요소-절점 closure를 별도 감사하고 구속의 가상일을 검사한다.
6. CPU 동기·제품 Worker·async/hybrid의 입력/출력 계약을 맞춘다. hybrid가 이 범위에서 검증되지 않으면 capability가 미지원 사유를 먼저 반환한다. 지원하지 않는 입력에서 1차해석 결과를 Direct 성공처럼 반환하지 않는다.
7. Direct 실패의 세부 사유를 UI/Agent/WebMCP에 보존한다. 기존 release/unilateral/0강성 연결 차단을 삭제하지 않는다. 양의 부분고정 연결 근사 등 기존 limitation도 유지한다.
8. 첫 메모리 ledger, 기준 장비·측정 방법·시험 오차를 고정한다. dense T·Ke/Kg/Kt의 동시 보유량과 반복 중 새 할당을 계측한다. M0 구현부터 메모리 초과 preflight와 임시 자원 해제 원칙을 적용한다.

**주요 코드:** `src/solver/pdelta/{secondOrder,tangentStiffness,stability,analysisDomain}.js`, `src/solver/domain/constraintSystem.js`, `src/solver/diaphragm*.js`, `src/core/diaphragmGroups.js`, `src/compute/elastic/hybridPDelta.js`, `src/compute/adapters/elasticProductionAdapter.js`.

**검증·완료:** [PD-01~PD-08](VALIDATION_PLAN.md)와 기존 Direct/diaphragm/MPC/Worker 회귀 통과. 압축 P→0의 1차 극한, 구속운동·좌표 변경 불변성, 6성분 평형, 독립 기준 수치가 맞는다. 비수렴·불안정·모순 구속·미지원 backend는 차단한다. M0만 통과한 후보를 사용자 설계 검토나 공개 배포의 기준으로 승격하지 않는다.

**산출물:** 제안 `verification/specs/phase21/`의 baseline·지원표·PD fixtures·허용오차, `verification/evidence/phase21/m0/<run>/`의 전후 결과·원인·메모리 기준 기록. 변경 전 D01 실패가 변경 후 기대 지원으로 바뀌는 증거를 남긴다.

## M1 — RC 치수·축·역할·수요 계약 수정

**진입:** M0 통과. 원래 RC 단면 함수 재현과 결함 보고서 보존.

### 작업

1. SQUARE/RECT의 치수 정규화를 해석·설계 공통 계약에 연결한다. 결측 H=600mm 대체를 제거하고 단위 변환을 한 경계에서 수행한다. A/I override와 강성 수정자는 출처를 보존한다.
2. `null/0/NaN/Infinity`, 없는 재료·단면, 유효깊이≤0, 잘못된 피복·철근 입력을 명시적으로 거부한다. 실패값을 ratio=0 또는 OK로 치환하지 않는다.
3. 비정사각형 부재의 Vy↔Mz, Vz↔My 관계를 국부축·회전·부호 fixture로 검증한 뒤 수요와 단면 축 연결을 수정한다. 단면 치수 변경과 축 변경은 별도 commit/증거로 원인을 추적한다.
4. 명시한 부재 역할·기하학 분류를 사용하고 힘/모멘트 숫자 비교를 제거한다. 보에는 보의 규칙, 기둥에는 기둥의 규칙을 적용한다.
5. 철근비 예비 가정과 실제 배근 입력을 구분한다. P-M 검토의 동시 발생 수요와 독립 포락을 구분하고, 배근/규칙/축 계약이 충족되지 않으면 상세 설계의 OK를 만들지 않는다. 전단철근 Vs·실제 상세가 없는 검토는 현재 범위를 표시한다.
6. 영향을 받는 규칙/설계 버전과 무효화 범위를 기록한다. 물성은 동일하고 설계 치수만 수정됐다면 보존 가능한 해석 결과와 재생성해야 할 설계·보고서를 구분한다. M6에서는 전체 경로를 새로 실행한다.

**주요 코드:** `src/design/concrete.js`, `src/core/catalogs.js`, `src/solver/linear3dRecovery.js`, `src/compute/product/elasticReviewService.js`, 관련 단면/설계 입력·규칙 버전.

**검증·완료:** RC-01~RC-05. SQUARE300/400/500과 같은 RECT의 양축 동등성, 90도 회전, 역할별 적용성, 오류 입력 차단, 동시 발생 수요 검증. 555.39/337.365→224.91/224.91 kN·m는 기존 예비식을 유지한 **치수 단독 수정의 기대 재현**으로만 비교한다. 축·배근 규칙을 추가 수정한 최종 건물 결과를 이 값에 강제로 맞추지 않는다.

**산출물:** shape/축/단위 계약, 예비 검토 범위, 결함별 회귀, 기존 결과 invalidation/migration 규칙, 변경 영향 목록. P0 단면 결함이 남으면 이후 공개 gate는 실패다.

## M2 — 입력의 불변성과 저장·가져오기 일치

**진입:** M1 통과. 기준 입력의 canonical schema와 해시 정의 확정.

### 작업

1. wizard의 open/go/read와 save/apply를 분리한다. 프로젝트·용도·지역·지반·하중 등 전체 draft를 현재 모델에서 읽는다. 단계 이동의 `saveBasis` 호출을 제거하고 dirty·base hash를 관리한다.
2. import, WebMCP 변경, undo/redo, 모델 교체 후 모든 입력 화면을 동기화한다. 편집 중 외부 변경이 들어오면 사용자가 수정한 draft를 조용히 덮거나 이전 draft를 모델에 덮어쓰지 않는다.
3. 설계기준 변경과 실제 하중 변경의 범위를 명시한다. 자동 재생성 시 기존 사용자 하중의 보존/대체 규칙과 transaction을 검증한다. 확인되지 않은 지역·지반 시작값에 출처 상태를 부여한다.
4. product-book의 외부 format/version과 내부 model schema version을 구분해 실제 UI 라우터에서 판별한다. 3D 입력이 legacy 2D로 변환되지 않도록 정상·이전 버전 fixture를 모두 둔다.
5. canonical/legacy shear 설정 등 alias 충돌은 migration 경계에서 한 번 처리한다. 원본을 보존하고 변환 내역·이전/새 hash를 남긴다. 같은 버전 재저장은 입력 의미를 바꾸지 않아야 한다.
6. hash는 분석에 의미 있는 필드를 기준으로 정하되 순서·부호·단위에 의미가 있는 배열을 임의 정렬하지 않는다. 해시 규칙을 바꾸면 버전을 올리고 과거 결과를 현재 hash로 소급 재결속하지 않는다.
7. 정상 native export/import/자동저장 복원의 완전성을 만든다. M5의 durable result/artifact 복구가 사용할 동일 프로젝트·입력 identity를 제공한다.

**주요 코드:** `src/ui/indexElasticSetupWorkflow.js`, `indexNativePersistence.js`, `indexImportAgentState.js`, `indexAgentCommandBridge.js`, `src/core/migration.js`, `workflowIdentity.js`, 실제 가져오기 이벤트 경계. 서버 저장은 경로가 사용되는 경우 `src/app/persistenceClient.js`까지 검사한다.

**검증·완료:** INPUT-01~INPUT-03, SAVE-01. 화면 모든 단계 왕복·결과/보고서 조회에 input hash 불변. 명시적 apply 1회에만 새 identity·무효화가 발생한다. UI·WebMCP 편집 간 충돌 재현, native 재열기에서 3D 좌표/24절점/39부재/138하중/3다이어프램/20조합과 관련 설정 보존. 의미가 바뀌는 migration은 명시적으로 stale 처리한다.

**산출물:** 입력 transaction·migration 계약, import 지원표, 원본/변환본/자동저장 roundtrip fixture와 재현 화면.

## M3 — 실행 범위·선택 결과·상태 통합

**진입:** M2 통과. 안정된 입력 identity를 모든 실행 경계에서 사용할 수 있음.

### 작업

1. 실제 WebMCP→브리지→제품 서비스→Worker 요청의 조합 목록을 추적한다. 한 조합 요청에서 20개가 반환된 원인을 확정한다. 이미 필터링하는 `analysisCaseEngine.runStatic`만 바꿔 완료 처리하지 않는다.
2. 요청 조합과 해석 조합을 명시적으로 일치시킨다. 전체 조합은 별도 실행 모드로 둔다. 동일 계산의 공유가 필요하면 key에 입력·조합 factors·method·solver/build·옵션을 포함한다. 재사용 여부와 원본 run을 기록한다.
3. 공통 result selection DTO를 만들고 UI 숫자·변형도·부재력·반력·보고서 대상이 같은 결과를 참조하게 한다. 포락은 명시적 선택과 지배 조합 표시를 제공한다.
4. 실패한 Direct 선택 아래 이전 모달 그림이 남는 경로를 제거한다. 누락 결과, running, failed, cancelled, stale, unsupported의 표시와 리본 활성화 기준을 통일한다.
5. execution과 design eligibility를 분리하고 하나의 상태 projection으로 전달한다. 상위 `designBlocked`와 하위 audit/qualification이 충돌하지 않게 한다.

**주요 코드:** `src/compute/product/{analysisCaseEngine,analysisProductService,unifiedElasticRunService,elasticAnalysisWorkflow}.js`, `src/compute/adapters/elasticProductionAdapter.js`, `src/ui/{elasticResultVisualization,resultSelectionStore,indexElasticAnalysisRibbon,indexElasticResultPopup}.js`, `src/core/analysisRunRecord.js`.

**검증·완료:** EXEC-01~EXEC-02, SEL-01~SEL-03. 20조합 전체 요청 1회는 해당 목록을 정확히 실행하고 한 조합 요청은 1조합만 실행한다. 선형 분해 재사용은 허용하되 결과 provenance를 보존한다. raw m와 UI mm의 1회 변환·반올림, 선택 불일치 0건, 실패 뒤 잔존 그림 0건. 미지원/실패 결과 설계 전달 0건.

**산출물:** 실행 경계 계측, 조합별 횟수·시간·payload 크기, 공통 선택/상태 계약, UI·도구 회귀와 실제 화면.

## M4 — 검토 집계·보고서·출처·내보내기 계약

**진입:** M3 통과. 보고 대상 run·조합 집합을 정확히 선택할 수 있음.

### 작업

1. canonical checks와 messages를 분리하고 유일키로 집계한다. N/A·NOT_CHECKED·NG를 구분하고 적용/미적용 사유를 기록한다. 실패 검토 수와 실패 부재 수, 원시 행 수를 별도 표시한다.
2. 단면 오류 수정 전 132 NG 등의 기존 숫자를 결함 재현용으로 보존한다. 최종 수정 모델의 counts는 재산출하며 이전 숫자와 같아야 한다고 시험하지 않는다.
3. 프로젝트 ID·보고 조합·max displacement·평형 감사·input/build/rule/source를 준비 단계에서 결속한다. summary와 상세 표, UI·HTML·JSON·CSV가 같은 snapshot을 사용한다.
4. 예비 RC/가정 접합부 검토·미검토 기초/슬래브·자격 차단을 본문과 기계판독 데이터 모두에 보존한다. 검토 OK만으로 자동 PDF qualification을 해제하지 않는다.
5. 저장할 artifact 계약을 고정한다: format/encoding/length/hash/snapshot ID/완전성/조각 범위. 큰 원본은 생성 1회 후 immutable artifact로 읽고, 조각마다 전체 report clone을 하지 않는 인터페이스를 만든다. 실제 저장·예산·재개 처리는 M5에서 완성한다.
6. 단계별 캡처를 run·입력·선택 조합·카메라/표시 단위·시각과 연결한다. 직접 보존한 실제 화면만 figure manifest에 등록한다. 구조 계산서 자동 PDF와 별도 시험 보고서를 구분하고 PDF 미지원 사유를 남긴다.

**주요 코드:** `src/compute/product/elasticReviewService.js`, `workflowResults.js`, `src/report/phase19/designReviewReport.js`, `src/report/phase11/{reportSnapshot,sceneEvidence}.js`, `src/ui/indexReportExportWorkflow.js`, `src/ui/webmcp/workflowTools.js`.

**검증·완료:** REVIEW-01~REVIEW-03, REPORT-01~REPORT-03, EXPORT-01. 한 실패에 설명 3개를 붙여도 실패는 1개. N/A가 미검토로 계산되지 않고 입력 누락은 N/A로 숨겨지지 않는다. 같은 snapshot의 모든 포맷에 표·요약·식별자가 일치한다. 누락 figure/adapter/qualification은 구체적 차단 사유를 반환한다.

**산출물:** 검토·보고서 schema와 migration, full/partial/derived 상태 계약, 화면 manifest, 새 보고서 포맷 간 비교 자료.

## M5 — 메모리·작업 정리·저장·전송 복구

**진입:** M4 통과. immutable result/artifact 참조와 입력 복원 계약이 준비됨.

### 작업

1. [자원 소유권 표](MEMORY_MANAGEMENT.md)에 따라 모든 결과·작업·plan·request·보고서·pending·UI 캐시를 계측한다. 총 예산과 저장소별 bytes/entries를 동시에 제한한다.
2. `workflowResults`의 result/legacyRecord 중복, read마다 전체 structuredClone, report chunk마다 전체 report 복제, 반복 full-combo payload를 줄인다. 외부 API는 반환 범위에 대한 수정 격리를 유지한다.
3. 실행 중 scratch, 종료 기록, 캐시, 영속 artifact를 분리한다. active·선택 결과·보고서 참조를 pin하고, 큰 비활성 payload는 검증된 저장 후 메모리에서 퇴출한다. idempotency record를 퇴출해 같은 요청이 중복 실행되지 않도록 한다.
4. Worker 종료·취소·예외·모델 교체·host dispose에서 controller/listener/promise/ArrayBuffer/Blob URL/GPU resource 소유자를 정리한다. 이전 generation의 늦은 결과가 새 프로젝트에 등록되지 않게 한다.
5. 내보내기를 제한된 동시 읽기·queue·취소·backpressure로 처리한다. 개별 chunk와 전체 파일 hash, range/offset, 재시도·중단 재개를 제공한다. v1의 문자 offset을 유지하는 adapter와 새 버전의 byte 계약을 구분한다.
6. 모델·완료 run manifest·artifact checkpoint를 transaction으로 저장한다. 브라우저 저장소가 사용할 수 없거나 quota를 넘으면 알려주고 검증된 다운로드 경로를 제공한다. 저장하지 못한 자료를 durable로 표시하지 않는다.
7. reload/탭 교체/Worker crash/강제 종료 후 복원한다. 실행 중 job은 interrupted로 기록하고 수렴 상태가 저장·검증되지 않은 Direct를 완료로 복구하지 않는다. 재개 가능한 export와 재실행이 필요한 analysis를 구분한다.
8. 기존 16개 동시 조각 읽기 상황을 제어된 시험에서 재현한다. 네트워크/renderer/host 수명과 메모리를 함께 기록해 원인을 분류한다. 원인이 증명되지 않으면 UNKNOWN으로 남기고 복구 gate로 손실 여부를 확인한다.

**주요 코드:** `src/compute/product/{workflowResults,elasticReviewService,analysisProductService,preparedResultViews}.js`, `src/compute/runtime/{workerClient,workerCore,protocol}.js`, `src/nonlinear/runtime/`, `src/compute/elastic/`, `src/ui/webmcp/`, `src/app/webmcpHost.js`, native persistence와 export 경계.

**검증·완료:** MEM-01~MEM-05, LIFE-01~LIFE-03, SAVE-02~SAVE-03, EXPORT-02~EXPORT-03. 예산 초과는 할당 전 명시적 거부/대기. 반복 작업 후 단조 메모리 누적 없음, 자원 ledger 해제 확인, export 재개 후 전체 SHA-256 일치, 원래 session handle 재사용 차단, 프로젝트 교체 뒤 늦은 publish 0건.

**산출물:** 소유권·예산 확정표, 동일 장비 전후 profiling, leak/GC와 정당한 보유를 구별한 기록, 장애 주입 결과·복구 시연. 측정 불가 항목에는 PASS를 부여하지 않는다.

## M6 — 같은 상가주택 실제 업무 흐름 재검증

**진입:** M0~M5 통과. 검증 후보 source와 지원 backend를 고정한다.

### 작업

1. 기존 대지 조사·설계 가정을 그대로 구분해 새 fixture를 확정한다. 원래 입력 재현이 불가능하면 복원 입력과 차이를 명시하고 양쪽 결과를 동일 입력 비교라고 하지 않는다.
2. 모델 가져오기 → 치수/단면/다이어프램 → 하중·질량·조합 → 1차해석 → Direct X/Y → 결과 선택 → RC 예비 검토 → 보고서 → 저장/재열기를 실제 제품 경로에서 수행한다.
3. 매 단계 화면·입력 hash·run/선택 키·기대/실제·PASS/FAIL/BLOCKED·원인·복구를 기록한다. 캡처는 잘라낸 설명용 그림과 실제 전체 화면 원본을 구분한다.
4. 하중-반력 합·선형 배율·축/단위·다이어프램 운동·P-Delta 증폭·집계·자격·내보내기 완전성을 점검한다. 지반/배근/접합부 등 가정으로 해결되지 않는 사항은 미확정으로 남긴다.
5. 일반 브라우저 UI와 실제 내부 브라우저 native WebMCP의 같은 입력 결과를 비교한다. 과거 site tools stub만으로 사용자 환경 검증을 대체하지 않는다.
6. 원본 HTML/JSON/CSV를 끝까지 저장·hash 검증한다. 단계 캡처를 포함한 시험 보고서를 Markdown과 PDF로 작성하고 PDF를 렌더링해 누락/잘림을 확인한다. 제품의 자동 계산서 PDF capability도 별도로 시험한다.
7. S 규모 반복·취소·재열기와 확정한 M 규모 부하 시험을 수행한다. M을 측정하지 못하면 S 지원과 M 미검증을 명시한다. 필수 목표로 확정한 M gate는 미실행 상태로 남기며 자동 면제하지 않는다.

**완료:** E2E-01~E2E-03, 전체 신규 matrix, 영향 회귀 통과. 수정 대상 D01~D12는 해결 또는 입증된 제한/원인 미확정과 복구 결과로 추적된다. 최종 수치 오류와 데이터 손실은 잔여 제한으로 돌려 PASS 처리하지 않는다.

**산출물:** 동일 후보의 전체 raw 로그·화면 manifest·원본 3포맷·캡처 PDF·수정 전후 표·가능/불가 기능 표. 사용자의 독립 검토용 인계 묶음. 외부 비교 2건·pilot 5건 완료로 과장하지 않는다.

## M7 — 후보 고정·공개 패키징·배포

**진입:** M6 소프트웨어 gate 통과. 필수 검증·지원 범위·외부 미충족 조건을 문서에서 구분함.

### 작업

1. 최종 candidate commit/tree와 파일 hash를 고정한다. Phase20 manifest에 Phase21 시험을 더한 실제 실행 목록을 확정하고 Windows/Ubuntu에서 같은 후보를 검증한다. 생산 경로가 바뀌는 추가 수정은 영향 시험과 후보 검증을 다시 수행한다.
2. `.github/workflows/phase20.yml`, `pages.yml`, `verify.yml`을 검토해 Phase21 gate를 배포 조건에 연결한다. 기존 112개 검사만 통과해 배포되는 경로를 남기지 않는다. 성능 qualification은 고정 장비에서 별도 결속한다.
3. source/runtime/evidence ZIP, 파일별 SHA-256, 실행법, 지원표, RC 수정으로 달라지는 결과, 이전 기록의 invalidation/migration과 rollback 절차를 작성한다.
4. 공개 evidence는 synthetic 수치 재현과 필요한 pilot 검증 자료로 구성한다. 계정/세션 토큰·불필요한 개인 식별정보를 제거하고 원본·검토본 관계를 manifest로 남긴다. 큰 원본 자료는 release artifact로 제공하고 저장소에는 명세·요약·해시·안정적인 링크를 둔다.
5. 깨끗한 디렉터리 설치 → 다운로드 hash → main 병합/Pages 배포 → 실제 `SOURCE-IDENTITY.json`·주요 파일 hash → 작은 diaphragm Direct·조합 전환·보고서/재열기 smoke를 확인한다. 실패 시 이전 검증 runtime으로 되돌리고 새 스키마 사용자 파일을 덮어쓰지 않는다.
6. README·WebMCP docs·Phase21 상태·Wiki·log를 **실제로 완료한 수준**으로 갱신한다. 개발 프리뷰 배포와 생산 설계 자격을 구분한다.

**완료:** RELEASE-01~RELEASE-03. 같은 candidate의 필수 시험 모두 통과, 설치·공개 파일·보고서 hash 검증, 배포 후 사용자 경로 확인. 외부 검토 미완료이면 development-preview 상태와 최종 설계 전달 차단을 유지한다.

**산출물:** 최종 검증 manifest, Windows/Ubuntu·실제 브라우저 증거, 공개 패키지와 다운로드 검증, 배포/rollback 기록, 잔여 독립 검토 목록.

## 일정과 변경 관리

M0의 구속·반력·안정성 및 M5의 저장·자원 수명은 높은 위험 작업이다. 임의의 일수보다 각 gate의 증거로 진도를 관리한다. M0 기준선 측정과 최소 재현이 끝나면 작업량을 다시 산정한다. 범위 확장은 영향 모듈·검증·예산·지원표를 먼저 갱신한다.

각 단계에서 계획/구현/집중 검증/통합 검증/공개 상태를 별도 기록한다. 완료 판정에는 commit, 실행 명령, 환경, PASS/FAIL/미실행, artifact hash, 남은 제약이 필요하다. 코드 작성만 끝났거나 내부 작은 예제만 통과한 상태를 마일스톤 완료로 쓰지 않는다.
