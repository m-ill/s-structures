# M4 WebMCP v2 작업 계약

기존 v1 9개 도구를 유지하고 18개를 추가해 총 27개를 제공한다. 모델링 문서와 app 호스트가 같은 M2 입력·M3 탄성 설계 서비스를 호출한다. 고정 소스 `0c4142ff1f08af4cea4f75b4867165353f66c797`의 관련 회귀 39/39 PASS. [검증 증거](../../verification/evidence/phase19/m4/README.md).

## 도구와 순서

| 단계 | 도구 | 동작 |
|---|---|---|
| 조회 | `get_workflow_context`, `get_design_context` | 현재 입력 identity, 부족한 입력 종류, 결과 기록과 타입별 모델 목록 |
| 입력 | `preview_design_changes`, `get_design_changes`, `apply_design_changes` | M2 11개 타입 변경안 확인 → 저장된 핸들 적용 |
| 케이스 | `preview_analysis_case`, `apply_analysis_case` | 탄성 케이스 생성·수정 전용 경로 |
| 탄성 실행 | `plan_elastic_workflow`, `start_elastic_workflow`, `get_elastic_workflow`, `cancel_elastic_workflow` | M3 순차 실행 계획 → 비동기 실행 → 조회·취소 |
| 설계 | `plan_design_review`, `start_design_review`, `get_design_result` | 완료된 정확한 정적/Direct 조합 → 예비 검토 → 페이지 조회 |
| 보고서 | `plan_report_export`, `start_report_export`, `get_report_artifact` | 검토 기록 확인 → 불변 보고서 생성 → 문자열 조각 조회 |
| 화면 | `set_workspace_view` | modeling / elastic / nonlinear / design-input / design-review 전환 |

도구 스키마는 등록 시 제공되며 [schemas.js](../../src/ui/webmcp/schemas.js)와 [workflowTools.js](../../src/ui/webmcp/workflowTools.js)가 실제 계약이다. 임의 JavaScript, 파일 경로, 자유 `execute(action,payload)`는 제공하지 않는다. 비선형 화면 전환은 계산 도구의 비선형 노출을 뜻하지 않는다.

1. `get_workflow_context`의 `inputIdentity.inputHash`와 `get_design_context`의 실제 엔티티 ID를 읽는다.
2. 타입별 입력을 preview하고 반환된 변경점·경고를 확인한다. 추가 변경점은 `get_design_changes`로 페이지 조회한다. apply에는 반환된 handle과 새로운 requestId를 전달한다.
3. 입력 변경 후 새 identity로 기존 케이스의 탄성 실행 계획을 만들고 시작한다. 시작은 즉시 workflow handle을 반환한다. 완료 상태의 `steps[].analysisRunId`를 사용한다.
4. 조합 ID와 해석 run ID로 설계 계획을 만들고 실행한다. 조회에는 designRunId와 summary / checks / sources / rules 채널을 사용한다.
5. 보고서를 plan/start한 뒤 artifact handle, html / json / csv 형식과 offset으로 읽는다. 도구는 파일을 외부에 발송하거나 디스크 임의 경로에 저장하지 않는다. UI 저장 버튼으로 같은 보고서를 다운로드한다.

조회·preview·plan은 solver를 실행하지 않는다. 설계 start는 완료 해석 수요로 설계 함수만 계산한다. report plan은 보고서를 만들지 않고 report start에서만 생성한다. WARN·NOT_CHECKED·stale·최종 전달 불가를 보존한다.

## 제한과 중복 처리

- 입력 JSON 64,000자, 응답 JSON 48,000자. 유한 숫자·허용 필드만 통과한다.
- 입력 commands와 실행 cases·설계 sources는 각 20개. 엔티티 배열은 100개, 시간이력 표본은 2,000개, 스펙트럼 점은 500개까지다. 실제 엔진/설계 서비스가 더 엄격한 범위와 단위를 재검사한다.
- 결과 페이지 1~20행, offset 기반 조회. 보고서 텍스트는 12,000자씩 읽으며 반환된 nextOffset을 따른다.
- v2 세션 handle 128개, 요청 기록 128개. 핸들은 세션 UUID를 포함하며 페이지·프로젝트 간 재사용할 수 없다. 전체 탄성 workflow는 한 번에 하나만 시작한다.
- 같은 v2 requestId에 다른 동작·입력을 넣으면 REQUEST_ID_CONFLICT다. 같은 요청은 기존 영수증/작업을 반환하며 중복 계산하지 않는다. v1 start_analysis의 기존 별도 requestId 공간은 호환성을 위해 유지한다.
- 페이지나 프로젝트를 떠나면 도구 등록·핸들을 폐기하고 이 세션이 시작한 실행에 취소를 요청한다. 완료 기록은 모델러의 기존 보존 정책을 따른다.

## 직접 등록과 app 호스트

직접 `index.html`에서는 `document.modelContext.registerTool`로 등록한다. app의 모델러 iframe은 최상위 등록을 시도하지 않고, 호스트가 같은 출처의 현재 iframe Document와 session/nonce/project 결속을 확인해 제한된 도구만 전달한다. 이 경로는 직접 capability 호출이며 임의 postMessage dispatcher를 추가하지 않았다. 기존 명령 브리지의 origin/source 방어도 유지한다.

서버는 `/index.html?shell=1`만 SAMEORIGIN / frame-ancestors self를 허용한다. API와 그 밖의 문서는 DENY / frame-ancestors none을 유지한다. 같은 출처 외부 문서나 기존 등록의 다른 frame/Document/session 교체는 거절한다.

화면에는 도구 준비 여부·마지막 작업·검토 결과의 최신 여부·예비 검토 범위를 표시한다. 도구가 만든 설계 기록을 UI 검토 패널이 받아 같은 결과를 표시하고 같은 보고서를 저장한다. WebMCP API가 없는 환경에서도 기존 입력/검토 UI는 동작한다. 서버 저장 프로젝트의 WebMCP 입력 변경은 기존 dirty/autosave 경로에 알린다.

## 검증 범위

실제 Codex Site tools로 직접 화면의 강재 골조와 app 호스트의 RC 골조를 입력→정적해석→설계→보고서까지 실행하고 UI 표시와 snapshot 해시를 대조했다. 합성 계정·프로젝트 A/B를 격리된 로컬 시험 서버에 만들고, 프로젝트 전환 후 오래된 등록과 변경 핸들 차단을 확인했다. 최종 세션 UUID 보강과 후보별 브라우저 범위는 증빙에 별도로 기록한다.

39개 고정 시험에는 UI/WebMCP canonical 입력·검토 행 일치, 실제 solver, 페이지네이션, 숨은 계산 방지, stale·중복·미지원 입력, 세션 결속, 취소, app 저장·보안 헤더와 M1~M3/P11 회귀가 포함된다. API 미지원은 모의 환경 시험이며 전체 브라우저 matrix 자격은 아니다. 실제 자동 PDF와 비선형 생산 자격은 후속 범위다. GitHub push는 수행하지 않았다.
