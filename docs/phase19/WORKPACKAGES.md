# Phase 19 작업 패키지

계획 v1 · 2026-09-07 · [전체 목표](README.md) · 실제 상태는 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)

각 작업은 코드, 의미 있는 회귀시험, 현재 버전의 증거, 사용 문서까지 완료해야 닫는다. M0~M1의 구현 API는 [구현 계약](M0_M1_CONTRACT.md)을 따른다. M2·M3 구현은 각 계약 문서와 진행 상태를 따른다. M4 이후 신규 파일명·도구명은 구현 전 제안이다.

## M0 — 기준선과 지원 범위 확정

- 개발·공개 커밋, 패키지 SHA, 브라우저/Node/OS, 현재 변경 파일을 보존한다. 사용자 변경과 기존 봉인 증거를 덮어쓰지 않는다.
- UI·Agent·WebMCP·제품 서비스별 기능 대응표를 자동 추출한다. 존재, 실행 경로, 내부 시험, 독립 자격, 공개 도구 여부를 구분한다.
- Phase 8 Q1/Q4/Q5, Phase 15 미해결 High와 자격 조건, Phase 18 PMM 조립 연계 항목을 현 코드에서 재감사한다. 과거 건수를 현재 건수로 복사하지 않는다.
- 최종 후보에서 실행할 필수 시험 목록을 고정한다. historical runner의 출력 경로를 별도 checkout으로 격리한다.
- M-tier 모델·기준 장비·메모리/응답/취소 예산과 외부 비교 2건 및 pilot 5건의 출처·검토 담당을 목록화한다.
- **완료:** 모든 대상 기능이 상태표에 있고, 미확정 입력·기준이 명시되며, 새 검증 출력 폴더와 기준선 manifest를 재현 가능하게 생성한다.

## M1 — 공통 입력·실행·설계 결과 계약

- 기존 제품 서비스와 실행 기록을 기준으로 설계 서비스 경계를 정의한다. UI 또는 WebMCP 전용 solver 분기를 금지한다.
- `inputIdentityVersion`, model/case/settings/designBasis/material/section/rulePack/build 식별자를 정의한다. 기존 16자리 해시와 WebMCP 64자리 해시를 문자열로 직접 비교하지 않는다. 이전 기록은 원래 의미를 유지하며 명시적 변환/호환 판정만 제공한다.
- 해석은 `analysisRunId`, 설계는 `designRunId`를 발급하고 설계 결과에 source analysis run IDs 및 조합별 출처를 기록한다.
- `executionStatus`, `qualification`, `designReviewStatus`, `designTransferAllowed`, `stale`를 분리한다. 계산 완료가 설계 승인 상태를 바꾸지 않는다.
- 비선형 결과를 탄성 설계수요에 자동 대입하지 않는다. 결과 유형·단위·축·부호·조합·자격을 검사해 검증된 mapping만 전달한다. 비선형 결과의 열람·보고서는 설계전달 여부와 별도로 제공한다.
- 조회 API의 `lastResult || analyzeForIndex()` 등 숨은 계산을 결과 저장소 조회와 명시적 실행으로 분리한다.
- **완료:** 조회 시 solver/설계 실행 횟수 0, stale 입력은 적용·설계전달 거부, 같은 입력의 세 진입 경로는 동일 canonical result를 생성한다.

## M2 — 탄성설계 입력과 모델 변경

- 기존 [설계기준 변경안](../../src/design/designBasisChangeSet.js)과 [하중조합 변경안](../../src/loads/loadCombinationChangeSet.js)을 재사용한다.
- 설계기준·하중·질량·조합, 재료/단면 할당, 기존 엔티티 설계 속성, 해석 케이스 생성/수정을 타입별 명령으로 제공한다.
- 변경안은 원본 revision/hash, 영향 부재, 단위, 이전/다음 값, 검증 경고를 포함한다. 적용 시 동일 입력과 정책을 다시 검사하고 원자적으로 반영한다. 실패 시 부분 변경 0, 성공 시 Undo 한 단계와 결과 무효화를 수행한다.
- UI와 Agent는 같은 preview/apply 서비스를 호출한다. 기존 승인·역할 정책을 재사용하고 에이전트가 reviewer 신분이나 검토 서명을 만들어 넣지 못하게 한다. 이미 허용된 일반 편집에 별도 반복 승인 절차를 추가하지 않는다.
- 질량·풍/지진 설정 등 해석을 바꾸는 필드를 무시한 채 성공 반환하지 않는다. 범위 밖 필드, NaN/Infinity, 잘못된 단위·ID를 거부한다.
- **완료:** 강재·RC fixture 각각 UI 조작과 도구 변경의 canonical model이 일치하고, 중복·변조·stale·부분실패·Undo 시험을 통과한다.

