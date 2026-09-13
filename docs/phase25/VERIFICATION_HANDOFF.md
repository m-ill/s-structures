# Phase25 검증·WebMCP·결과·인계 계약

2026-09-11 · 제안 계약 · 제품 구현/통과 기록 아님

## 1. 개발 시험과 종합검증의 분리

개발 중에는 바꾼 기능과 직접 영향 경계만 확인한다. 한 번에 하나의 규칙·결함을 RED로 재현하고 최소 수정 후 같은 입력으로 GREEN을 확인한다. 별도의 장시간 전체 시험은 다음 Q 캠페인에서 수행한다.

| 수준 | 목적 | 크기/실행 원칙 |
| --- | --- | --- |
| L0 | 수식·적용 조건·상태/단위·독립 기대값 | 보/기둥/접합/기초 1개 또는 주입한 힘 배열. 통상 수초 이내 |
| L1 | 입력→공통 서비스→WebMCP/저장/결과 | 직접 영향 1~3파일, 필요한 경우에만 작은 CPU/Direct 1건 |
| V | 변경 출력의 시각 확인 | 대표2~3쪽의 한글·표·치수·긴 근거; 변경 없는 전체 도면집 반복 금지 |
| Q | 전 회귀·독립 비교·전 환경·전체 메모리·출시 자격 | 별도 캠페인. 현재 개발 default/마일스톤 runner에서 실행 금지 |

한 변경의 L0+L1은 30초 이내를 목표로 하고, 넘으면 시간과 원인을 기록해 입력을 줄이거나 중복 실행을 제거한다. 시간 때문에 실패 시험을 생략하거나 통과로 쓰지 않는다. 구현해야 할 항목을 Q로 넘기는 것도 금지한다.

실제 건물 시험, 이전 대지/상가주택, 전 21개 비교, 외부 CAD, 장시간 GPU 시험은 이번 기본 개발 시험에서 제외한다. 사용자의 '나중 종합검증' 결정은 정확한 작은 수치 시험을 생략한다는 뜻이 아니다.

## 2. P25 시험 대장

| ID | 단계 | 필수 관찰 |
| --- | --- | --- |
| T00 | M0 | 지원 프로파일·source/rule/이관 ID 누락 차단, 선택 runner |
| T01a~f | M1 | A01~A03/A05/A06 수정, 조합 coverage·상태·Direct·공통 summary/cache/currentness |
| T02a~d | M2 | 제품/공칭 면적·단위·구간 경계 A04·피복/구속·실제 UI/API 왕복 |
| T03a~d | M3 | 독립 단면/2차/전단-비틀림/즉시·장기·균열 검토 |
| T04a~d | M4 | 실제 양단 정착·이음, 예상강도 수요와 접합 구속/연속성 |
| T05a~d | M5 | 자중/부력 회계·순하중 평형·편심 펀칭·지반/기초 정착 |
| T06a~d | M6 | 후보 생성·적용 자격·새 활성 해석/평가·해 없음/입력/실패/rollback |
| T07a~d | M7 | 계산 중 취소·timeout·늦은 결과·예산/객체 해제·규모 제한 |
| T08a~d | M8 | 독립 형상 길이/수량·전수 pagination·한글 PDF·snapshot/stale |
| T09a~c | M9 | 실제 WebMCP/UI·paging·복원/replay·소형 전체 흐름 |
| T10 | M10 | 이관 항목 상태·링크·hash·출력/버전·Q 인계 완전성 |

T 번호는 시험 묶음이며 assertion 개수나 실제 통과 파일 수가 아니다. 각 세부 시험의 대상·명령·시간·종료코드·oracle·허용오차·input/source hash를 기록한다. 실패 후 수정한 로그와 최종 로그를 구분한다.

계획 중 만든 `audit-20260911/probes.mjs`는 현상을 기록하는 진단이다. 결함이 관찰됐다고 PASS로 세지 않는다. M1/M2에서 기대 동작을 고정한 실패 시험으로 전환한다.

## 3. KDS 근거와 계산 trace

새 규칙의 자료 구조는 다음 의미를 가져야 한다. 아래 필드명은 M0/M1에서 확정할 제안이다.

```json
{
  "ruleId": "registry-issued-id",
  "ruleVersion": "p25-rule-version",
  "source": {
    "documentId": "verified-document-id",
    "edition": "verified-edition",
    "clauseId": "existing-clause-id",
    "equationIds": [],
    "tableIds": [],
    "officialUrl": "credential-free-official-url",
    "sha256": "verified-source-hash"
  },
  "applicability": {"status": "MATCHED", "conditions": []},
  "calculation": {
    "inputHash": "...", "sourceResultHash": "...",
    "inputsWithUnits": {}, "steps": [],
    "demand": null, "capacity": null, "ratio": null
  },
  "verification": {
    "sourceVerified": false,
    "mappingReviewed": false,
    "focusedTestIds": [],
    "independentReviewStatus": "PENDING"
  },
  "wholeDesignQualified": false
}
```

