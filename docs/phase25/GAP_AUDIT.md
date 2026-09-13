# Phase24 재점검 및 Phase25 이관 대장

2026-09-11 · 조사 결과 · 제품 코드는 수정하지 않음

## 조사 기준과 한계

- HEAD `ed24e04809957754cdde38e7b949d7c184a0fd2b`, branch `work/phase21-consistency-20260910`, 기존 dirty/untracked 작업 보존.
- [Phase24 계획](../phase24/WORKPACKAGES.md)의 완료 조건과 실제 호출 코드·필수검사·입력·도면·evidence를 대조했다. 이름이 있는 함수나 시험 파일의 존재만으로 완료를 판정하지 않았다.
- [기준선](../../verification/evidence/phase25/audit-20260911/baseline.json)에 기록한 구현 관련 767파일은 Phase24 4차 cohort와 해시가 일치했다.
- [6개 읽기 전용 관찰](../../verification/evidence/phase25/audit-20260911/observations.json)은 34ms의 합성 수요 평가다. 실제 solver·브라우저·건물·전체 회귀를 실행하지 않았다. 아래 재현은 수치의 실무 적합성을 입증하는 oracle 시험이 아니다.
- KCSC 공식 [API 안내](https://www.kcsc.re.kr/support/api)와 [기준 뷰어](https://www.kcsc.re.kr/standardCode/viewer/KDS)를 조회했다. 동적 페이지의 본문은 이번 웹 도구에서 추출되지 않아 새 판본/조항 검증으로 집계하지 않는다. 현재 조항 근거는 기존 공식 원문 9건과 [취득 manifest](../../verification/evidence/phase24/kcsc/retrieval-manifest.json)이다. 건축물 하중·내진·기초/지반·KS 철근 등 추가 규칙과 현행/프로젝트 적용 판본은 M0에서 확정한다.

분류는 **결함 재현**, **코드상 결손**, **연결/자격 잔여**, **정책/자료 잔여**다. 발견한 결손을 이번 조사에서 고쳤다는 뜻이 아니다. 우선순위 P0은 다른 마일스톤의 완료 판정을 오염시키는 선행 문제, P1은 필수 설계/업무 구현, P2는 표시·규모·인계 보강이다.

## 재현한 현상

| 관찰 | 실제 결과 | 의미 / 이관 |
| --- | --- | --- |
| A01 | RC 필수 `rc-code-compliance`가 `NOT_CHECKED/RULE_UNAVAILABLE`, summary.complete=false | 현재 이 행은 실제 집계 규칙으로 채워지지 않는다. RC 후보가 모든 검사를 끝내 자동 적용되는 정상 경로를 시험할 수 없다. G03/G20 |
| A02 | D 하중이 있는 모델에서 TOTAL 조합이 L만 포함해도 순간 처짐 OK/CLAUSE_APPLIED | 전체 사용하중의 완전성 검증 결손. 특정 현장 처짐의 오차를 측정한 것은 아니다. G03/G13 |
| A03 | service 조합에도 `rc-section-strength` OK 생성 | 서비스 수요로 강도 여유를 참고 계산하는 것 자체와 필수 ULS 충족은 구별해야 한다. 현재 검사 적용성/집계가 부족하다. G03 |
| A04 | [0,0.5] / [0.5,1] 배근 구간 입력은 허용되지만 경계 station은 AMBIGUOUS_REINFORCEMENT_REGION | 인접 구간의 포함 규칙이 입력과 평가에서 일치하지 않는다. G08 |
| A05 | 실제 공식 metadata에 존재하지 않는 `999 ...` 조항을 넣어도 CLAUSE_APPLIED | 문서 해시 검증은 조항 검증이 아니다. 내부 함수 경계의 관찰이며 외부 침입 가능성을 입증한 것은 아니다. G02 |
| A06 | xs=[0,3,1.5]를 일반 동시수요 adapter가 수용 | 처짐 모듈의 별도 station 검사는 있으나 공통 경계의 단조성/길이 검증이 없다. G05 |

## 이관 항목 32건

각 행의 목표 M은 주 책임 단계다. 다른 단계에 의존해도 한 행을 여러 곳에서 각각 완료로 세지 않는다.

| ID / 우선 | 확인한 결손과 영향 | 코드·문서 근거 | 목표 |
| --- | --- | --- | --- |
| G01 / P0 | 지원 구조시스템·재료/환경·판본·필수 규칙을 연결한 실행 가능한 프로파일이 없다. KDS 41 보완/우선 조항, 하중·내진·지반·KS의 추가 출처 대장이 필요 | [module inventory](../../src/metadata/designModuleCapabilities.js), [규칙 metadata](../../src/metadata/kcscRuleSources.js) | M0 |
| G02 / P0 | 문서 일치와 조항 적용 판정이 혼합됨. 조항 ID·구현 rule ID·적용 조건·변수·개정/보완 관계·검토 상태를 검증해야 함 | [designCodeBasis](../../src/metadata/designCodeBasis.js), A05 | M1 |
| G03 / P0 | 모든 조합에 고정 필수 목록 반복, ULS/SLS/장기/예상강도 적용성·요구 조합 coverage 없음. 전체 사용하중에서 D 누락 수용. code-compliance는 비어 있음 | [practicalEvaluation](../../src/design/evaluation/practicalEvaluation.js), [사용성](../../src/design/rc/kdsServiceability.js), A01~03 | M1 |
| G04 / P0 | 공통 router는 생겼지만 해석 직후 summary는 legacy steel/concrete, 별도 검토는 practical 중심이다. 서비스별 재계산·cache 소유권도 통합되지 않음 | [designEvaluation](../../src/design/evaluation/designEvaluation.js), [finalizer](../../src/compute/product/elasticAnalysisWorkflow.js), [review service](../../src/compute/product/elasticReviewService.js) | M1 |
| G05 / P0 | 공통 station 위치·정렬/중복·부재 길이·불완전 수요 검증이 덜함. Direct 선택 수정은 보존하되 모든 경로의 동일 수요/자격을 확인해야 함 | [동시수요 adapter](../../src/design/evaluation/practicalEvaluation.js), [Direct selector](../../src/compute/product/designCombinationSource.js), A06 | M1 |
| G06 / P1 | gross section 가정으로 배근-only 해석 재사용. 균열강성·장기/2차 영향·규칙 변경을 도입할 때 해석/설계/상세 의존성 재정의 필요 | [dependency identity](../../src/core/designDependencyIdentity.js), [workflow](../../src/compute/product/practicalWorkflowService.js) | M1 |
| G07 / P1 | 입력 기반은 구현됐으나 공칭 철근 제품/면적·연성/등급, 노출/피복·골재·부재 역할·내진 상세 등 규칙용 의미가 부족. 기하 직경 면적과 공칭 면적을 구별해야 함 | [typed fields](../../src/modeling/practicalInputContract.js), [stored geometry](../../src/modeling/practicalDesignInputs.js) | M2 |
| G08 / P1 | 인접 배근 구간 경계가 중복 판정됨. 겹침·공백·부재단·이음 구역의 소유권과 위치별 상세 필요 | [providedMember](../../src/design/rc/providedMember.js), A04 | M2 |
| G09 / P1 | KDS 단면 강도는 제한 구현. 고강도 중간값·범위, 기둥 세장/국부 2차 효과·강성/장기 조건과 Direct 조합의 적합성 검토 필요 | [kdsStrength](../../src/design/rc/kdsStrength.js), [providedSection](../../src/design/rc/providedSection.js), [dependency identity](../../src/core/designDependencyIdentity.js) | M3 |
| G10 / P1 | 일반 등단면 2다리 스터럽 전단만 KDS 연결. 비틀림·전단 조합/상한과 시스템별 요구 전단 미완성. 깊은보·개구부 등은 현재 명시 미지원 | [kdsShear](../../src/design/rc/kdsShear.js), [torsion fallback](../../src/design/rc/providedMember.js) | M3 |
| G11 / P1 | 간격·철근비·구속의 일부 계산은 사용자 mechanicsLaw 기준. KDS 최소/최대량, 역할/단부별 피복·횡구속의 실제 판정이 아님 | [providedMember](../../src/design/rc/providedMember.js) | M2 |
| G12 / P1 | 정착길이 함수와 실제 양단 형상·철근력·인장/압축 전환/이음 위치가 미연결. 후크 도형이 있어도 정착 검사는 geometryCheckRequired에서 중단 | [providedAnchorage](../../src/design/rc/providedAnchorage.js), [anchorage](../../src/design/rc/kdsAnchorage.js), [shape](../../src/report/phase24/barFabrication.js) | M4 |
| G13 / P1 | 순간 활하중·단일 전구간 RECT·무축력 단축휨만 제품 연결. longTermMultiplier 함수는 전체 workflow에 연결되지 않음. 균열폭·장기/부착 후 처짐·지점 변위/연속성 검토 잔여 | [serviceability](../../src/design/rc/kdsServiceability.js) | M3 |
| G14 / P1 | 특수접합 예상강도 전단은 외부 입력. 배근 변경으로 Mpr/접합 설계수요를 자동 재생성하지 않음. 중심·정렬·직교·일정 기둥 형상 제한 | [joint shear](../../src/design/connection/kdsJointShear.js) | M4 |
| G15 / P1 | joint-confinement/joint-anchorage 필수 항목이 placeholder. ordinary/intermediate/special 적용 구분·내외부 접합·배치와 강기둥/약보 등 시스템 규칙 확인 필요 | [rcJoint](../../src/design/connection/rcJoint.js), [fields](../../src/modeling/practicalInputContract.js) | M4 |
| G16 / P1 | 기초 자중 포함 여부를 선언만 함. 자동 합산·조합계수·상재토/부력·반력 회계·내부 휨/전단의 순분포하중 처리 미구현 | [providedFooting](../../src/design/foundation/providedFooting.js) | M5 |
| G17 / P1 | 기초 휨/일방향 전단은 명시적 mechanicsLaw 사용. KDS 단면/분배/최소철근, 상하부·역휨·기둥 위치와 위험단면의 일반 연결 잔여 | [providedFooting](../../src/design/foundation/providedFooting.js), [압력 적분](../../src/design/foundation/compressionContact.js) | M5 |
| G18 / P1 | 뚫림전단 product는 중심 내부기둥만 지원. 편심 모멘트 전달 4.11.7, 가장자리/모서리·기둥 위치·반력 공제/연장 철근 일치 미완성 | [kdsPunching](../../src/design/foundation/kdsPunching.js) | M5 |
| G19 / P1 | 활동은 μN, 전도는 합력 위치, 침하는 q/k 진단. 지반 조사/허용치 정의·부력·안정 계수·침하 방법을 확인한 KDS/지반 검토와 구별해야 함 | [providedFooting](../../src/design/foundation/providedFooting.js), [ground inputs](../../src/modeling/practicalInputContract.js) | M5 |
| G20 / P0 | 후보 완료가 전 모델 검사에 묶이고 항상 비는 필수 항목 때문에 autoApply 정상 경로를 닫을 수 없음. 영향 범위 충족·프로젝트 충족을 분리하고 NG/입력/규칙/실패를 구분해야 함 | [execute/score](../../src/compute/product/practicalWorkflowService.js), A01 | M6 |
| G21 / P1 | 후보는 단일 배근 구간의 동일 주근 직경·스터럽 간격·B/H 변경. 주근 개수/층/재배치·부재 그룹·단부 구속·접합/기초 후보가 없음 | [plan/execute](../../src/compute/product/practicalWorkflowService.js) | M6 |
| G22 / P1 | 후보 격리 재해석은 있으나 실제 적용은 requiredNext를 반환하고 종료. 적용 후 새 해석/재사용·새 평가·전후 보고·중단 복원 자동 연결 없음 | [applyCandidate](../../src/compute/product/practicalWorkflowService.js), [UI apply/reuse](../../src/ui/indexPracticalDesign.js) | M6 |
| G23 / P1 | 후보 solver가 동기 실행되어 계산 중간 취소/시간 한도 보장 없음. model clone·현재 여러 source set·job 데이터의 transient 메모리 계측/회수·Worker 필요 | [executeAnalysisCase 호출과 budget](../../src/compute/product/practicalWorkflowService.js), [export service](../../src/report/phase24/drawingExportService.js) | M7 |
| G24 / P1 | 개발용 제한 30부재/선택 set당300station/8source, 후보16개·10초·재해석120절점. 제품 사용 규모/응답 한도와 오류 설명·chunking/허용 프로파일 검증 필요 | [workflow limits](../../src/compute/product/practicalWorkflowService.js), [WebMCP limits](../../src/ui/webmcp/practicalTools.js) | M7 |
| G25 / P1 | straight/L90/J180는 한쪽 끝 중심선 형상. 양단/이음·교차/간섭·스터럽 hook/끝거리·기초 정착과 실제 가공 수량 미완성 | [barFabrication](../../src/report/phase24/barFabrication.js), [quantity creation](../../src/report/phase24/detailDrawings.js) | M8 |
| G26 / P1 | PDF 철근 일람은 처음8행, 많은 철근은 마크 표기 생략. 접합은 사각형/문구 개요. 실제 배근 상세와 전수 일람 페이지가 필요. 검사 추가분은 JSON 참조로만 넘김 | [detailDrawings](../../src/report/phase24/detailDrawings.js) | M8 |
| G27 / P1 | KDS 참조는 출력되지만 완전한 계산서에는 check별 적용 변수·대입식·중간값·수요/단면/판정 연결이 필요. 도면 생성 중 형상 길이도 계산함 | [code basis formatter](../../src/report/designCodeBasisFormat.js), [drawing builder](../../src/report/phase24/detailDrawings.js), [review report](../../src/report/phase19/designReviewReport.js) | M8 |
| G28 / P2 | UI 결과 첫20/50행 뒤 탐색이 없고, 단면 적용 후도 재사용 안내 문구. API 제한/설명과 서비스 실제 범위 일부 불일치; 부분 결과를 전체처럼 읽을 가능성 | [UI](../../src/ui/indexPracticalDesign.js), [tool schemas](../../src/ui/webmcp/practicalTools.js) | M9 |
| G29 / P1 | Book/체크포인트/undo 기반은 구현됨. 다음 규칙/상세/작업 상태 버전의 migration, 실행 중 중단·재접속·작업 replay·export stale의 전 경로 확인 잔여 | [workflowCheckpoint](../../src/compute/product/workflowCheckpoint.js), [restoreState](../../src/compute/product/practicalWorkflowService.js), [io](../../src/core/io.js) | M9 |
| G30 / P1 | 후속 종합검증 Q01~Q09, 독립 수치 대조·전체 메모리·환경/도면·출시 판정 미실행. 구현 잔여와 다른 종류의 미완료 | [Q 계획](../phase24/TDD_VALIDATION_PLAN.md), [집중 실행 내역](../../verification/evidence/phase24/final-20260911-04/SUMMARY.json) | M10→Q |
| G31 / P2 | 철골은 예비 부재검토, 목재/조적은 입력·지원경계. 전용 KDS 규칙/접합/자동 상세는 원래 후속 제안. RC 미완료와 함께 완료로 표시할 수 없음 | [router](../../src/design/evaluation/designEvaluation.js), [Phase24 범위](../phase24/README.md) | M0→E |
| G32 / P2 | 계획/아키텍처/TDD 문서에 '신설 제안/미구현' 과거 문장이 남고 일부 최신 기능표와 다름. README·capability·검증 cohort·배포 상태를 함께 정리해야 함 | [Phase24 정본](../phase24/README.md), [구현 상태](../phase24/IMPLEMENTATION_STATUS.md), [아키텍처](../phase24/TARGET_ARCHITECTURE.md) | M0/M10 |

## Phase24 인수 판정

| 기존 단계 | 보존할 실적 | 이관 이유 / 새 단계 |
| --- | --- | --- |
| M0 | 범위/TDD/fixture/공식 원문9건/선택 runner | 실행 가능한 전체 적용표·독립 근거 대장 미완결 → M0/M1 |
| M1 | 네 재료·치수·상세 typed UI/WebMCP 입력 | 규칙에 필요한 실물 의미·단부/환경·후속 입력 및 왕복 마감 → M2/M9 |
| M2 | dependency/stale/reuse/Book/checkpoint/undo | 균열/장기/새 작업 상태의 종속성과 호환 범위 마감 → M1/M9 |
| M3 | 동시 수요·공통 router·실제 Direct 선택 | summary/조합/적용성/완료·cache 통합 잔여 → M1 |
| M4 | 일부 KDS 강도/전단/순간처짐/정착 | 필수 상세·장기/균열·안정/비틀림·실제 단부 → M2/M3/M4 |
| M5 | 제한 부재 후보·격리 단면 재해석·명시 적용 | 후보 범위/완료 판정·실제 적용 후 자동 재계산/Worker → M6/M7 |
| M6 | 접합 평형·구속 일관성·제한 특수접합 전단 | 예상강도·구속·정착/형상·후보 → M4/M6 |
| M7 | 접촉압 적분·명시 역학·중심 펀칭 | 하중 회계·KDS 구조/지반·편심·기초 정착/후보 → M5/M6 |
| M8 | 검토도/SVG/JSON/벡터 PDF·일부 주근 형상 | 실제 전수 상세·길이/수량·완전 계산서 → M8 |
| M9 | 작은 CPU/Direct 흐름·일부 UI/저장 확인 | 전체 개발 완료 증거 부족. 원래 Q는 별도 단계 → M9/M10→Q |

**Phase24는 부분 구현을 보존한 이관 기준선이다. 이관 자체를 기존 마일스톤 완료로 세지 않는다.**