## M3 — 탄성해석과 설계 검토 서비스 연결

- 현재 전체 탄성해석 서비스와 개별 제품 케이스를 연결한다. 정적/P–Delta/모달/RSA/좌굴/선형 THA의 의존 순서를 명시한다.
- P–Delta는 현재 static 케이스의 method/settings로 관리되는 경로를 기준으로 정규화한다. UI 이름을 새 case kind로 그대로 추가하지 않는다.
- 강재·RC, 사용성, 부재 설계수요, 기존 접합/기초 검토를 완료 해석 기록에서 실행한다. 설계 계산의 실행과 결과 조회를 분리한다.
- 설계 규칙 적용 범위와 미구현 항목, 지배조합, 축·부호·단위, 기준 버전 및 식 출처를 결과에 포함한다. `NOT_CHECKED`와 `WARN`을 PASS로 집계하지 않는다.
- 보고서는 같은 설계 snapshot에서 생성하며 UI·JSON·PDF의 지배값과 상태를 대조한다. 기존 Phase 11 export 작업을 재사용한다.
- Pages에서는 우선 HTML·JSON·CSV와 브라우저 인쇄 경로를 검증한다. 자동 PDF 생성은 실제 transport가 있는 Node/데스크톱 환경에서 별도로 검증하고 capability로 알린다. transport가 없으면 다운로드 성공이나 PDF 완료를 반환하지 않는다.
- **완료:** 강재 골조와 RC 골조가 입력→해석→검토→보고서까지 각 1개의 추적 가능한 워크플로로 실행된다. 결과가 없는 조회는 계산 대신 명확한 누락 상태를 반환한다.

## M4 — WebMCP v2와 작업 화면

- v1의 9개 도구는 기본 호환성을 유지한다. 신규 타입·필드는 버전과 capability로 알리고 지원하지 않는 엔진을 열거하지 않는다.
- 아래 제안 도구를 공통 서비스에 연결한다. WebMCP에서 임의 JavaScript, 임의 파일 경로, 무제한 `execute(action,payload)`를 제공하지 않는다.

| 제안 도구 묶음 | 서비스/행동 | 부작용 |
|---|---|---|
| `get_workflow_context`, `get_design_context` | 작업 위치·부족 입력·현재 결과/검토 상태 | 조회 |
| `preview_design_changes`, `apply_design_changes` | 제한된 설계 입력·하중·조합·할당 변경 | preview / 명시적 모델 변경 |
| `preview_analysis_case`, `apply_analysis_case` | 케이스 생성·수정과 변경 영향 확인 | preview / 명시적 모델 변경 |
| 기존 validate/plan/start/status/result 도구 | 개별 케이스; typed workflow 입력으로 전체 탄성 실행 연결 | 실행 도구만 계산 |
| `plan_design_review`, `start_design_review`, `get_design_result` | 완료 해석 기반 설계검토 | start만 계산 |
| `plan_report_export`, `start_report_export`, `get_report_artifact` | 고정 snapshot의 보고서 생성·파일 확인 | start만 생성; 외부 발송 없음 |
| `set_workspace_view` | 모델링·탄성설계·비선형·보고서 화면 전환 | 화면만 변경 |