실제 enum·직렬화·호환은 M1 계약 시험으로 고정한다. 문서 hash는 자료 식별, clauseId는 출처의 실제 항목, ruleId는 코드 구현, applicability는 대상 적용 가능성이다. 어느 하나가 나머지를 대신하지 않는다. KDS 41의 보완/대체 규칙이 있으면 기본 KDS 14와 관계를 남긴다. 최신 판본과 프로젝트에 채택한 판본도 구별한다.

모든 최종 check에는 근거 상태가 있다. 기하 길이·평형 같은 일반 역학은 `calculationBasis`와 식/단위를 기록하고, 적용되지 않은 KDS 조항은 '검토 대상'으로만 표시한다. source/mapping/applicability가 부족하면 조항 적용 완료로 내보내지 않는다. 아직 독립 검토가 없으면 그 상태도 계속 표시한다.

기준 본문 전체를 UI/계산 매 호출마다 로드하지 않는다. 검증된 작은 규칙 묶음과 metadata를 번들에 넣고 공식 원문은 별도 evidence로 보존한다. 개정 감지는 새 버전/차이 검토 작업을 만들며 기존 결과를 자동 재승인하지 않는다. 인증값은 포함하지 않는다.

## 4. 상태 집계

| 의미 | 제안 상태 | 금지하는 처리 |
| --- | --- | --- |
| 실제 검토 완료 | PASS / FAIL | 수치 계산 실패나 입력 누락을 ratio=0으로 표시 |
| 규칙상 적용 제외 | NOT_APPLICABLE + 조건/근거 | 미구현 규칙을 N_A로 숨김 |
| 자료가 부족함 | NEEDS_INPUT + 필요한 필드/자료 | 규칙/solver 결함까지 모두 사용자 입력 탓으로 처리 |
| 구현/방법이 없음 | UNSUPPORTED_RULE / UNSUPPORTED_SCOPE | 자료를 추가하면 해결되는 것처럼 안내 |
| 결과를 쓸 수 없음 | STALE / SOLVER_FAILED / INCOMPLETE_DEMAND | retained 이전 성공 또는 1차 결과로 몰래 대체 |
| 자원/실행 종료 | CANCELLED / BUDGET_EXHAUSTED / INTERRUPTED | 실패 원인을 NO_FEASIBLE_DESIGN 하나로 합침 |

기존 OK/NG/NOT_CHECKED 등과의 매핑은 버전 adapter로 유지한다. UI에는 수치 실패와 미완료를 동시에 알 수 있게 hasFailure/hasMissing을 보존한다. 설계 범위 충족은 적용되는 요구 규칙·필요 조합이 모두 검토되고 실패가 없는 경우다. 생산 자격은 여기에 독립/종합 검증을 추가로 요구한다.

`rc-code-compliance`와 `foundation-code-compliance`는 규칙 목록 밖에서 하위 검사/입력/조합을 집계하는 요약으로 재설계한다. 근거 없이 항상 OK로 채우거나 항상 미검토인 행으로 두어 자동 보완을 영구 차단하지 않는다.

## 5. WebMCP 제어 계약

| 업무 | 유지/확장할 실제 도구 | 구현 조건 |
| --- | --- | --- |
| 범위·입력·규칙 확인 | get_design_modules, get_design_input_schema, get_design_records | source와 구현/미지원·누락 조건·현재 제한을 분리 |
| 입력 변경 | preview_design_changes, apply_design_changes, undo_design_input, redo_design_input | 원자적 transaction·requestId·revision·typed validation |
| 해석·결과 | 기존 plan/start/get/cancel analysis 및 elastic workflow | 정확한 source/조합/방법/자격, stale·취소 유지 |
| 필수 검토 | evaluate_practical_design, get_practical_design_result, 기존 design review | 동일 canonical 평가·필수검토/coverage·근거·전수 paging |
| 후보 | plan/start/get/cancel_design_candidates, apply_design_candidate | 대상 부재/접합/기초, 영향 범위, 적용 후 자동 재계산 상태 |
| 출력 | export_design_drawings, get_design_drawing_artifact, cancel_design_drawing_export, 기존 report 도구 | 준비 snapshot만 읽음, 모든 페이지/근거·chunk·취소·현재성 |
| 재사용/복원 | get_design_dependencies, reuse_design_analysis, 기존 checkpoint/Book | 해석 의존성 증명과 버전/중단 상태 보존 |

