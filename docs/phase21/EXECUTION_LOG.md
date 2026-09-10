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

## 2026-09-10 M6 실제 저장 장애와 수정 후보

- 실제 IAB r1에서 20조합+Direct X/Y+보고서 후 CHECKPOINT 저장이 MANAGED_MEMORY_BUDGET_EXCEEDED로 실패했다. 초기 M5 집중 18/18은 보존하며 전체 pilot 저장 gate를 재개했다.
- v2 저장은 결과/보고서 필드별 분할, JSON 길이 사전 계상, 원자적 IndexedDB transaction, 조각별 SHA 검증, 이전 세대 정리, v1 읽기 호환을 구현했다. immutable snapshot을 공유하고 복원 시 catalog/UI 전체 복제를 제거했다.
- Node pilot r3는 저장/복원은 성공했으나 시험이 제품 import를 생략해 입력 hash 비교 실패. r4는 extractProductModel을 거쳐 IAB와 같은 5660492c 입력 hash로 22회 해석, 20조합 검토, 세 원본 형식 SHA, 저장/복원 일치 통과. peak managed 208710774 bytes, maxRSS 889132 KiB; 반복 leak 수치가 아니다.
- 실제 IAB r2에서 52488161 bytes 저장 후 reload/복원 성공. 저장 SHA 9bcd63246c249899557e1241098a4f2ccc6772f14cf436ab8d9d41c60fbc318b. 실제 UI 다운로드 HTML/JSON/CSV 모두 native manifest SHA 일치. download 이벤트 통지는 timeout이지만 실제 다운로드 파일은 확인했다.
- 복원 뒤 이전 샘플의 combo/status UI 잔존을 발견해 조합 목록 재구성, 이전 상태 표시 해제, 복원 review 화면 연결을 수정했다. PDF 자동 내보내기는 adapter/figure/qualification 3조건 미충족으로 BLOCKED 유지.
- 전체 회귀 r1은 122/123이며 이전 dispose 계약 테스트 한 건 불일치였다. 해당 계약 이관은 13c5809에 기록됨. 새 저장 후보 전체 회귀는 별도 r2로 수행한다.

## 2026-09-11 M6 회귀 및 M7 준비

- 78e8e5a 고정 후보 전체 회귀 124/124 PASS. 원래 r1의 122/123 실패 기록과 r2 전체 로그를 별도 폴더에 보존했다.
- IAB 실제 IndexedDB transaction 중단/원복/overwrite 세대 정리/변조 검출 PASS. 보고서 원본 3포맷 실제 UI 다운로드와 native SHA 동일.
- 125절점, 260부재, 750 full DOF, 4층 다이어프램 M fixture를 명시했다. 시험 loader 초기에는 bridge 자동 UI 설치에 모델이 없어 오류; 모델 초기화 후 document 이벤트로 시험을 시작했다. 측정 완료 전에는 M gate PASS 아님.
- Chrome 업로드는 확장 프로그램 파일 URL 권한으로 차단되어 사용자 설정 요청. IAB 업로드·다운로드·복구 증거로 Chrome 비교를 대체하지 않는다.
- M7 Phase21 재사용 CI 및 Pages release-gate 연결 준비. 미충족 항목에 실제 배포를 허용하지 않는다.

- 44b6d19 공개 push는 자동 승인 검토에서 현장 모델 파생 자료 묶음의 구체적 공개 승인 부족으로 거부. 우회하지 않고 사용자에게 코드+검증 자료 또는 코드만 공개 범위를 질문했다. GitHub 원격 변경 없음.
- M 브라우저 첫 반복 M-FIRST/M-DIRECT 모두 ANALYSIS_NOT_COMPLETED. 실제 하위 오류를 보존하도록 workflow 오류 전달을 보강하고 별도 Node/Chrome 진단 시작. M 게이트는 FAIL 상태이며 완료로 전환하지 않았다.
- checkpoint 동시 조회도 active1/queue8로 직렬화. 16요청 중9접수/7거부 계약 시험 PASS. 변경 후보1572661은 초기78e8e5a 전체통과와 구분한다.
- 27쪽 PDF를 모두 PNG로 렌더링하고3개 contact sheet로 누락·잘림을 확인했다. 단계 캡처는21개이며 HTML/JSON/CSV는 별도 원본이다.

## 2026-09-11 M6 중간 규모 등록 실패 원인 및 수정

- Node r2에서 analysis-catalog:1이 226735948 bytes를 요청했으나 기존 총량227445028 bytes와 합쳐256MiB 예산 초과. 계산 완료 뒤 등록 실패이며 비수렴이 아니다.
- 동일 fixture 동기 해석의 필드별 계상에서 dynamics가206636022 bytes였다. 정적 case가 모델의 기본 동적 해석까지 암묵적으로 수행하는 경로를 확인했다.
- 정적 case 정규화에 responseSpectrum.enabled=false를 명시하고 동기 경로도 일치시켰다. 독립 modal/RSA와 기존 analyzeModel 호환 API는 유지한다. 기존 입력의 동적 설정은 변경하지 않는다.
- 실제 Worker/동기 case 범위 회귀 PASS. 중간 규모 FIRST r3는3.51초, managed peak41060504 bytes, 등록 성공. r2의66.19초/실패와 구분하며 통제된 성능 인증 수치로 간주하지 않는다.
- Direct 포함 Node r4 및 실제 IAB 8회 반복·취소 시험 진행 중. 결과 전체 복사 최적화는 별도 위험을 고려해 아직 적용하지 않았으며, 실제 부하 통과 전에 M6 완료 판정을 내리지 않는다.