- 문자열 경로 자유 조회보다 typed result 채널과 페이지네이션을 우선한다. 기존 v1 slice 계약은 유지한다.
- 입력 크기·엔티티 수·세션 요청 예산, 응답 크기, 중복 request ID 규칙을 정한다. 같은 ID에 다른 요청 내용은 명시적 충돌 오류로 반환한다.
- index 직접 등록과 app 호스트 등록을 모두 구현한다. 같은 origin, 현재 iframe source, nonce/session/project binding을 검사하고 프로젝트 전환 시 취소·핸들 폐기한다.
- UI에 도구 준비 여부, 마지막 작업·변경점, 결과가 오래되었는지, 현재 지원 범위를 표시한다. 미지원 브라우저도 정상 조작할 수 있어야 한다.
- **완료:** 실제 Site tools로 강재·RC 워크플로를 수행하고 UI 실행과 입력·결과·보고서 출처가 일치한다. 두 진입 URL·프로젝트 전환·미지원 환경을 확인한다.

## M5 — 비선형 공통 경로와 상태 감사

- 기존 async router, nonlinear service, Worker, 초기상태·trial/commit/revert를 재사용한다. legacy Pushover/SDOF demo와 모델 기반 MDOF 엔진을 명확히 구분한다.
- 엔진 ID, 제어 방법, 재료/단면 모델, DOF·질량·감쇠·경계조건·단부해제의 지원 조합을 preflight로 검증한다. 생산 케이스의 조용한 legacy fallback은 금지한다.
- 중력 초기상태와 후속 해석 연결, 실패 increment의 완전 rollback, checkpoint의 입력/재료/solver/build 호환성을 검증한다.
- P14 load control과 기존 P8 제품의 displacement/arcLength 설정 필드·capability 차이를 재현하고 하나의 명시적 mapping으로 정리한다. 의도된 제한과 연결 결함을 구별한다.
- 기본 자동힌지는 현재 `assumed`이고 변형한계의 reference가 없다. 프로젝트 가정값과 출처가 검증된 규칙을 구분하고 해당 fixture의 재료·이력·한계값 출처를 고정한다.
- 비선형 WebMCP에는 기존 `previewAssignments/applyAssignments`를 typed `preview_nonlinear_assignments/apply_nonlinear_assignments`로 연결한다. 공통 validate/plan/start/status/result/cancel 경로에 생산 Pushover·NLTH를 순서대로 추가하고 `get_nonlinear_history`, `explain_analysis_failure`, `resume_analysis`로 bounded 이력·진단·호환 checkpoint 복구를 제공한다. 도구명은 제안이며 M6/M7 검증과 함께 활성화한다.
- 자격 판정은 engine/build/input 범위에 결속된 단일 resolver에서 읽는다. candidate를 코드 상수 변경으로 verified로 승격하지 않으며 runtime에서 verification oracle을 import하지 않는다.
- SH1 zero-length PMM 재료가 실제 모델→요소 registry→전역 조립→반복 해석에 연결되는지 확인하고 누락을 보완한다. 커널 단일점 PASS로 전체 경로를 완료 처리하지 않는다.
- **완료:** 미지원 입력을 실행 전에 차단하고, 실패·취소 후 재실행에서 잔류 trial state가 없으며, production engine ID가 UI/도구/기록에 일치한다.

## M6 — Pushover·fiber·PMM 검증과 UI 연결

- 단조 집중힌지 → cyclic 재료/단면 → fiber 부재 → 골조 순으로 검증한다. 재료 접선은 독립 수치 미분과 비교한다.
- 중력→변위제어 Pushover의 하중패턴, control node/DOF, 수렴·cutback·증분 최소값·종료 조건을 노출한다.
- arc-length는 정점 이후 경로와 general/indefinite solver의 검증된 조합만 허용한다. 미수렴과 물리적 한계/불안정 종료를 구별한다.
- 용량곡선·층간변위·소성회전·힌지 상태·PMM 여유·평형·에너지·수렴 이력을 같은 run에서 표시한다. SP1/SH1 단일 대표값 외에 전체 응답 경로를 검사한다.
- **완료:** 탄성한계 일치, 항복·반전·제하·재하, 증분 세분화, rollback, 골조 변위/반력/용량곡선과 외부/독립 비교가 사전 기준을 충족한다.

