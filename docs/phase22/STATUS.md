# Phase22 코드 수정 상태

2026-09-11 · 로컬 구현 완료 / 집중 검증만 수행 / 배포하지 않음

## M0 WebMCP 조회·상태

- 같은 세션에서 시작한 워크플로의 완료 job을 `get_analysis_status`, `get_result_slice`로 조회한다.
- 복원·현재 catalog 결과는 `open_analysis_result(analysisRunId)`로 새 읽기 전용 jobId를 발급한다. 이전 세션 ID는 거부하고 이 ID로 실행 취소를 할 수 없다.
- 현재 입력 identity와 기록의 identity로 오래된 결과 여부를 판단한다. 복원 결과를 단순 변경 플래그 때문에 재해석 필요로 표시하지 않는다.
- 조회·상태·설계 결과 선택 목록은 전체 결과 대신 metadata를 읽는다.

## M1 성능·메모리

- catalog 부분 조회는 경로 선택·크기 제한 이후에만 복제한다. 큰 결과 전체의 임시 복제와 metadata 목록의 반복 복제를 줄였다.
- 메모리 계상 중 Map/Set/Object 전체를 임시 배열로 펼치지 않는다.
- CPU Direct 반복에서 단계·반복 번호를 Worker 진행 이벤트로 보낸다. 행렬 계산 중 강제 heartbeat나 수렴 알고리즘 변경은 하지 않았다. 단일 반복이 오래 걸리는 경우 진행 통지 간격 자체를 보장하지 않는다.
- `get_runtime_resources`로 관리 ledger와 선택적인 브라우저 메모리 측정을 구분한다. `includeAggregate:true`는 지원·격리된 환경에서 Worker 등을 포함한 측정을 요청한다. 미지원·측정 중·시간초과를 0 bytes로 표시하지 않는다.
- 실제 성능 향상률·전체 heap 누수 없음은 주장하지 않는다. 사용자 요청에 따라 장시간 부하·실제 건물 시험은 생략했다.

메모리 API 조건: [MDN measureUserAgentSpecificMemory](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory). 이 수치는 브라우저별 추정이며 OS RSS 상한이 아니다.

## M2 자동 PDF

- 브라우저에서 예비 검토 기록 PDF를 생성·다운로드한다. UI의 `예비 검토 PDF 자동 저장`, WebMCP의 `export_report_pdf(handle,requestId)`를 연결했다.
- 모든 검토 항목의 NG/미검토·수요/내력·식·제한·입력/결과/보고서 hash를 보존한다. 출력 중 입력이 바뀌면 중단한다.
- 한글은 canvas에서 렌더링하여 이미지로 PDF에 포함한다. 텍스트 검색/선택은 지원하지 않으며 기존 HTML/JSON/CSV를 병행 제공한다.
- 최대400페이지/32MiB PDF, 관리 staging 예산, 동시 출력1개 제한. canvas·임시 페이지·Object URL을 정리한다.
- 기존 최종 계산서의 7개 그림·자격 gate를 통과한 것으로 표시하지 않는다. 새 출력은 `preliminary-review-record`, `designTransferAllowed:false`다.

## 실행한 최소 검증

1. `node tests/p22-focused.mjs`: 합성2절점 workflow 조회, 새 세션 복원 조회, stale/권한/경로/복제 격리, 메모리 API 분기, PDF hash변조·중간 stale 정리·구조 검사 PASS.
2. `node tests/webmcp-integration.mjs`: 43개 도구 등록 및 기존 직접 해석/조회 경로 PASS.
3. `node tests/p21-m0-rigid-direct.mjs`: 진행 콜백 추가 후 기존 작은 독립 수치 검사 PASS.
4. 실제 브라우저의 합성12개 검사 기록 한 건: PDF2페이지,329809bytes. 한글·페이지 나눔 시각 확인, SHA 일치, staging 해제 후 ledger0. 결과 파일은 `output/phase22/synthetic-review.pdf`다.

첫 집중 검사에서는 제품 입력 정규화를 생략한 수제 fixture가 복원 시 정규화되어 stale로 판정됐다. fixture를 정상 product-book 가져오기 경로로 준비하고 재실행했다. stale 검사를 완화하지 않았다.

전체124건 회귀, 실제 건물, 장시간 성능 시험, GitHub 업로드와 Pages 배포는 실행하지 않았다. Phase21의 기존 통과 결과를 이번 변경 전체의 회귀 통과로 소급하지 않는다.
