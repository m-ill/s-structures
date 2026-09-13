# Phase24 개발 기록

이 파일은 append-only다. 계획·실행·실패·수정·미검증을 구분하고 과거 실행을 덮어쓰지 않는다. 아직 생성하지 않은 evidence의 경로만 적어 PASS로 처리하지 않는다.

## 2026-09-11 — 계획 v1 작성

- 요청: 기존 탄성설계 과정에 재료/단면·실제 배근·접합/기초·자동 수정·상세도/계산서를 통합하는 다음 페이즈를 프로덕션 수준으로 계획. TDD와 작은 개발 검증, 다음 별도 종합검증을 적용.
- 추가 결정: 모든 업무 모듈은 WebMCP 제어 가능해야 함. 입력·조회·실행·취소·후보 적용·결과·내보내기를 각 milestone의 필수 조건으로 반영.
- 조사 기준: `ed24e04809957754cdde38e7b949d7c184a0fd2b`, 브랜치 `work/phase21-consistency-20260910`. 기존 미추적 산출물과 앞선 review 문서 보존.
- 확인 경계: 공통 재료/설계 입력, 두 runDesignChecks 호출 경로, 전체 모델 identity, workflow의 STALE_INPUT, 실제 WebMCP 도구/schema/등록·크기·세션 계약.
- 산출물: README, WORKPACKAGES, TARGET_ARCHITECTURE, WEBMCP_CONTROL_CONTRACT, TDD_VALIDATION_PLAN, IMPLEMENTATION_STATUS, EXECUTION_LOG.
- 범위: M0~M9; 네 재료 공통 입력·제어와 RC 보/기둥·지원 접합/독립기초·배근도 흐름 우선. 철골 상세/자동화·목재·조적 전용 설계는 후속 확장 계획으로 명시.
- TDD: D01~D12→T00~T18 연결, 작은 RED/GREEN/정리·직접 영향 계약, 각 단계 WebMCP 시험. 다음 Q 캠페인과 실제 건물 조건을 분리.
- 이번 실행: 계획 문서 작성만 수행. 제품 코드·시험 코드·수치 evidence·기존 현장/실제 건물 자료·공개 배포 변경 없음.
- 다음 작업: M0 구현 착수 시 source·규칙 범위·fixture·WebMCP 대응표·선택 실행 도구를 고정. 현재 모든 milestone은 PLANNED.

## 2026-09-11 — 문서 연결·상태 점검

- Phase24 문서7개와 로컬 Markdown 링크/anchor22개를 검사: 오류0. M0~M9·T00~T18·D01~D12 목록 대조.
- `git diff --check` 통과. src/tests/tools/verification/package.json tracked 변경 없음. 수치/자동 제품 시험·브라우저 실행 없음.
- `python tools/lint_wiki.py C:/Users/mill/Downloads/dcr`: Wiki77개, 기존 S-Scan 원자료 링크8건으로 exit1. 새 오류0·고아0·깊이 위반0·index 누락0. 다른 프로젝트 자료는 수정하지 않음.
- 마지막 정리: 명시적 평가 범위와 topology에서 찾는 누락 접합/기초의 필수검토를 추가. 부재 범위 완료와 프로젝트 전체 완료가 섞이지 않도록 정의.

## 2026-09-11 — M0 구현과 M1 첫 입력 연결

- 사용자 Phase24 개발 요청에 따라 기존 미커밋 문서/BAT/output을 보존하고 구현 착수.
- M0: 16개 기준 소스 hash·D01~D12·합성 oracle·기존 trace/fiber 경계·규칙 원문 미확정 상태를 verification/specs/phase24에 고정.
- 실제 WebMCP definition에 get_design_modules가 없는 RED 확인, 공통 metadata/bridge 조회 추가 후 T00/T18 GREEN(652ms). 선택 실행 runner는 목록만 기본 출력하며 미구현 M9 선택은 예상대로 exit1.
- D04 재현: D10 2다리·최소75mm, 요구4mm2/mm에 제공1.90133이며 부족 상태 누락. 수정 PASS로 집계하지 않고 M4 회귀 원인으로 보존.
- M1: 조적 schema RED→재료4종 공통 typed 입력/출처/단위 GREEN. section-record 공개 명령 RED→치수/파생값·불변 버전 GREEN. 실제 배근/접합/지반/기초 명령 RED→단위·참조·geometry GREEN.
- 추가 수치 routing 결함: H형 조적/미분류 재료도 steel 검토가 실행돼 기대1개 대비 실제3개를 재현. 명시적 kind로 routing을 수정해 GREEN.
- 철근 겹침 RED→직경을 포함한 실제 간섭 차단 GREEN. 접합/기초 선택 배근 필드는 구현 후 추가 회귀로 확인했으며 이 보강까지 선행 RED를 수행한 것으로 기록하지 않음.
- M1 첫 집중4파일 869/144/928/903ms 통과. 변경 후 상세 T03 재검사 통과. 직접 영향 p7-m1/p7-m2 및 p19-m2 입력11시나리오 통과. 전체 회귀·실제 건물·공개 배포 없음.
- 현재 M0 준비 구현, M1 입력 첫 범위 구현 중. M2 입력 영향/저장, M3~M9 계산·후보·출력은 완료로 표시하지 않음.

