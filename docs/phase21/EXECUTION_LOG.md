# Phase 21 실행 기록

기록은 날짜순으로 덧붙인다. 과거 실패·후보·판정은 보존하며 후속 결과로 설명한다.

## 2026-09-10 — 계획 수립

- 사용자 요청: 첫 구현을 강체 다이어프램으로 하고, 실무시험에서 나타난 오류의 재발 방지와 메모리 관리를 포함한 다음 Phase 개발계획 작성.
- 저장소의 최신 개발 문서 Phase20을 확인하고 Phase21 계획을 생성했다. 계획 기준 checkout은 `d8ae7af7af3d20b9a5c0977f210e5d1b26991ace`다. 기존 미추적 산출물과 사용자 자료를 보존했다.
- Direct의 명시적 강체 차단, 일반 constraints 유무에 의존하는 tangent/solve 분기, hybrid partition 경로와 stability의 원래 DOF 사용을 확인했다. 공통 구속·하중·안정성·복원을 함께 검증하는 M0를 계획했다.
- RC 정사각형 치수, 입력 wizard, 선택/포락, 집계/출처, 원본 보고서 완전성 문제를 기존 재현 자료와 코드에 연결했다. 선택 조합 필터가 이미 있는 경로와 실제 20조합 반환 관측을 구분해 호출 경계 추적을 계획했다.
- workflowResults 중복 복제·상한 없는 Map, report 전체 clone 후 chunk slice, prepared view의 직렬화 상한을 검토했다. 세션 초기화 원인은 미확정으로 유지하고 자원 계측·backpressure·저장 복구를 M5에 포함했다.
- M0~M7, 목표 계약, 메모리 소유권·초기 예산, 수치/제품/복구/릴리스 검증과 인수 조건을 문서화했다. 기존 수정계획 N0~N6는 관측 기록으로 보존하고 이번 실행 순서로 대체한다.
- 제품 소스·테스트·CI·배포는 변경하지 않았다. 수치 회귀 실행·새 후보·Phase21 PASS 증거는 없다. 문서 링크와 Wiki 검사는 계획 문서 검증으로 별도 기록한다.

## 2026-09-10 — 계획 문서 검증

- Phase21 7개 문서와 관련 README·기존 수정계획의 상대 링크 72개를 검사했다. 끊긴 링크 0개, 닫히지 않은 코드 블록·문자 치환 오류 0개다.
- Wiki72개 검사에서 이번 변경의 새 링크 오류·고아·깊이 위반·index 누락은 없었다. 전체 lint는 기존 S-Scan 원자료 링크 8건 때문에 실패 상태이며 이를 Phase21 오류로 집계하거나 수정하지 않았다.
- git diff 기준 추적된 제품 소스·테스트·CI 변경 0개를 확인했다. 신규 Phase21 문서와 기존 미추적 실무시험 자료는 별도로 보존했다. 문서 검사는 수치 회귀 PASS가 아니다.

## 2026-09-10 — M0 구현 착수·집중 검증

- 사용자 승인으로 M0~M7 순차 개발을 시작했다. 브랜치 `work/phase21-consistency-20260910`, 원래 source/실무시험 1,029개·18,525,436 bytes를 `output/phase21/m0-baseline`에 보존했다. baseline manifest SHA-256은 `17e4de381a2cf99f032925ea2ee8c1ab897f9505179dc4a333fd9377fc7e1132`다.
- Direct seed/반복/임계하중을 같은 affine 구속계로 연결하고 CPU/async partition에 단계별 강제변위와 복원을 적용했다. 축약 DOF를 `%6`으로 분류하는 stability 경로를 명시적 좌표 종류로 바꿨다. 다이어프램 구속 내력과 가상일 검사를 추가했다.
- 비공면·중복/잘못된 group 및 conservative dense working-set admission을 추가했다. 초기 예산 512MiB와 추정 `240*fullDOF²`를 사용한다. 이는 실제 heap 측정 결과가 아니며 전체 자원 관리는 M5 대상이다.
- 신규 집중 시험은 대칭 2기둥 scalar condensation, 편심 4기둥 3-DOF 평형, 3층 독립 planar assembly, P=0, 강제변위, 불안정·잘못된 입력, CPU 제품·reference hybrid를 통과했다. 실제 GPU 자격은 없으므로 제품 GPU의 강체 Direct는 명시적으로 차단했다.
- 복원 상가주택의 MAX-EX-P Direct는 수렴했고 dmax=0.009505956274493006m, 평형잔차=6.547587611234594e-13이었다. 원본 입력과 hash가 다르며 아직 M1~M6 수정·재검증 이전 결과다. 과거 요약의 designBlocked/equilibriumFailureReason 잔존은 M3 상태 수정 대상으로 유지한다.
- 기존 P6 Direct, P9 hybrid, P10 MPC 집중 회귀를 통과했다. P20 exact 비교는 새 productVersion에서 처음 실패했다. 과거 golden은 보존하고 테스트에 명시한 v3→v4 출처 버전 전환만 허용한 뒤 7개 수치·자격 결과의 exact 동일성을 확인했다. 숫자·자격 차이는 허용하지 않았다.
- Phase21 M0 회귀 manifest 117개를 생성했다. M1~M7 시험은 아직 포함하지 않으며 고정 후보 실행은 다음 단계다.

