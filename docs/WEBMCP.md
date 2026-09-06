# WebMCP v1 — 2026-09-05

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