## 2026-09-11 — M1 재편집·M2 저장/버전 보호

- H/CIRC 등록값 재편집 T02 RED: kind=parametric이 shape보다 우선해 H의 tw/tf 누락. 형상 선택을 타입별로 분리해 GREEN.
- T05 RED: 직경과 다른 저장 철근 면적이 정상 내보내기를 통과. 저장 상세를 같은 typed 정규화로 재검사하고 파생 면적/참조/피복/계약 버전 변조를 차단해 GREEN.
- Product Book 새 입력의 v1 내보내기 RED→v2 feature fence GREEN. 기존 자료 v1 유지. raw JSON 구버전 export와 모든 저장 매체의 호환 마감은 미완료.
- typed section의 저장 A 변조 RED→치수에서 계산한 값과 대조 GREEN. 미래 material/section inputContract도 거부.
- 버전별 diff RED: WebMCP changes를 배열로 읽은 첫 시험 오류는 red-version-diff.txt에 보존. 실제 page.rows 계약으로 교정한 red-version-diff-r2.txt에서 버전 추가 표시 결함 재현. id@version 비교 후 GREEN. 시험 작성 오류를 제품 결함으로 집계하지 않음.
- 최종 소스 집중 M0/M1/M2 6파일 통과(988/1229/156/1234/942/1051ms). 직접 영향 P19 입력11시나리오·P21 입력/저장·P7 단면 통과. 실제 solver·건물·브라우저·전체 회귀 미실행.
- M2 재사용 증명/결과 재등록·전체 저장 경로 마감과 M3~M9는 남음. 현재 새 배근 입력 후 기존 결과는 stale이며 자동 재사용하지 않음. 규칙 원문 봉인도 남음.
- 미커밋 코드/문서와 최종 시험 로그를 cohort-20260911-01.json에 hash로 연결. 초기 RED/GREEN은 시점별 이력이며 최종 소스와 동일한 실행이라고 표시하지 않음. push/배포 없음.
- 문서 정리 후 git diff --check 통과. Wiki77개 검사에서 기존 S-Scan 링크 오류8건 유지, 고아/깊이/index 오류 없음. 전체 Wiki lint는 exit1이며 수치/제품 PASS에 포함하지 않음.

## 2026-09-11 — M2~M9 후속 구현과 집중 확인