## 2026-09-10 — M0 마감·M1 진입

- 고정 source e15e8b4를 archive한 clean checkout에서 117/117 PASS. 원시 로그와 validation.json을 `verification/evidence/phase21/m0/r1`에 보존했다.
- 수치 runtime 변경 없이 시험에 독립 임계하중, 90도 좌표 회전, 일반 MPC+diaphragm, spring 지점 P=0 비교를 추가해 집중 실행을 통과했다. 이 추가 실행을 원래 117개 실행 로그에 섞어 쓰지 않는다.
- 독립 실행한 fixture suite의 max RSS는184,812KiB, elapsed 2,103.5ms였다. module import·reference hybrid까지 포함한 단일 관측이며 성능 개선율이나 leak/M-tier qualification으로 해석하지 않는다.
- M0를 수평 XY 소회전 강체 다이어프램·CPU f64 범위로 마감한다. 실제 GPU 자격 차단, release/unilateral/0강성 연결·명시적 prescribed API 등 기존 제한은 유지한다. M1 RC 수치 계약 수정에 진입한다.

## 2026-09-10 — M1 RC 계약 후보

- 공통 치수 검증으로 SQUARE의 높이 대체를 제거했다. 400×400 예비 휨내력 양축 224.91 kN·m를 독립 식으로 확인했다. Vy/Mz 및 Vz/My 축, 명시 역할과 기하 분류, 역할별 철근 경고를 수정했다. 치수/축 수정은 같은 RC 계약 후보에 포함하되 시험 기대값을 별도로 구분했다.
- 단면·강도·배근 결측/비유한 입력은 NOT_CHECKED와 null로 반환하고 UI도 미검토 철근량/비를 0으로 표시하지 않는다. 보 P-M은 N_A, 기둥은 같은 조합·위치의 부호 있는 동시 수요로 평가한다. 단독 검토의 수요 출처도 각 성분의 위치를 사용한다.
- 실제 배근 상세 설계 또는 설계 전달 자격을 획득한 것은 아니다. 예비 철근비와 제공 면적을 구분하며 designTransferAllowed=false를 유지한다. 고정 후보 집중 회귀를 다음 실행으로 기록한다.

## 2026-09-10 — M1 고정 검증·M2 입력 후보

- a06fc55 clean archive의 RC 집중 회귀 5/5 PASS. 증거는 verification/evidence/phase21/m1/r1.
- wizard의 go/preview에서 saveBasis를 제거하고 명시 적용 버튼을 추가했다. 전체 입력 hash와 초안 기준을 비교해 에이전트 변경 후 덮어쓰기를 거부한다. 지역/지반/중요도 누락도 수정했으며 미확인 시작값 상태를 보존한다. 기존 wizard 시험은 명시 적용을 추가해 새 동작으로 통과했다.
- 실제 index loadBookData의 envelope version===1 분기를 확인했다. format을 먼저 판별하는 adapter에서 v1 product-book을 검증 후 legacy 3D 경로에 전달한다. 현재 schema 모델에 legacy migration 기본 alias를 주입하지 않으며, 입력 자체의 alias 충돌은 여전히 거부한다. 원본·변환 hash와 schema를 별도 migration 진단에 보존한다. 서버 저장도 current schema를 사용한다.
- 원본 파일 및 과거 결과 hash는 재작성하지 않는다. 저장 복구 lifecycle/내구성과 실제 브라우저 화면 검증은 M5/M6에서 계속한다.