## M7 — MDOF 비선형 시간이력

- 기존 Newmark/Newton 엔진의 전체 모델 질량·감쇠·내력·접선 조립을 감사한다. SDOF demo는 별도 이름과 결과 종류를 유지한다.
- 입력 지진파 단위·dt·축·스케일·길이·다성분 시간축, 초기 중력상태와 감쇠 모델을 명시한다. 감쇠 강성 선택에 따른 비물리적 힘·에너지를 검사한다.
- 실패 step을 rollback하고 substep으로 재적분한다. 부분 결과의 마지막 수렴 시각과 종료 이유를 기록한다. 끝까지 못 간 실행을 completed/PASS로 반환하지 않는다.
- 시간별 변위·속도·가속도·반력·잔류변형·힌지 응답 및 운동/탄성/소성소산/감쇠/입력 에너지 항목을 제공한다.
- **완료:** 선형한계가 선형 THA와 일치하고, 독립 비선형 SDOF anchor 및 MDOF 골조를 비교하며, dt/2·dt/4 수렴과 에너지 감사·재시작 동등성을 통과한다.

## M8 — 작업 관리·성능·복구

- 공통 job adapter로 elastic/nonlinear/design/report 작업의 생성·진행·취소·오류·조회 상태를 연결한다. 기존 제품/Worker 수명주기를 재사용한다.
- 동시 실행 제한, 시간·메모리·결과 보존 예산, queue 취소와 실행 중 취소, Worker 종료 시 terminal state를 검증한다.
- `async` 반환과 `cancelled` UI 표시만 검사하지 않는다. 현재 일부 탄성 경로의 동기 계산을 확인하여 공개 kind마다 실제 UI 응답과 계산 중단을 측정하고 필요한 Worker 연결을 보완한다.
- 완료 결과는 입력 snapshot과 함께 재열람 가능하게 한다. 진행 중 페이지 종료는 `interrupted`로 기록하고 재접속 후 완료로 보이지 않게 한다.
- 수치 checkpoint resume와 실패 입력 수정 후 retry를 구분한다. build나 모델이 달라지면 checkpoint resume을 거부하고 새 실행을 만든다.
- **완료:** 19A는 공개 탄성/설계/보고서 종류의 조작성·취소·복구·자원 시험, 19B는 여기에 M-tier Pushover, 19C는 M-tier NLTH까지 고정 장비/예산에서 통과한다.

## M9 — 독립 비교·제품 표면 대조·회귀

- [검증계획](VALIDATION_PLAN.md)의 필수 matrix를 실행한다. Node만으로 실제 WebMCP 실행을 대체하지 않는다.
- 현행 코드에서 기존 Critical/High finding을 다시 판정하고 적용 범위의 미해결 항목을 닫는다. 범위 밖 항목도 전체 production 판정에서 숨기지 않는다.
- 외부 비교 2건과 기존 pilot 5건은 입력·출처·실행·독립 검토 기록을 구분한다. 자료 미확보는 BLOCKED로 유지하며 숫자를 만들어 채우지 않는다.
- **완료:** final candidate 동일 코드/의존 버전에서 필수 시험 누락·실패·timeout·flake 0, scope별 자격/제한 보고서 생성.

## M10 — 공개 패키지와 배포

- clean checkout에서 소스·런타임·검증 결과와 manifest를 생성한다. 변경 파일은 공개 이력에 명시하고 원래 봉인 자료는 유지한다.
- Windows·Ubuntu CI, 실제 지원 브라우저의 index/app 워크플로, HTTPS 배포와 Node 환경을 각각 검증한다.
- README는 기능별 지원 범위와 19A/B/C 상태를 표시한다. 과거 21개 비교와 이번 새 검증을 섞지 않는다.
- build/입력/규칙/결과 식별자를 추적하고 Release 첨부 해시와 실제 배포 파일을 대조한다. 이전 버전으로 되돌리는 절차를 검증한다.
- **완료:** Release 후보에서 검증한 동일 산출물이 배포되고, 상태 문서가 실행 증거를 링크한다. 독립 자격이 미완료이면 개발 프리뷰로 표시한다.