- M2: gross elastic 입력에서 신규 배근만 분리하는 dependency contract, source proof가 있는 completed static/Direct 기록의 명시적 재사용. 원본 기록을 수정하지 않고 새 identity로 파생 기록 생성. 근거 없는 legacy/build 미결합 복원 재사용 차단. 입력 undo/redo와 raw JSON downgrade 보호 구현.
- 실제 체크포인트 시험에서 practical 상태가 segmentation에서 누락되는 RED를 재현하고 수정. 입력 이력 복원에서는 Book 정규화로 identity가 달라지는 실패를 재현. normalized Book과 검증한 원본 입력을 함께 저장해 해결. 이력·후보 참조/checksum 검증 및 interrupted 복원 추가.
- M3: evaluator 소유권 이동, 동시 발생 수요와 필수 검토 목록. 실제 solver의 Tq 필드 누락 RED→alias 수정. 가정 배근 RC/250kN 접합/가정 기초 지표는 diagnostics로 분리해 필수검토 NG를 오염시키지 않음.
- M4: 제공 스터럽 부족·입력 없는 거짓 OK 수정. 명시적 law의 직사각형 응력블록/축력/2축휨 및 실제 배근 d/Av/s 구현. 정착·사용성·기준 적합성은 미검토. API 부재 RED 및 독립 합성 수치 GREEN 보존. provided 시험의 첫 실패는 문법 오류였으며 수치 결함 RED로 집계하지 않음.
- M5: 배근 후보 수/시간 한도·중복·취소·명시 적용·재요청 replay. 부족한 필수검토 때문에 autoApply는 차단됨. 서로 단위가 다른 수량 합산 대신 본체 철근 체적과 스터럽 면적×개수의 순차 비교. 적용 영수증 슬롯을 commit 전에 고정 예약.
- M6: 접합 전역 평형/부재 release 일관성. M7: 실제 기초 접촉·반력/지반/배근 기반 역학 검토. 기준식, 접합부 전단/정착, 펀칭, 이축 부분 접촉, 단면/접합/기초 후보는 미완료.
- M8: 같은 snapshot의 벡터 도면/수량 JSON/SVG/PDF. Google Fonts Noto Sans KR(OFL)를 정적 subset으로 변환/개명하고 license·원본/산출 hash 기록. PDF 폰트 포함·한글 텍스트 추출·PNG 시각 확인. 후크/정착/이음 미확정의 절단길이는 null. PDF 취소·artifact dispose 후 관리량0 확인.
- 서버 allowlist가 새 글꼴을 제공하지 않는 RED→명시 파일 허용 GREEN. Pages 빌더에 동일 font/license/provenance 필수 포함. 미커밋 상태를 우회해 빌드/배포하지 않음.
- M9: 작은 RC CPU 및 Direct 실제 해석→WebMCP 평가→후보/취소→SVG→적용/replay/stale→명시 재사용→재평가→체크포인트→undo/redo 통과. maxCandidates 소진과 기하 불가능 후보도 확인. 실제 건물은 사용하지 않음.
- 브라우저: 내부 브라우저 로컬 앱에서 신규 WebMCP 등록 확인. Playwright CLI 미캐시로 bundled Playwright 라이브러리의 작은 스크립트 사용. 탄성 설정 창의 고정 top=96px가 늘어난 ribbon의 설계 버튼 클릭을 가리는 실패 재현. 창을 ribbon 아래로 배치 후 실제 클릭·상세 패널·RESULT_REQUIRED·글꼴 요청·pageerror0 통과. 1440×1050 캡처 보존.
- 직접 영향 P19 입력 시험의 주입 identity fixture에서 preview 실패 발견. 재사용 증명만 실패한 경우 conservative REANALYSIS_REQUIRED로 표시하고 원래 commit identity 검증을 유지하여11시나리오 통과. P19 설계/WebMCP 및 P21 분할 checkpoint 회귀 통과.
- 이번 통과는 집중 확인이다. 계획된 미구현과 공식 원문/독립 검토·종합검증을 구분해 IMPLEMENTATION_STATUS.md 갱신. Phase24 전체 완료/생산 자격/배포 완료로 표시하지 않음.
- 최종 영향 범위8파일 재검사 통과(약6.5초), Direct 확장 smoke 통과(약2.8초). 전체 Phase24 집중 파일은19개 통과이며 전체 회귀는 미실행. 마지막 PDF467자 한글 추출/1페이지 Type0 TTF 포함과 렌더 확인. git diff --check 통과. Wiki77개 lint는 기존 S-Scan8링크 오류로 exit1, 신규 고아/깊이/index 오류0.

## 2026-09-11 — KCSC 공식 자료와 수치 결함 후속 수정