- M2 r1 고정 회귀는 6/7이었다. 이전 native autosave의 envelope version 누락을 새 guard가 거부하는 호환성 오류를 확인했다. 알려진 무버전 product-book만 legacy 호환 입력으로 허용하고, 명시한 미지원 버전은 계속 거부한다. 실패 로그를 r1에 보존하고 수정 후보를 r2로 재검증한다.

## 2026-09-10 — M2 마감·M3 실행/선택 후보

- 64e5101 clean archive M2 r2는7/7 PASS. 무버전 legacy 호환성 실패를 수정하고 원래 실패 r1도 보존했다.
- 실제 indexBridge→elasticAnalysisService→Worker에서 settings.comboId를 전달하면서 전체 모델을 실행한 원인을 수정했다. 제품 서비스에서 조합 존재를 검증하고 계약 준비 이전에 범위를 제한한다. 실제 Worker 회귀에서 전체20 solve/한 조합1 solve 및 같은 선택 수치를 확인했다.
- 숫자/그림/native canvas가 같은 pure selector를 사용한다. 명시한 조합 누락에서 포락으로 대체하지 않는다. 실패·running·stale 선택은 이전 그림을 숨기고 과거 성공 기록은 별도 보존한다. 관련 과거 회귀의 active successful display 유지 조건을 새 표시 계약으로 변경했다.
- 보정 후 Direct 평형 PASS와 보정 전 designBlocked=true/EQUILIBRIUM_LIMIT_EXCEEDED가 공존한 원인을 수정했다. 다른 독립 실패 사유는 유지하며 productVersion을 p21-m3-direct-pdelta-product-v5로 올렸다. Phase20 원본 golden은 보존하고 해당 Direct 평형 요약 두 필드만 원인에 맞춰 이행한 뒤 나머지 수치/자격을 exact 비교한다. 초기 비교 실패와 수정 후7fixture PASS를 기록한다.

## 2026-09-10 — M3 마감·M4 보고서 후보

- c28624e clean archive M3 집중 회귀10/10 PASS. 실제 Worker 한 조합, Direct 독립 기준 및 기존 UI/이력/WebMCP 경로 포함.
- 검토의 canonical check와 설명 message를 분리하고 run/조합/대상/종류/checkId의 유일키를 부여했다. N_A는 보의 기둥 검토 및 강도조합의 층간변위에만 적용하며 필요한 입력 누락은 NOT_CHECKED로 남긴다. 실패 체크 수·부재 수·대상 수·설명 수를 구분한다.
- 각 출처의 최대변위와 평형을 보고서 snapshot에 결속하고 projectId, build/rule binding hash, 실제 sourceRevision이 있을 때만 기록한다. reportSnapshot 숫자 null이 Number(null)=0이 되던 경로도 수정했다.
- 원본 HTML/JSON/CSV에 동일 snapshot 식별자·요약을 보존한다. UTF-8 byteLength/SHA-256과 기존 UTF-16 문자 offset을 명시하고 12,000자 조각 전용 조회를 추가했다. 전체 보고서 getReport clone 대신 immutable 문자열 slice와 작은 design metadata를 읽는다. 범위 오류와 stale 상태를 검증한다.
- 새 회귀는 실제 RC 해석/예비 검토에서 NG2, NOT_CHECKED2, N_A2, 설명2를 따로 확인했고 원본3포맷을 끝까지 읽어 Node crypto SHA-256과 비교했다. 교차 실행 회귀는 시간에 따라 다른 analysisRunId뿐 아니라 그 ID를 포함한 checkKey를 수치 비교에서 제외한다. 수치/검토 상태는 그대로 비교한다.

## 2026-09-10 — M4 마감·M5 메모리/복구 후보

