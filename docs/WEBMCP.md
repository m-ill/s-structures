# WebMCP — 일반구조설계·보고서·비선형 연결

## 브라우저 연결 도구 (2026-09-15)

현재 브라우저 등록은 4개, 조회 가능한 기능은 94개입니다. 처음에는 `get_agent_start_context`의 명세를 읽고 호출해 작업 절차·현재 입력·도구 선택·공통 보고서 계약을 확인합니다. 자세한 변경과 제한은 [보고서·에이전트 일관성](ux/REPORT_AGENT_PORTABILITY_20260915.md)을 참고합니다.

브라우저에는 `list_sstructures_tools`, `describe_sstructures_tool`, `read_sstructures_tool`, `execute_sstructures_tool` 4개만 등록합니다. 전체 기능은 검색·페이지 조회로 탐색하고 명세를 읽은 뒤 `invokeWith`에 표시된 도구에 `{name, arguments}`를 전달합니다. 아래 문서의 기존 기능 이름은 `name` 값이며 기능 삭제나 API 변경을 뜻하지 않습니다. 입력 해시·미리보기·승인·세션 검증은 그대로 적용됩니다.

예: `describe_sstructures_tool({name:"get_project_context"})` 조회 후 `read_sstructures_tool({name:"get_project_context",arguments:{}})` 호출. 등록 요청 완료와 실제 에이전트 응답 확인은 구분합니다. 설정 한도 오류가 남아 있으면 작업을 저장한 뒤 수정된 페이지를 새로 열고 브라우저 도구 목록을 다시 조회합니다.

