# Phase24 모듈별 WebMCP 제어 계약

> 2026-09-11 재계획: Phase24는 부분 구현 기준선으로 보존하고 미완료 범위를 [Phase25](../phase25/README.md)로 이관했다. 아래 계획/실적은 당시 기록이며 전체 마일스톤 완료가 아니다. 현재 잔여 작업의 정본은 [32건 재점검 대장](../phase25/GAP_AUDIT.md)이다.


2026-09-11 · 사용자 추가 요구 반영 · **모든 업무 모듈의 WebMCP 제어는 필수 인수 조건**

화면에서만 가능한 설계 기능을 만들지 않는다. 재료/단면/배근/접합부/기초 입력, 검토, 후보, 변경 적용, 재계산, 도면/계산서 생성·조회·내보내기까지 WebMCP로 수행한다. 각 모듈 구현 단계에서 함께 연결하고 TDD로 검사한다.

## 기존 연결을 확장하는 위치

- `src/ui/webmcp/tools.js`: 공통 도구 wrapper, 입력/출력 크기·schema·session·오류 계약.
- `src/ui/webmcp/workflowTools.js`: 현재 design context, preview/apply, elastic workflow, review, report 도구.
- `src/ui/webmcp/schemas.js`: 현재 member-design 등 제한된 명령 schema를 재료별 상세 계약으로 확장.
- `src/ui/webmcp/register.js`, `src/app/webmcpHost.js`: native/host 등록·세션 수명 유지.
- `src/ui/indexBridge.js`와 제품 서비스: UI/Agent/WebMCP가 같은 업무 구현에 도달하는 경계.

현재 `get_design_context`는 재료/단면 등의 일부 요약 필드만 반환하고 공개 member-design에는 실제 전체 배근·접합·기초 입력이 없다. 기존 도구 이름을 모두 바꾸거나 임의 함수 호출 도구를 추가하는 방식 대신, 읽기 채널·typed command·제품 서비스를 확장한다. 새로운 workflow/도면 기능은 필요할 때 명시적 도구를 추가하고 계약 버전을 올린다.

## 모듈별 필수 제어

다음은 업무 동작 계약이다. **새 tool 이름을 확정하거나 이미 등록됐다고 주장하는 표가 아니다.** M0/M1에서 실제 등록명·schema 버전을 API 목록에 연결한다.

| 모듈 | 읽기·계획 | 변경·실행 | 상태·결과·산출물 | 완료 milestone |
| --- | --- | --- | --- | --- |
| 재료·규칙 | 재료/제품/버전/규칙 목록, 상세 물성·단위·출처·누락/지원 조회 | 등록/수정/할당 preview→apply, 명시적 버전 선택 | 적용 내역·오류·무효화 대상 | M1 |
| 단면·부재 조건 | 형상/치수/축/파생값·고정 조건 조회 | 형상/치수/좌굴·지지 조건 수정 preview→apply | 변경 전후·파생값·재해석 필요 여부 | M1~M2 |
| RC 실제 배근 | 부재/구간/층별 주근·스터럽·피복·정착/이음 조회 | 배근 생성/수정/할당 preview→apply | 제공량/실제 상세·누락/배치 오류 | M1, M4 |
| 해석 | capability·케이스/조합·방법·source 계획 | 기존 start/cancel·CPU/허용 backend 실행 | 진행·수렴·평형/자격·run ID·필요 slice | M2~M3 |
| 부재 설계 | 필요한 검사·누락 입력·사용 규칙, 정확한 source 선택 | 검토 plan/run/cancel | 검사·trace·NG/미검토 이유·지배 조합/위치 | M3~M4 |
| 자동 보완 | 제약·목적·영향·예산·적용 모드 계획 | 후보 생성/평가 start/cancel, 선택 후보 preview/apply, 재계획·재계산 | 후보별 변경/비교/부적합 사유·종료 이유·계보 | M5 |
| 접합부 | 연결 객체/위치/재료/강성·상세·수요/필수검토 조회 | 생성/수정/할당 preview→apply, 검토·후보 start/cancel | 접합 전단·정착/구속·일치 여부·상세 참조 | M6 |
| 기초·지반 | 실제 형식/치수/배근·근거 지반값·조합별 반력 조회 | 생성/수정/할당 preview→apply, 검토·후보 start/cancel | 접지압·구조검토·누락/미지원·상세 참조 | M7 |
| 배근도·수량 | 지원 도면/상세·현재성·출력 계획 조회 | 상세 도면/수량 생성 start/cancel | sheet/artifact 목록, preview·SVG/PDF·수량 내보내기 | M8 |
| 계산서 | 선택 검토 snapshot·템플릿·형식 계획 조회 | 생성/취소/내보내기 | 검사 근거·상세/도면 참조·artifact·자격 | M8 |
| 프로젝트·복원 | revision·현재/낡은 결과·복원된 작업/산출물 조회 | 명시적 저장/내보내기/가져오기·복원·undo/redo | 복원 완전성·새 session에서 durable ID 조회 | M2, M9 |

목재·조적의 계산 미지원도 WebMCP에서 필요한 입력과 함께 조회 가능해야 한다. 지원하지 않는 run을 성공한 빈 결과로 반환하지 않는다. 순수 행렬 연산 같은 내부 함수마다 외부 도구를 하나씩 만드는 것이 아니라, 위 업무 모듈의 모든 기능이 공통 서비스로 제어되도록 한다.