- 사용자 승인 인증으로 공식 CodeViewer 9건 취득. 인증값은 비표시 stdin으로 사용하고 원문/manifest/source에 저장하지 않았다. 각 판본·개정일·취득시각·SHA-256을 기록하고 제품에는 메타데이터만 연결했다. 공식 원문 수식이 이미지이므로 정착식 GIF를 시각 확인했다.
- M0: 실제 WebMCP 출처 조회의 RULE_UNAVAILABLE RED → source capture/partial clause 분리, 9건 hash/판본 검증. 접합 기준은 14 20 80, 판본은 문서별 2021/2022/2024로 구분했다.
- M4: mm/MPa 기준 직선 인장/압축·후크 요구길이·인장 이음 순수 함수와 제공 배근 입력/판정 연결. 고강도 조건과 이음 하한 순서 등을 확인. UI/WebMCP schema에 조건을 추가하고 실제 preview/apply/get 및 OK/NG/누락 사유 확인.
- legacy rebar.js는 D19/fck27/fy400에 63,224mm를 반환하는 RED 재현. 0.043/추가 1,000 배율의 예비식을 삭제하고 공식 함수 어댑터로 교체. 조건 누락은 null/NOT_CHECKED. 기둥 상세가 이음 미검토를 최종 OK로 숨기지 않도록 수정했다. P3 회귀의 사용성 OK 기대는 앞선 가짜 사용성 제거와 맞지 않아 NOT_CHECKED로 갱신 후 통과했다.
- M7: 이축 압축 전용 접촉 평형과 다각형 적분을 구현. 기존 미지원 RED 후 독립 삼각형 압력/합력/모멘트 및 부호 대칭 GREEN. 같은 압력장을 휨·일방향 전단에 연결. 펀칭/정착/자중 자동 합산은 미완료다.
- M3/M2: 반복 평가를 수치 실행 전에 cache 확인, evaluator 버전을 ID/복원 stale/후보 적용 검사에 포함. 작은 CPU WebMCP 흐름·재조회·후보·stale·체크포인트 회귀 통과.
- 이번 수정은 전체 미구현 완료가 아니다. 강도 규칙/사용성/비틀림·접합 내력·펀칭·확장 후보·실제 후크/가공 길이는 KCSC_RULE_INTEGRATION.md에 다음 구현 조건으로 기록했다. 실제 건물·전체 회귀·push/배포 없음.
- 최종 직접 영향8파일 모두 exit0, 합계5.154초. git diff --check 통과. Wiki77개는 기존 S-Scan 깨진 링크8개로 exit1이며 신규 고아/깊이/index 오류0. 새 소스/공식 원문/실행 로그는 cohort-20260911-03.json으로 연결한다. 이전 cohort는 과거 이력으로 보존한다.

## 2026-09-11 — M4 강도·사용성, M5 단면 후보, M7 뚫림전단 진행

- 사용자 추가 요구: 모든 계산 결과에 KDS 근거를 항상 포함한다. canonical check의 codeBasis에 적용/미확정, 문서·판본·조항/식/표·공식 URL·원문 hash를 부착했다. 입력 누락 검토는 적용 근거로 허위 승격하지 않는다. WebMCP/UI/후보/JSON/PDF로 같은 근거를 전달한다.
- M4: 공식 수식 이미지의 응력블록/최대축력 확인. 14 20 20:2022 표4.1-2·4.1.2와 14 20 10:2021 강도감소계수로 비프리스트레스 직사각형 띠철근 단면의 phi-축력-2축휨 평형을 연결했다. phi가 변형률에 따라 변하도록 탐색 내부에서 변환하며 최대축력/최소인장변형률도 확인한다. 고강도 중간 표값은 근거 미결합으로 미지원이다.
- M4: 전체 사용하중 조합의 균열 강성(Icr/Ie/Mcr)으로 활하중 순간처짐을 적분. 지점 사이 극값도 계산한다. 전체 균열조합 누락, 축력/이축휨, 손상 민감 비구조요소의 장기검토는 명시 사유로 차단한다. 장기배율 순수 함수는 추가했고 전체 장기하중/균열폭 자동 연결은 남았다.
- M5: 실제 WebMCP/UI의 sectionCandidates 치수 범위를 받아 격리 모델에 단면+배근을 적용하고, 원 source의 static/Direct case로 실제 CPU 재해석. 새 수요로 재검토 후 명시적 선택은 공통 입력 트랜잭션에서 원자 적용한다. 재해석 중 원본 모델 무변경 및 적용 후 stale 확인. 대형 worker 실행·적용 후 자동 결과 게시와 접합/기초 후보는 잔여다.
- M7: 공식 4.11-1~8 이미지를 읽고 압축대 뚫림전단식을 구현. 중앙 내부 독립기초에 실제 배근 strip/위험둘레/유효깊이를 연결하고 h+ld 철근 연장 조건을 확인했다. 수요는 지반력 저감 없이 전체 압축반력으로 보수적 평가한다. 모멘트 병행은 4.11.7 미완료로 차단한다.
- TDD/작은 확인: 강도 API 부재 RED, phi 상한 부동소수점 경계 수정 후 GREEN; 강도/사용성/기초 독립 대입·누락 조건, 기존 단면 회귀, 실제 CPU 단면 후보 원자 적용 통과. 근거 PDF2페이지의 텍스트 추출과 두 번째 페이지 렌더 확인. 전체 회귀·실제 건물·배포 없음. 개발은 다음 잔여 작업으로 계속한다.