- c3d66df clean archive M4 10/10 PASS. 원본3포맷과 실제 보고서/PDF 차단·출처 회귀를 포함한다.
- core/resourceBudget에서 256MiB 보수적 retained-data 계상과 저장소 entries/bytes를 적용한다. 실제 JS heap 상한이 아니다. 분석/설계 catalog·plan/request·input undo·prepared views/scratch·WebMCP·탄성/비선형 jobs·활성 모델을 같은 ledger로 관측한다. static Worker 계약 준비 전512MiB 보수적 working-set admission을 둔다.
- 내부 immutable 분석 결과는 catalog가 소유하고 이력/완료 job/native 마지막 결과가 참조한다. 과거 run-store 전체 복제와 result/legacyRecord의 이중 복제를 줄였으며 외부 반환은 수정 격리를 유지한다. 8절점 sample의 계상 보유량은 초기 탐색33.29MB에서 약9.32MB였다. 계상/소유권 수정과 실제 복제 제거를 함께 포함하므로 heap 성능 개선율로 표시하지 않는다.
- job dispose에서 abort/worker 종료/Map 해제를 연결했다. 취소 뒤 늦은 publish를 차단하고 실패 retry 입력은 보존한다. prepared view 취소는 signal을 전달하고 아직 끝나지 않은 builder를 activeWork/cancellationPending으로 계속 표시·계상한다. 취소를 무시하는 임의 Promise를 해제 완료로 숨기지 않는다.
- 보고서 읽기2+대기8을 적용해16개 동시 요청 중10개 수용/6개 RESOURCE_QUEUE_FULL을 검증한다. 새 체크포인트는 모델·완료 catalog·원본 보고서를 한 브라우저 transaction에 저장하고 SHA-256/read-back을 확인한다. 저장 없음/quota 실패를 durable 성공으로 반환하지 않는다. 복원 시 전체 hash·입력/보고서 관계를 확인하고 새로운 세션 handle로 같은 문자 offset부터 읽는다. 중단 분석은 interrupted/재실행 필요로 남기며 설계전달은 허용하지 않는다.
- 선택된 결과는 PINNED_RESULT로 퇴출을 막는다. 선택을 해제한 뒤 저장본과 현재 catalog/report가 완전히 같은 경우에만 releaseCheckpointedResults로 세션 메모리를 비울 수 있다. 저장되지 않은 결과는 자동 삭제하지 않고 예산 초과를 거부한다.
- Node 반복의 초기2warmup+30회는 slope46,263 bytes/cycle로 탐색 기준을 넘었다. 원시 자료를 m5/exploratory에 보존했다. code/metadata 계측에서 초기 JIT 증가를 관측해 고정10warmup+30회 프로토콜을 resource-budgets.json에 기록했다. 후속 탐색은 heap mean 증가 약0.30MB, slope약12.5KB/cycle, 최대RSS약129,540KiB였고 매번 ledger0/늦은 publish0이었다. 작은 양의 heap 변화가 있으며 renderer/M규모 무누수 증거로 확대하지 않는다.
- checkpoint adapter 시험은 약11.11MB 원본을 저장·새 runtime 복원·세 포맷 동일 SHA 확인했다. 실제 IndexedDB·reload·host 수명·S/M 부하는 M6에서 수행한다. 원래 세션 초기화의 원인은 여전히 UNKNOWN이다.
- 영향 탐색 중 과거 p9-m9-ui-agent의 Phase15 차단 잔존 assertion은 Phase20 해소 상태와 불일치했다. 기존 Phase21 실행 manifest에는 없는 역사 시험이며 수정하지 않는다. Phase20 모듈 경계 현재 회귀는 통과했다. WebMCP host의 고정36개 assertion은 체크포인트4개 도구를 추가한40개 계약으로 갱신했다.

## 2026-09-10 M5 고정 후보 검증 및 M6 착수

37aced6 집중 검증 18/18 통과. verification/evidence/phase21/m5/r1에 원본 로그·환경·hash를 보존했다. 관리 데이터 9,323,296 bytes, peak 계상 28,358,016 bytes는 실제 renderer heap이 아니다. Node 반복 GC 관측과 초기 실패는 별도 보존한다.

M6 전체 회귀 r1에서 p19-m5-nonlinear-contract의 dispose 후 기록 보존 기대값과 이전 도구 수 36이 새 계약과 충돌했다. dispose 뒤 JOB_NOT_FOUND 및 도구 40으로 명시적 계약 migration; 수치 기준 변경 없음. 집중 재실행 통과. 최종 전체 재실행 필요.

Node 실제 Worker pilot r1은 증거 추출 DTO 경로와 동일 조합 중복 보고서 요청 오류로 실패, 원본을 보존했다. r2는 selection.result를 읽고 Direct X/Y를 해당 조합의 보고서 원본으로 선택해 22회 해석 및 HTML/JSON/CSV 원본 SHA 일치 통과. 브라우저 검증을 대신하지 않는다.

실제 내부 브라우저 localhost:5173에서 도구 40개 등록 및 시작 화면 캡처. 127.0.0.1 탭의 이전 autosave confirm이 제어 시간 초과를 유발했고, 독립 origin에서 재진입했다. UI 파일 chooser는 시간 초과; 원인 분류 중이며 가져오기 PASS로 기록하지 않는다.