## 공통 요청·응답

1. **명시적 대상:** project/document binding, entity ID, schema version, base revision/identity를 사용한다. 현재 화면에서 선택한 부재를 암묵적으로 수정하지 않는다.
2. **입력 계약:** UI와 WebMCP의 같은 schema·단위·enum·필수값을 사용한다. material/section/rebar/connection/foundation patch는 typed command이며 임의 JSON 경로 쓰기·수치 함수명 실행을 받지 않는다.
3. **변경 계약:** preview는 diff·누락/경고·무효화/재실행 범위를 반환한다. apply는 검증된 change handle·requestId와 base identity를 사용하고 원자적으로 한 번만 적용한다. 제약 안의 자동 적용은 사전에 설정한 모드로 진행하며 각 후보마다 불필요한 확인을 요구하지 않는다.
4. **장기 작업:** plan은 수행 순서·범위·예산을 반환하고 start는 즉시 job/workflow ID를 반환한다. status/cancel/result를 별도로 제공한다. 상세검토가 길어지면 기존 동기 review 경로도 공통 job 서비스로 이관한다.
5. **상태:** 진행 stage, completed/total, stop reason, input identity, source run, result currentness, requested/executed backend, qualification을 같은 의미로 반환한다. 수치 검토 OK와 설계 전이 허용을 분리한다.
   평가 scope(부재/접합/기초/프로젝트)와 해당 범위의 필수검토를 함께 반환한다. 선택한 부재의 OK나 조회 필터를 프로젝트 전체의 완료로 응답하지 않는다.
6. **조회 불변성:** context/status/result/trace/artifact 목록 조회가 해석·후보 생성·모델 변경을 일으키지 않는다. 누락된 결과는 필요한 실행을 안내하는 구조화된 응답으로 반환한다.
7. **제한된 응답:** 목록/검사는 pagination, 큰 수요는 slice, PDF/SVG는 artifact ID와 읽기/내보내기 경로로 제공한다. 현재 64,000자 입력·48,000자 응답, 기본 page20·handle/request128 제한을 우선 보존하고 확장이 필요하면 별도 budget 근거를 기록한다. 이 값은 현재 코드 기준이며 새 무제한 payload로 바꾸지 않는다.
8. **오류와 복구:** schema 오류, unsupported, missing input, stale, no feasible candidate, numeric failure, resource limit, cancel을 구분한다. requestId 재호출은 동일 작업을 반환하고 같은 ID/다른 payload는 충돌로 거부한다.
9. **세션/저장:** 임시 preview handle은 해당 세션에 묶고 만료를 명시한다. 복원한 analysis/design/artifact는 저장된 durable ID로 새 세션에서 조회할 수 있게 한다. 다른 프로젝트·revoked session 요청은 거부한다.
10. **출력:** 선택한 snapshot 기준의 파일 생성/내보내기를 지원한다. 파일 참조만으로 공개 게시나 GitHub 업로드를 수행하지 않는다. `designTransferAllowed:false`인 데이터는 export에서도 이 제한을 보존한다.

기존 도구를 유지하는 경우 추가 채널/필드는 호환 규칙에 맞게 확장한다. 의미가 달라지는 schema에는 새 contract version과 adapter를 제공한다. tool 설명·capability·feature catalog도 같은 등록 정의에서 갱신해 서로 다른 지원 범위를 주장하지 않게 한다.

## 개발 중 필수 계약 시험

각 milestone의 순수 계산 시험에 아래 **해당 경계의 작은 시험만** 붙인다.

- 같은 유효 입력을 UI 제품 서비스와 실제 WebMCP definition의 execute에 주면 같은 revision·검사/오류 코드를 얻는다.
- 읽기 요청 전후 모델 hash와 solver/job 시작 횟수가 변하지 않는다.
- 오래된 preview apply와 중복 requestId가 각각 차단/한 번 적용된다.
- 새 필드가 schema에서 거부되거나 누락되지 않고 실제 계산 입력까지 도달한다. 등록된 도구 이름의 개수만 확인하는 시험으로 대신하지 않는다.
- 작은 비동기 작업의 status→cancel→result 경계와 session dispose를 확인한다. mock 시험은 API 계약 증거이며 native 브라우저 등록 증거로 표시하지 않는다.
- M9에서 작은 실제 브라우저 흐름 하나로 native/host 중 해당 실행 경로의 등록과 반환 상태를 확인하고, 나머지 환경은 종합검증 Q에 기록한다.

## 에이전트의 전체 작업 경로

`capability/context → 재료·단면·배근/접합/기초 조회 → typed preview/apply → 해석 plan/start/status/result → 설계 plan/start/status/checks → 제약을 둔 후보 plan/start/status → 선택 후보 preview/apply → 영향 단계 재계획/실행 → 상세도/계산서 plan/start/status/export`

이 전체 경로에서 사용자가 폼을 대신 클릭하거나 콘솔로 내부 객체를 고칠 필요가 없어야 한다. M1~M8의 개별 모듈이 연결되지 않은 채 M9만 통과한 것으로 처리하지 않는다.