## 2026-09-11 — 후속 4차: M4~M8 KDS 일부 규칙·Direct 수요 수정·전 결과 근거

공식 원문의 수식 이미지를 확인하여 M4 변형률별 강도감소·축력/2축휨·제공 스터럽 전단·순간 처짐, M6 제한 특수접합 전단, M7 중심 뚫림전단, M8 직선/L90/J180 형상·기하 길이를 연결했다. M5 B/H 단면 후보는 격리 CPU/Direct 재해석·메모리 사전 예약 후 원자적으로 적용한다. 적용 후 자동 새 검토·접합/기초 후보·worker는 잔여다.

TDD: 새 모듈 없는 RED에서 수식/단위·독립 치환·경계/미지원 GREEN으로 진행했다. Direct 시험에서 바깥 결과 객체를 읽는 후보 오류와 1차 byCombo를 읽는 설계 수요 오류를 발견하여 공통 선택기를 적용했다. 추가 처짐 회귀에서 Direct 전체 사용하중 대신 1차 강성용 모멘트를 읽는 오류(합성 처짐 0.000018355m / 기대 0.000096110m)를 재현해 수정했다. 서로 다른 해석 차수의 수요를 섞지 않는다.

사용자 요구를 반영하여 codeBasis(코드·판본·조항·공식 URL·원문 SHA256·적용 상태)를 전 canonical 검토/후보 및 HTML/JSON/CSV/PDF에 기록한다. 철골 예비식/기본 층간변위/누락 조항은 미확정으로 표시한다. 불완전 출처를 적용으로 승격하지 않는 회귀시험을 추가했다. 보고서 렌더러는 저장 metadata만 읽는다.

현 evaluator v4, 모듈 inventory v2로 갱신하고 오래된 평가/후보 stale 판정에 버전을 포함했다. 집중 검증 로그·현재 파일 hash는 final-20260911-04 및 cohort-20260911-04.json 참조. 실제 건물, 전체 회귀, 배포는 하지 않았다. 전체 기준 적합성/시공용 제작/독립 자격은 미충족으로 유지한다.

최종 집중17파일·18실행 전부 통과(19.357초). T16 검토 PDF 2쪽 중 KDS 근거 쪽을 재렌더하여 한글·조항·URL·SHA256 표시를 확인했다. Wiki lint는 기존 S-Scan 누락 링크8건만 유지하며 새 고아/깊이/index 오류는 없다.


## 2026-09-11 — 재점검 후 잔여 Phase25 이관

사용자가 남은 작업을 재조사하고 다음 개발 페이즈로 넘겨 계획부터 다시 작성하도록 요청했다. Phase24 완료 조건/실제 코드/집중 evidence를 대조해 32개 이관 항목을 정리했다. 구현 관련767파일은 4차 cohort와 일치했으며 제품 코드는 수정하지 않았다. solver 없는 합성 수요 관찰6건(34ms)에서 영구 미검토 집계, D 누락 전체SLS 수용, SLS 강도 행, 인접 배근 경계 중복, 조항 존재 검증 결손, station 정렬 결손을 확인했다.

Phase24를 전체 완료로 표시하지 않고 PARTIAL_BASELINE / REMAINDER_TRANSFERRED로 기록한다. 새로운 Phase25 M0~M10은 모두 PLANNED다. 구현과 집중검증 및 생산 자격을 분리하고, 미구현을 Q 대기로 이름만 바꿔 이관하지 않는다. 기존 철골/목재/조적 후속 제안은 E-STEEL/TIMBER/MASONRY로 보존했다. 정본: docs/phase25/README.md, GAP_AUDIT.md, WORKPACKAGES.md, VERIFICATION_HANDOFF.md.