위 표에서 묶어 적은 start/get/cancel 명칭은 개념 묶음이다. 구현 시 실제 등록명을 그대로 대장에 기록한다. 기존 도구를 확장하는 것이 우선이며 새 도구가 필요하면 이름/schema/permission/currentness/response limit을 먼저 버전 계약으로 고정한다. 계획의 도구명을 이미 호출 가능한 기능처럼 공개하지 않는다.

기본 query는 모델 수정·수치 재계산·자동 다운로드를 하지 않는다. UI와 WebMCP의 한도/enum/오류는 같은 정의에서 생성한다. UI도 nextOffset 등으로 모든 검사와 후보를 탐색할 수 있어야 한다. 한 화면의 첫50행을 전체 결과처럼 표기하지 않는다.

## 6. 메모리·계보·증거

후보 원본/최선/현재 데이터의 owner, Worker/typed buffer의 이동/복제, 관리 retained/peak, font/PDF/URL 수명을 기록한다. 작은 시험은 관리 ledger와 작업 종료를 검증하고 실제 JS heap 전체와 브라우저/GPU native 메모리의 장시간 누수 부재는 Q에서 평가한다. 측정할 수 없으면 unavailable이지 0이 아니다.

한도는 profileId, nodes/members/stations/sources/candidates/pages, retained/peak bytes, wall time, compute target에 묶는다. Phase24 한도는 개발 제한으로 표시한다. 검증 없이 무한 처리로 바꾸거나 생산 최대치라고 공표하지 않는다.

증거 경로 제안:

```text
verification/specs/phase25/rules/       # 공식 조항/독립 기대값/오차/적용 범위
tests/fixtures/p25/                     # 작은 합성 입력
verification/evidence/phase25/mXX/       # RED, GREEN, 직접 영향, 시간/명령
verification/evidence/phase25/cohorts/   # 수정별 source/test/artifact hash
output/phase25/                         # 개발 중 생성한 대표 도면/계산서
```

실행 원본이나 사용자 자료를 새 증거로 덮어쓰지 않는다. 공유 묶음에는 합성 모델을 우선 넣고 사이트/프로젝트 개인정보·API 인증값을 넣지 않는다. 이전 cohort가 가리키는 파일을 바꾸면 새로운 cohort를 만들며 기존 시험이 새 변경까지 검증했다고 기록하지 않는다.

## 7. 후속 종합검증 Q와 재료 확장

| 묶음 | 실행 내용 | 개발 페이즈의 책임 |
| --- | --- | --- |
| Q01 | 고정 버전 전체 회귀·이전 CPU/Direct 호환 | M10 대상 commit과 영향 목록 인계 |
| Q02 | KDS 규칙·단면/부재 독립 수치 대조 | M0~M3 source/oracle·허용오차·예상 결과 준비 |
| Q03 | 접합·정착·기초 독립 수치/기하 대조 | M4~M5 범위/수요/원문/기준점 준비 |
| Q04 | 하중/조합·재사용·최적화·전후 상태 캠페인 | M1/M6 적용성·계보·제약 불변 기록 |
| Q05 | 전 입력·UI/WebMCP·브라우저/환경 | M9 실제 도구·화면·호환 대장 준비 |
| Q06 | 장시간 반복·최대 규모·전체 heap/Worker/GPU 자원 | M7 측정기와 한도/환경·실패 복구 기준 준비 |
| Q07 | 전 도면·수량·한/영 보고서 시각·텍스트 대조 | M8 전수 객체/페이지 manifest 준비 |
| Q08 | 모든 저장 매체·버전 migration·중단/복원 | M9 구버전/중단 fixture 및 복구 규칙 준비 |
| Q09 | 독립 검토·자격/기능표·공개 패키지·CI/배포 판정 | M10 개발 완료·자료 대기·미지원 목록을 분리 |
| Q10 | 실제 건물 구조설계 업무 대체 검증 | 사용자 별도 요청 전까지 제외 |

이 표는 Phase25 대상에 맞춘 Q 재편성안이며 과거 Q 번호의 실행 결과를 승계하지 않는다. 사용자 담당 독립 검토와 기존 외부 비교/pilot 자료의 충족 여부는 실제 자료별로 확인한다. Q 문서 준비만으로 검토를 완료했다고 기록하지 않는다.

후속 E-STEEL/TIMBER/MASONRY는 입력 지원 외 전용 부재·접합·기초 연계/자동 상세·해당 KDS/KS 규칙을 각각 계획한다. 새 비선형 설계 매핑과 GPU 생산 자격도 별도다. Phase25 완료 시 이 범위가 자동으로 지원되는 것은 아니다.