- 823591f 전체 회귀 m6-full-r3:124/124 PASS. Node pilot r5 전체22회·보고서·저장복원 PASS, 이전r4와 비어 있지 않은 변위/반력/부재력66개 묶음 동일. 수치 비교 준비 중 wrapper를 잘못 전달해 null끼리 비교한 임시 산출물을 발견했으며, available/비어 있지 않음 검증을 추가해66개 실제 데이터로 다시 계산한 최종 numeric-parity.json만 채택했다.
- Node medium r4 FIRST/Direct 모두 완료·등록, peak managed125063936 bytes, maxRSS1146408 KiB. Direct progress 0.85→완료 사이 약313초. 동시에 다른 검증이 실행되어 고정 환경 성능 qualification 아님.
- IAB 최신 product 서버에서 기존 checkpoint 복원과 D-only/Direct X/Y3회 재해석 PASS. 기존 보고서의 과거 run provenance는 유지한다.
- 시험용5174 브라우저에서는 수정 전 settingsHash a4979ce2가 계속 사용됨을 발견. 그8회 계획 실행은 첫 cycle에서 FAIL, 새후보 검증으로 제외했다. 실제 파일은 갱신되어 캐시 영향을 의심하며, no-store/조건부304제거 시험 서버5175와 시작 전 정적 실행 계약 검사로 재시험한다.
- PDF31쪽/24화면으로 갱신, 전체 페이지 렌더링 후 변경된 본문·추가 화면의 잘림/겹침 확인. 제품 자동 PDF capability와 별개다.

- 최신 IAB r3: D-only/Direct X/Y 완료 후61065575 bytes 저장, reload/복원 SHA98dfb9692cb0a2178734078f8ac8ccf433abed4d6adb88caeb7d8ee6e1d78034 일치. workflow가 시작한 job은 get_result_slice의 직접 시작 job session 권한에 포함되지 않아 읽기 거절. 우회하지 않고 실제 결과 UI와 workflow 상태로 확인했으며 이 조회 범위 제한을 기록한다.
- 최신 UI에서 custom case 결과의 전용 ribbon 버튼은 비활성 상태이며 케이스 결과 창에서 표시 가능. 복원 안내/전체 workflow 상태 문구와 개별 완료 상태가 혼동될 수 있어 후속 UI 개선 대상으로 남긴다.

## 2026-09-11 M6 화면 재시험 후 표시 경로 보강

- 패키지Chrome에서 statusTxt 접근성 이름이 최초3.38mm로 고정되고 화면은4.73mm로 갱신되는 불일치를 확인. statusTxt는 숫자 aria-label을 고정하지 않고 현재 텍스트를 role=status로 제공한다. 복원도 오래된 aria-label을 제거한다.
- 결과 ribbon 조회는 선택한 사용자 정의 case를 먼저 사용하고, 같은 종류의 기존 결과를 찾도록 보강. canonical run-all 생성 규칙은 그대로여서 사용자 case 설정을 덮어쓰지 않는다.
- p21-m3 실제Worker/사용자case선택/상태레이블, p7-m11 탄성UI, checkpoint segments3개 집중 검증 PASS. solver/Worker/해석 설정 모듈 변경 없음. 진행 중 중간 규모 브라우저 시험은 시작 시 로드한823591f 모듈을 사용하며 새UI 후보의 전체 자격으로 소급하지 않는다.

## 2026-09-11 M6 원본 단위 조회 오류 수정

- 실제 native start_analysis→get_result_slice에서 Direct 원본dmax0.009505956274493006에 units.displacement=mm가 붙는1,000배 오독 가능성을 재현했다. 원본 값은m이며 UI는9.505956mm이다.
- get_result_slice에 원본 단위/표시 단위를 분리하고 경로별 scalar/vector 단위 계약을 추가했다. 값은 변환하지 않는다. 혼합 레코드와 미인식/모달 필드는 임의의 단위를 추정하지 않고 field metadata 필요로 반환한다. 비선형의 기존 원본 단위 계약은 그대로 유지했다.
- 실제 solver 원본과 조회 값 동일, dmax=m, 표시mm,6DOF 병진/회전 단위 구분, 비선형 계약과M3회귀3개 PASS. solver/Worker 수치 코드는 변경하지 않았다.

- 18aa643 전체 회귀124/124 PASS. 296e8b8 원본 단위 수정은 실제IAB에서0.009505956274493006, valueUnit=m, displayUnits.displacement=mm, valuesRescaled=false로 확인했다.
- Direct 최대 증폭의 정의는 secondOrder.js의maximum-translational-component-ratio다. 최대변위9.505956/9.425820과 다른1.116 자체는 수치 오류가 아니다. 다만 다중 조합 화면에서 summary 전체 최대값을 우선해 선택 조합값을 무시하던 조회 오류를 수정하고 표시명을 절점 성분 최대 증폭으로 명확히 했다.
- 선택 조합1.2/다른 조합 전체최대9를 분리하는 회귀를 추가. 첫 기대 문자열1.200은 실제 숫자 포맷1.2와 달라 실패했으며 의미 있는 숫자 비교로 수정했다. M3/결과팝업/탄성UI3개 PASS. 수치 solver 변경 없음.