과거 Phase20 배포는 **36개 도구**를 제공했다. [배포 소스·검증 기록](archive/phase20/PAGES_DEPLOYMENT.md)을 확인한다. [M5~M10 지원 범위](archive/phase19/M5_M10_CANDIDATE.md) · [개발 PR](https://github.com/m-ill/s-structures/pull/3). 아래 M4 기록은 이전 단계의 검증 이력이다.

2026-09-07 로컬 M4는 기존 9개에 18개를 추가한 총 27개 도구를 제공한다. 입력 preview/apply, 탄성 workflow, 설계 검토, 보고서 artifact, 화면 전환을 M2·M3 공통 서비스에 연결했다. 직접 모델러와 같은 출처 app 호스트에서 실제 Site tools를 검증했다. [M4 계약·사용법](archive/phase19/M4_CONTRACT.md) · [39개 고정 회귀와 브라우저 증거](../verification/evidence/phase19/m4/README.md). 이 문단은 M4 당시 기록이며, 후속 Phase19·20은 main/Pages에 반영했다.

## 공개 v1 호환 계약 — 2026-09-05

OpenAI Site tools의 `document.modelContext.registerTool`에 연결한다. 이 API가 제공되는 보안 컨텍스트의 최상위 `index.html`에서 도구 9개를 등록한다. 미지원 브라우저에서는 기존 UI를 그대로 사용한다. iframe 안의 모델러는 등록하지 않으며, 모델러 URL을 직접 열어야 한다. 일반 MCP 서버나 ChatGPT 원격 커넥터를 생성하는 기능은 아니다.

## 실행

Node.js 24에서 `node server/main.mjs 5173` 실행 후 지원 브라우저로 `http://127.0.0.1:5173/index.html`을 연다. 기본 UI의 ‘해석 케이스 → 추가’로 케이스를 먼저 만든다. `file://` 사용은 지원하지 않는다. 공개 호스팅은 HTTPS를 사용한다.

## 호출 순서

1. `get_project_context`: 모델 해시·단위·케이스 ID·계산 대상 지원 상태.
2. `inspect_model`: 모델 점검. 해석을 실행하지 않는다.
3. `validate_analysis`, `plan_analysis`: 조회한 `caseId`, `modelHash`, 선택적 `computeTarget`으로 검증·계획.
4. `start_analysis`: 같은 입력에 고유 `requestId`를 추가한다. 동일 요청 재시도는 기존 job을 반환한다.
5. `get_analysis_status`: 반환된 `jobId`로 진행 상태 조회.
6. `get_result_slice`: 같은 job의 `summary` 또는 `payload` 하위 경로, 최대 100개. 결과 단위와 provenance를 함께 확인한다.
7. 필요시 `cancel_analysis`, 화면 강조는 `select_entities`.

정적·모달·RSA·좌굴·선형 시간이력의 기존 제품 API를 호출한다. CPU가 기본이며 GPU 차단 조건을 우회하지 않는다. 모델 편집·임의 JavaScript·파일 쓰기·보고서 발송은 노출하지 않는다. 세션당 128개 요청과 동시 1개 작업으로 제한한다. 새로고침 후 이전 job은 이 어댑터로 조회하지 못한다.

모델 입력 해시는 파생 `analysisCases.status/lastRun`만 제외한다. 시작 시 모델 복제본을 계산에 전달한다. 이후 UI 변경은 실행 입력을 바꾸지 않으며 결과의 `stale`로 표시된다. 입력 단위와 솔버 출력 단위 정책은 별개로 반환되며 임의 단위 변환을 하지 않는다. 결과는 내부 계산 검증이며 외부 공인 검증을 뜻하지 않는다 (`NOT_CLAIMED`).

명령 브리지는 같은 HTTP(S) origin과 알려진 window source만 허용한다. URL hash는 `getCapabilities` 조회만 허용한다. 같은 origin에서 실행되는 스크립트 자체를 격리하는 보안 경계는 아니다.

## 검증 및 출처

`node tools/run-public-validation.mjs <존재하지-않는-출력폴더>`는 실제 시간·코드 식별자·런타임·종료코드·로그 SHA-256을 기록한다. 역사적 원자료를 보존하려면 별도 checkout에서 실행한다. 네이티브 Site tools 발견 여부는 브라우저별 별도 실측이며 Node 테스트만으로 주장하지 않는다.

- [OpenAI WebMCP](https://learn.chatgpt.com/docs/webmcp)
- [WebMCP draft](https://webmachinelearning.github.io/webmcp/)
- [Chrome WebMCP](https://developer.chrome.com/docs/ai/webmcp)

2026-09-05 확인. WebMCP는 변동 중인 API이며 브라우저·제품별 지원 범위가 다르다.

## Phase 19 비선형 개발 후보

현재 개발 브랜치는 36개 도구를 제공한다. 기존 27개 탄성 workflow에 비선형 케이스·힌지 preview/apply·페이지 조회·이력·실패 진단·pause/resume 9개를 추가했다. 공통 분석 도구로 production Pushover/NLTH를 실행한다. [호출 순서·지원 범위·잔여 자격](archive/phase19/M5_M10_CANDIDATE.md)을 확인한다. 성공한 비선형 결과도 candidate이며 최종설계 전달은 차단된다.


## Phase21 로컬 후보 — 40개 도구와 원본 단위

아직 main/Pages 배포 완료가 아니다. 40개 도구에는 완료 결과·보고서의 체크포인트 저장/검사/복원 및 새 report handle 발급이 추가된다. 실행·배포 상태는 phase21/IMPLEMENTATION_STATUS.md를 따른다.

`get_result_slice`는 원본 숫자를 변환하지 않는다. 정적/Direct 결과의 `dmax`, `dmaxM`, 절점 병진변위는 **m**이고 화면은 mm로 표시할 수 있다. 예: 원본0.009505956 m = 화면9.505956 mm. 응답의 `units`/`rawResultUnits`/`solverUnitPolicy`는 원본 단위를, `displayUnits`는 모델 표시 단위를 설명한다.

`unitContract`는 version, path, valueUnit 또는 componentUnits와 valuesRescaled=false를 제공한다. 6자유도 변위는 m,m,m,rad,rad,rad이며 반력은 kN,kN,kN,kN.m,kN.m,kN.m이다. 혼합 레코드·미인식 필드에는 fieldMetadataRequired=true가 붙는다. 모달 정규화 벡터 등은 임의로 mm/m를 붙이지 않고 해당 필드 단위 계약을 확인해야 한다. 초기 UI 표시용 단위 안내를 원본 변위에 붙이던 오류를 수정한 계약이다.

## Phase22 로컬 개발 변경

43개 도구. workflow 완료 job도 공통 상태/부분 조회에 연결한다. 복원 결과는 `open_analysis_result`로 새 읽기 전용 ID를 얻는다. `get_runtime_resources({includeAggregate:true})`는 선택적인 메모리 진단, `export_report_pdf({handle,requestId})`는 예비 기록 PDF 자동 다운로드다. 최종 설계 자격·배포 완료를 의미하지 않는다. [계획 및 코드 상태](archive/phase22/STATUS.md) 참고.

## Phase23 GPU 강체 다이어프램 후보

프레임·강체 다이어프램 static 모델의 기능 조회는 지원 환경에서 GPU 검토용을 제공한다. 기존 computeTarget gpu로 1차 탄성·Direct P-delta를 실행하며 결과에 실제 GPU 경로와 preliminary/designBlocked 자격을 보존한다. Auto는 CPU다. 상세 범위는 [Phase23](archive/phase23/README.md)를 참조한다.
