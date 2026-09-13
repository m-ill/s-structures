# Phase25 마감 점검표

2026-09-13 · 기준: WORKPACKAGES.md의 원래 M0~M10 완료 조건.

이 문서는 초기 결손 목록을 현재 기능 목록으로 읽는 오류를 방지하기 위한 마감 점검표다. `TRANSFER_REGISTER.json.gaps[].description`은 2026-09-11 초기 관찰이며, 이후 수정은 progress와 구현 이력으로 기록되어 있다. 파일 존재나 과거 PASS만으로 현재 마일스톤 전체가 완료됐다고 판정하지 않는다. 아래 확인은 최근 직접 읽은 코드와 제한된 실제 경로 증거의 범위이며, 전체 완료 감사는 아직 통과하지 않았다.

## 마일스톤별 확인과 미충족 조건

| 단계 | 확인한 구현/증거 | 아직 닫을 수 없는 조건 |
| --- | --- | --- |
| M0 | 실행 프로젝트 프로파일, 규칙 대장, KCSC 출처·철근 제품표, 선택 runner가 존재 | 채택 프로파일의 필수 항·식·표→구현→시험 대응을 빠짐없이 확인해야 함. 제품표와 인증/KS 판본 확인은 구분 |
| M1 | 조합 적용성·하위 검사 집계·공통 결과 경로·실제 부재력/구간/오프셋 위치 전달이 구현됨 | 모든 채택 규칙의 적용조건·예외·수요와 source 자격이 같은 경로로 전달되는 전체 대응 감사 필요 |
| M2 | 공칭 제품 면적/질량·성적서 정보·배근 반개구간·양단/이음 객체와 typed 입력 존재 | 선택한 구조시스템의 부재 역할·환경·횡구속 필수 규칙을 모두 충족하는 상세의 통합 증거 필요 |
| M3 | KDS 강도/전단/비틀림·장기 사용성 owner, 1차 안정 증폭, 단계형 단면과 평행 오프셋 국부 검토 구현 | 일반 휨부재 작은 명시 예제는 4조합/56검사 OK 또는 N_A 및 누락 시 NC 확인. 압축부재 등 채택 범위의 나머지 증거 필요. Direct 국부 안정과 지속/균열 영향의 미확정 방법은 완료로 세지 않음 |
| M4 | 예상철근력·정착 후크·횡구속·철근 경로·보-기둥 강도비, 배근 변경 후 수요 갱신 및 후보 경로 구현 | 외부/2면 관통 접합 9검사 OK 및 관통 수량·연속열 검증. 3면 혼합 정착은 입력/정착/실패 분리 경로 검증(02-04-09), 충돌 없는 완성 배근은 잔여. 내/모서리 등 원래 접합범위 대조와 독립 방법검토는 잔여. 외부1건을 전체 접합완료로 승격하지 않음 |
| M5 | 자중/반력 회계·상하부 배근·기초 구조검토·기둥 전달·지층 침하/부등침하 등의 owner 존재 | 중심/편심 기초의 실제 전달력·위험단면·정착·지반 조건을 동시에 충족하는 지원 예제와 방법별 잔여 확인 필요 |
| M6 | 실제 WebMCP에서 전단NG→자동 단면 확대→적용→새 해석→전단OK→잔여휨NG 다음 후보계획까지 확인 | 이 한 경로는 완료. 마일스톤 전체에는 연결 접합/기초·보완 불가·중복요청·적용 후 실패/복원 요구를 각각 코드와 해당 증거로 추가 대조해야 함 |
| M7 | 현재 평가의 N/2N 예약량·캐시 재사용·dispose 해제, 잘못된 연결 제품규격 거부 후 계획/작업/메모리 불변 확인 | 실행 중 취소/timeout/늦은 결과/Worker 종료 실패·복원의 현재 버전 증거 대응을 확인해야 함. 최대 규모/장시간 실제 heap/GPU는 원래 Q 캠페인 |
| M8 | 준비된 실제 형상·공칭 수량·전수 CSV, 한글 계산/PDF 분할, 적용 전후 실제 치수 기록 구현 | 채택 상세의 계산서·도면·수량·근거가 동일 snapshot에서 전수 출력되는 대표 2~3쪽 검증과 형식 간 추적성 마감 필요 |
| M9 | WebMCP 실제 입력/해석/재검토 및 잔여대상→다음 후보계획, 설치 UI의 8행 목록·stale 응답 차단 확인 | 실제 브라우저의 작은 합성 RC 업무 경로와 대표 화면, 중단/체크포인트/undo·redo·새 규칙 버전의 통합 확인 필요 |
| M10 | 원래 출시/후속 검증 계획 존재 | M0~M9 완료 감사 전에는 마감할 수 없음. README/공개패키지/배포 상태와 최종 이관표를 실제 구현에 맞춰 정리해야 함 |

## 다음 구현과 검토 순서

1. **M0~M3 채택 프로파일 하나의 필수검사 표를 실제 코드에서 추출한다.** 현재 미검토를 입력 부족, 수요 부족, 규칙 미구현, 방법 검토로 구분한다. 기존 필수검사를 지워 예제를 통과시키지 않는다.
2. **작은 완전 입력 RC 부재를 기준으로 M3의 막힌 필수 검토를 차례로 구현한다.** 이것이 다음 수치 개발의 우선순위다. 새 일반 형상 확장은 원래 프로파일 완료 조건을 대신하지 않는다.
3. **같은 방식으로 M4 접합·M5 기초의 프로파일을 닫는다.** 그 뒤 M6의 기존 자동보완이 충분한 입력에서 한 업무 반복을 완료하는지 연결한다.
4. **M7·M8·M9는 영향받은 경로만 짧게 확인한다.** 현재 완결된 기능에 인접 기능을 계속 추가하는 대신, 원래 취소/복원·출력·실화면 조건을 닫는다.
5. **마지막에 M10 문서·패키지 마감.** 독립 검토는 사용자 담당이고 Q 캠페인은 별도이다. 철골·목재·조적 전용 설계는 원래 E 후속 범위로 유지한다.

## 직접 확인한 최근 근거

- [실제 전단 보완 후 잔여 휨 다음 계획](../../verification/evidence/phase25/focused-2026-09-12T19-41-37-912Z/SUMMARY.json): 5851ms, 단일 합성 경로.
- [평가 예약량과 해제](../../verification/evidence/phase25/focused-2026-09-12T19-42-32-096Z/SUMMARY.json): owner·memory 시험 PASS. 같은 cohort의 모듈 응답한도 실패는 아래 별도 수정으로 해결.
- [모듈 응답한도 수정](../../verification/evidence/phase25/focused-2026-09-12T19-43-24-058Z/SUMMARY.json): 8모듈 실제 WebMCP 조회 PASS.
- [잔여대상 설치 UI와 기존 적용 회귀](../../verification/evidence/phase25/focused-2026-09-12T19-48-04-613Z/SUMMARY.json): 192/466/345ms. 실제 브라우저 캡처 증거는 아님.
- [접합부 0 오프셋 실제 경로](../../verification/evidence/phase25/focused-2026-09-12T19-33-52-309Z/SUMMARY.json): 일반·공칭제품 입력 및 후보 검토 7607ms.

이번 마감 점검은 새 전체 회귀 실행이나 마일스톤 완료 선언이 아니다. 구현 변경은 [누적 기록](IMPLEMENTATION_STATUS.md), 원래 요구사항은 [작업 패키지](WORKPACKAGES.md), 최종 상태는 [기계 판독 대장](TRANSFER_REGISTER.json)에 유지한다.

## 2026-09-13 후속 증거

일반 RC 보 명시 입력 예제: 실제 WebMCP 입력→CPU 해석→4조합×14검사(56건) OK/N_A, 균열 기준 제거 시 사용성/적합성 NOT_CHECKED. focused-2026-09-12T19-56-43-708Z 4991ms PASS. 첫 실행은 기대 건수60을56으로 바로잡은 시험 오류이며 제품 RED 아님. 압축부재/Direct/접합/기초/프로젝트 전체 완료는 별도.

접합 전단 수동 예상수요 경로의 현재 형상 검사 누락 수정(evaluator178/strategy153). 오프셋·편심 삽입점·변단면과 접합 절점 미연결을 사유/KDS 참조와 함께 NOT_CHECKED로 반환. 명시 0 오프셋/centroid는 동일 계산. RED focused-2026-09-12T20-01-27-220Z에서 COL offset .1이 잘못 OK인 것을 확인; 최종 focused-2026-09-12T20-02-16-916Z 형상162ms/실제 WebMCP 후보8102ms PASS. 전단식·독립 방법검토 상태는 변경하지 않았으며 M4 전체 완료 아님.

접합 전단 선행검사 연결 수정(evaluator179/strategy154). 기존에는 평형/강성 검토 실패를 JOINT_PANEL_SHEAR_RULE_REQUIRED로 숨겼으며 semi-rigid의 강성 NOT_CHECKED 상태에서도 전단 owner로 진입할 수 있었다. 이제 평형 OK 및 강성 OK일 때만 전단 계산하며, 미충족 시 JOINT_SHEAR_EQUILIBRIUM_REQUIRED/JOINT_SHEAR_RESTRAINT_REQUIRED와 blockingChecks(원 검사ID·상태·사유), KDS 참조를 저장한다. RED focused-2026-09-12T20-03-48-253Z, GREEN focused-2026-09-12T20-04-18-707Z: 외력/진단138ms, 실제 구속력3523ms, 실제 WebMCP 접합 후보7917ms PASS. 전체 접합 자격·독립 방법 검토는 여전히 잔여.

기초 2조합 필수검사 실제 WebMCP 확인 및 적용성 누락 수정(evaluator180/strategy155). foundation-reinforcement는 강도조합 절단면의 휨 부호에 따라 필요한 면의 최소철근량을 검사하고 foundation-column-transfer도 강도조합에서 계산하지만, 공통 적용성 표에 누락되어 서비스 조합이 RULE_UNAVAILABLE였다. 두 항목을 strength로 분류; 강도조합 실제 OK 및 서비스 N_A, 2×15=30개 검사 유지. RED focused-2026-09-12T20-06-18-569Z; GREEN focused-2026-09-12T20-06-37-111Z 실제기초2715ms/공통계약329ms. 예제의 펀칭 철근 연장 부족NG, 지반 독립검토·침하 입력누락NC, 전체 미완료는 그대로 확인했다. 작은 합성기초이며 전체 M5 마감·방법 자격 증거는 아님.


## 기초 자동보완 후 전체 비교 보존 (2026-09-13)

기초 펀칭 연장 NG의 실제 자동보완→적용→2조합 재평가에서 APPLICATION_RECEIPT_SIZE_LIMIT 재현(focused-2026-09-12T20-07-49-289Z). 개별 비교요약10KB가 전체 적용기록16KB를 보장하지 못했다. strategy156: 전체 기록의 고정 필드/조합 source/잔여목록을 제외한 실제 잔여 예산으로 비교 배열만 축약하고, detailHash/청크조회/생략표시 보존. 전체 비교는 평가에 유지, 한도 증액 없음. focused-2026-09-12T20-08-52-329Z 실제경로6851ms/기존비교254ms PASS. 최종 focused-2026-09-12T20-09-14-336Z 7546ms: 펀칭 연장NG→OK 및 실제길이 충족, 하중10kN불변, 기록16KB미만, 전체비교 WebMCP 조회, 동일요청 재적용 없이 같은 평가ID 확인. 지반/침하/전체자격 잔여 유지.


## 2026-09-13 기초 확대·재배분 및 남은 단면평형 실패

기초 확대 후 지층침하/자중 재계산 및 독립 midpoint 적분 일치, 지반 검토scopeHash 변경 확인(focused-2026-09-12T20-10-23-454Z7552ms). 전수 구조검사 마감 assertion을 추가하자 정사각→직사각 확대 뒤 철근배분NG 발견(20-10-56-722Z). strategy157/repair11/distribution2: 후보 치수에서 기존 배분·간격 owner 재평가, 필요한 중앙대 배분을 같은 후보/철근량 재검토에 결합. 단위 PASS focused-2026-09-12T20-13-05-784Z92ms. 통합 마감시험은 여전히 RED: 재배분 이후 foundation-flexure SECTION_EQUILIBRIUM_FAILED (20-12-14-028Z7570ms), L방향 하부35개·양면 단면. providedSection.js axialPoint/방향48분할 중 평형 실패 원인 추적 필요. assertion을 약화하지 않았으며 전체 마감/통합통과로 표시하지 않는다.


## 2026-09-13 대칭 단면 끝점 평형 및 기초 통합 RED 해결

이전 기초 재배분 통합 RED 해결(evaluator181/strategy158). providedSection의 대칭 단면 끝점 근: 축력 평형은 수렴했지만 횡모멘트 roundoff 부호로 끝점 근을 불필요하게 이분 탐색하여 SECTION_EQUILIBRIUM_FAILED 발생. 수렴 axialPoint의 모멘트 방향 오차를 크기에 대해 정규화(1e-10)해 끝점을 먼저 채택; 내부 bracket/축력 검토 유지, 식/재료값 불변. 70개 철근 단면의 양방향 재현 RED focused-2026-09-12T20-14-53-770Z; 독립 1차원 콘크리트·양면35개 철근력/모멘트 평형 oracle과 phi 확인. 최종 focused-2026-09-12T20-15-45-249Z: 단면97ms/실제2조합기초7606ms/모멘트방향890ms/고강도80ms PASS. 실제 후보 적용 후 30개 필수검사를 유지하고 구조 수치검사 OK/N_A, 펀칭 연장·재배분 모두 충족; 침하 수치 독립 적분 및 새 지반scopeHash, 기록16KB/청크조회/동일요청ID 확인. 지반 독립검토/침하방법·KDS 전체 자격/전체 Phase 잔여는 유지. 이전20-12-14의 RED를 현재 미해결로 읽지 않는다.


## M7 현재 증거 대응 — 2026-09-13

M7 실제 native Worker 취소·시간초과 증거 보강. 새 p25-m7-native-worker-cancel은 SharedArrayBuffer로 payload 수신 및 동기CPU loop 진입을 확인한 뒤 공통 candidate client에서 취소/timeout; 실제 exit event/threadId=-1, 계산counter 정지, 관리예약0 확인. cancel 종료 관측 약14.7ms(검사대기10ms포함), timeout 전체 약529.7ms(설정500ms 및 관측대기포함). focused-2026-09-12T20-17-27-437Z: native633ms/종료기한1251ms/늦은factory89ms/N-2N2670ms PASS. N1/2 보존추정397766/587054bytes, peak2513100/3310620bytes; clone전예산거부·반복cache불변·dispose0 확인. 실제해석기 통합 취소와 달리 새 시험은 공통 client에 주입한 실제 Node Worker 합성CPU 작업이며 브라우저UI/JS heap/GPU 검증은 아님. 최대규모/장시간Q 및 M7 나머지 계약 감사 유지.

| 원래 조건 | 이번 직접 확인 | 남은 범위 |
| --- | --- | --- |
| 계산 중 취소·timeout | 실제 native 동기CPU loop 중단, exit 확인 후 반환 | 실제 브라우저 UI 지연·최종 publication 세대 통합 |
| 종료 미확인 보호 | 종료기한 초과에도 예약 유지, 늦은 factory/exit에서 해제 | 전체 서비스·출력/URL 자원 대조 |
| clone 이전 예산·해제 | 작은 예산에서 source 읽기 전 거부, dispose owner 0 | profile별 전체 한도 감사 |
| N/2N | 1/2부재 관리 추정량 및 peak·캐시 재사용 | 실제 최대규모/heap/GPU Q |


## 2026-09-13 M8 전체 비교 출력·대표 PDF 확인

M8 최신 기초 보완 결과 출력 연결 수정(drawing42). 평가에는 전체 comparison이 있으나 drawingSnapshot/buildDetailDrawings가 10KB 축약요약을 사용하여 후보 근거 undefined/실제 변경치수 생략 발생. 저장된 designComparisonDetails를 공통 출력의 comparison으로 선택; 구버전 요약의 basis누락은 명시 안내. 실제 2조합기초 snapshot에서 fullComparison 동일성·전수수량CSV·SVG·대표PDF 생성. focused-2026-09-12T20-21-46-571Z: 실제경로7757ms/기록중복회귀98ms PASS. output/pdf/phase25/foundation-profile-proof.pdf는 전체90쪽 중2/11/58쪽 발췌이며 전체PDF아님. 최종3쪽 Poppler 렌더 육안검토: 한글/치수2750×2450/비교2→2.75m,2→2.45m/펀칭OK/KDS근거·미완료 표시 정상, 겹침/잘림 없음. pypdf undefined없음 및 3쪽 확인, CSV12행과 JSON수량12행·평가ID/입력/준비형상hash일치. 초기19-15 import명 오류와19-30 직접builder기본60쪽 한도는 시험구성 수정(제품Worker와 동일600쪽 사용), 제품한도 증액 아님. 실제브라우저/전체출력집/전체phase잔여 유지.


## 2026-09-13 M9 실제 브라우저 등록 제한 재현

M9 실제 내부브라우저에서 차단 재현. http://127.0.0.1:5185/ (검증전용 data 경로 dcr/.tmp-phase25-browser-data, 서버session95952) 로드/탄성탭 화면 정상. 그러나 WebMCP fetchTools가 site configuration exceeds supported limits로 페이지 전체 도구를 비활성화. UI는 registered 87개라고 표시하므로 등록요청 성공과 브라우저 수용이 다름. 현재 정의87개, UTF8 직렬화125029bytes, preview_design_changes57989bytes, plan_design_candidates20751bytes. 어느 개별 한도가 적용됐는지는 아직 확인 안됨. output/playwright/phase25-browser/01-webmcp-registration-limit.png 캡처. 이 브라우저에서 모델입력/해석/WebMCP/복원 통합은 미실행이며, M9 완료를 주장하지 않음. 다음 우선순위는 등록 광고 크기/도구선택 계약을 줄이되 87개 기능·typed검증·session binding을 보존하고 실제브라우저 수용을 확인하는 것. Playwright CLI 미설치라 제공 CUA로 전환; 기존서버 데이터잠금은 수정하지 않음.


## 2026-09-13 M9 브라우저 WebMCP 등록 복구와 전체 입력 스키마 조회

실제 내부 브라우저에서 기존 87개 도구 전체 차단을 해소했다. browserDefinitions는 두 대형 정의의 광고만 축약하며 원래 실행 함수·상세 명령 검증은 유지한다. 현재 직렬화 크기 56,308bytes(원본125,284bytes); 특정 브라우저의 개별 한도값은 확인되지 않았으며 64KB 시험 예산은 제품 회귀 기준이다. UI는 등록 요청 완료와 실제 도구 응답 확인을 구분한다.

상세 조회가 기존 8개 practical 유형에만 열려 있어 축약 이후 하중·조합 등 스키마를 찾지 못하는 결손을 추가 수정했다. get_design_input_schema가 전체19개 명령 유형을 지원하고 load의 두 oneOf 변형도 보존한다. practical 응답 계약은 유지하고 다른 유형은 canonical schema와 단위를 반환한다. 새 수치식/설계 자격 변경 없음.

TDD RED focused-2026-09-12T20-32-55-196Z, GREEN20-33-09-896Z; 최종 focused-2026-09-12T20-35-23-814Z 302ms PASS: 전체 유형 조회 결과와 canonical schema 일치, 원본 불변, 87개 이름/실행 동일, 런타임 잘못된 상세명령 거부, 실제 registerDefinitions 전달 및 dispose 후 signal abort/실행 차단.

실제 CUA iab tab2 / http://127.0.0.1:5185/ 에서 도구목록 수용, get_project_context, 조합 스키마 조회, 잘못된 preview 차단과 입력해시 불변 확인. 기본 강재 예제에 합성 조합 M9_BROWSER_U를 preview/apply/undo/redo하여 행 제거·복원 확인. undo/redo는 prepareCommit의 p19InputRevision을 증가시키므로 이전 inputHash와의 동일성을 요구하지 않는다. 조합 내용의 동일성으로 복원을 확인했다.

증거: output/playwright/phase25-browser/registration-restored.json 및 02-webmcp-registration-restored.png. 화면의 기존 4.73mm 표시는 기본 예제의 이전 결과이며 새 RC 해석 결과가 아니다. 현재 화면에는 입력 변경/이전 결과 무효/재해석 필요가 표시된다. 실제 RC 입력→CPU/Direct→자동보완→PDF·저장복원 전체 M9 흐름과 M0~M10 마감은 잔여. 실제건물·종합검증·배포 미실행. 기존5185 서버는 응답 중이며 새 서버 시작 두 시도는 data lock 및 EADDRINUSE로 종료; 기존 서버를 교체하지 않았다.


## 2026-09-13 승인 후 M9 결과 현재성 복구

사용자의 새 명시 승인으로 Phase25 코드 수정 및 localhost 합성검증 재개. indexBridge 비동기 onPublishResult의 current && stored.ok && static 경로에서 designInputResultsStale 해제, 알림 숨김, 결과 revision 증가 및 redraw, 현재 해석 완료·설계검토 필요 상태표시 추가. 입력 변경 중 늦게 도착한 결과에는 적용하지 않는다.

새 p25-m9-published-result-currentness는 Node Worker를 실제 생성하여 브라우저용 production elastic service 경로를 사용한다. 최초 시험은 Node 동기 fallback이므로 redraw 결손만 확인; Worker 경로로 보강한 RED focused-2026-09-12T20-53-23-657Z는 stale 알림 미해제를 재현. 최종 focused-2026-09-12T20-54-48-973Z4370ms CPU/Direct 성공 후 선택결과 조회·알림 해제·redraw 및 조회시 추가해석 없음, 메시지 전달 보류 후 입력변경한 늦은 결과 차단 PASS. 브라우저는 아직 코드 reload 전이므로 실제 화면 수정 확인은 잔여.

승인 뒤 기존 preview의 배근 적용 성공. 실제 브라우저 체크포인트 M9_BROWSER_RC_20260913 저장/readback: 2,961,702bytes, durable true. 원 해석은 gross-section 의존성이 일치하여 명시 reuse 후 상세평가208건(OK47, NG5, NOT_CHECKED117, N_A39, FAILED0). pdf-bundle 실제 생성 성공: 197쪽/4권, 13,050,639bytes, designTransferAllowed=false. 브라우저 메모리 생성 응답이며 전체 파일 다운로드·렌더검증은 아직 아님. 실제 합성기둥 e9 최소철근량 NG의 자동후보를 실행 중. 전체 Phase25 마감은 잔여.


## 2026-09-13 M6 실제 브라우저 보완과 출처 ID 회귀 오집계 수정

브라우저 자동 개수 후보3/4/6개·면과 추가 명시5개·면 검토: 4개는 최소철근량NG(1.119),5/6개는 최대NG비율1.333/1.923으로 개수만으로 해결되지 않음. 고정 D16·두 면 배치의 상충으로 기록하며 중간5개 누락을 해결책으로 오인해 탐색 코드를 변경하지 않았다. 자동 직경 확장은 기존 선언된 제품규격표/등급에 한정한다. 합성 검증에서 명시 D20·4개/면 후보는 대상 NG0, 전체NG5→4. apply_design_candidate_and_review 성공,208개 검사 유지,NC117 유지, 신규NG0, 해결NG1. gross 해석 명시재사용 경로이며 새 수치해석으로 부르지 않는다.

실제 적용 비교가 unaffectedRegressionCount170을 잘못 보고했다. e10의 적용 전후 전체 검사 대조에서 차이는 analysisRunId 하나뿐이었다. candidateScope v4는 top-level analysisRunId만 분리해 unaffectedSourceRecordChangeCount로 기록하며 나머지 전체 수치/판정/사유/규칙/물리 sourceHash 비교는 유지한다. 평가서비스의 source 자격·현재성 검증은 변경 없음. 전략v159로 구버전 후보 currentness 구분. compact 비교에도 출처 기록 변경 개수 노출.

TDD RED focused-2026-09-12T21-09-05-335Z; 최종 focused-2026-09-12T21-10-09-248Z: 실제2부재 WebMCP 배근적용→해석재사용→관련없는 검사 수치불변/출처변경 별도 집계→동일요청 재사용4226ms, 단위252ms PASS. 실제 변동(수요/비율/진단/규칙/물리sourceHash)은 계속 회귀로 처리. 앞서 일반 재해석 적용 회귀도21-09-24-610Z5038ms PASS.

브라우저 증거 output/playwright/phase25-browser/rc-browser-candidate-application.json 및 체크포인트 M9_BROWSER_RC_REPAIRED_20260913(durable/readbackOK,7,487,592bytes). 브라우저는 아직 이전 코드 세션이므로 v159 및 표시 수정의 reload 후 확인은 잔여. 저장모델·출력은 합성 검증용이며 전체 Phase25·설계적합성 완료 아님. 기존197쪽4권 PDF 메모리 생성물의 전체다운로드/렌더는 미실행.

최종 출처 ID 누락/빈값도 회귀로 유지하는 경계 검증 추가. focused-2026-09-12T21-11-25-578Z 단위238ms/실제재사용4154ms PASS.


## 2026-09-13 M9 최신 코드 복원·팝업 게시 순서 수정

실제 iab tab2에서 repaired checkpoint 복원 성공(inputHash cd594dcf... 그대로), 최신 Worker CPU/Direct 새 해석 완료. 상단 stale 알림 수정은 정상이나 팝업은 이전stale 화면을 유지했다. recordPhase7AnalysisAttempt의 selection 알림이 storeAnalysisResult의 케이스 status 업데이트 전에 전달되고 팝업은 후속 center.refresh에 포함되지 않음. storeAnalysisResult에서 최종 case status 반영 뒤 SStructuresElasticResultPopup.refresh를 추가. RED focused-2026-09-12T21-15-45-745Z; GREEN21-15-57-525Z4392ms 실제 Worker CPU/Direct·늦은결과 차단 및 popup refresh의 final case status 확인.

브라우저 다시 reload/동일checkpoint복원/Direct 새 해석(M9_DIRECT:2026-09-12T21:16:29.665Z:1)으로 실제 팝업 완료/그래프 정상 확인. 캡처04-latest-rc-results.png는 팝업수정 전,05-latest-direct-popup.png는 수정 후. JSON output/playwright/phase25-browser/latest-code-restore-results.json. 코드수정 뒤 실제등록/복원/해석/팝업까지 확인했으나 전체 M9 마감은 아님.

잔여 캔버스 원인: index.html의 기존 drawModel3D가 ST.result를 직접 읽으며, reanalyze는 ST.analysis/result/design을 갱신한다. 공통 비동기 게시의 lastResult/selection 갱신과 target.draw 호출만으로는 이 캐시가 바뀌지 않는다. 기존 SStructuresNativeRuntime shim은 model/reanalyze/activeResult/draw만 제공한다. 다음 수정은 shim에 계산 없는 캐시 clear/publish 경로를 추가하고 현재 선택 결과의 호환 projection을 전달하는 것. 입력변경·실패·복원·dispose에서 이전 예제 결과를 지우고, 새 성공결과는 해석을 중복실행하지 않고 표시해야 한다. clone/관리예약 해제와 선택조합 변경도 포함. 현재 캔버스 4.73mm는 이전 강재 예제 표시이며 RC 검증 수치로 계상하지 않는다. 수정전 원본 난독화 본체 전체를 변경하지 않는다.


## 2026-09-13 M9 캔버스 공통 결과 연결·관리 메모리

index.html의 기존 SStructuresNativeRuntime shim에 계산 없는 clearAnalysisView/publishAnalysisView를 추가했다. 난독화 본체는 수정하지 않았다. nativeCanvasResult는 공통 선택 static/Direct 결과를 격리 복사해 기존 호환 normalizer를 적용하고 ST.analysis/result/activeCombo에 전달한다. 이전 ST.design은 제거한다. 개별 현재성은 저장 record metadata로 확인하며, 입력변경/선택해제/실패/늦은 결과/복원/dispose에서 캐시를 지운다. 선택변경 및 비동기 성공 후 표시 갱신, 동일 record/조합 재조회시 복사재생성 없음. 새 solver 호출 없음. 관리예산을 복사 전에 예약하고 마지막 projection1개만 유지; 교체/실패/해제시 owner 제거. checkpoint release 후 재사용을 위해 subscription은 runtime dispose가 아니라 pagehide에서 해제.

RED focused-2026-09-12T21-20-08-411Z native cache 미전달. 최종 focused-2026-09-12T21-23-20-074Z: 실제 HTML shim VM/격리복사/조합누락·실패·stale clear/메모리예산거부·해제59ms, 실제 Worker CPU/Direct와 늦은 입력 결과 차단·팝업/캐시4548ms, 기존checkpoint62ms PASS. 최초 shim시험21-22-00 실패는 CRLF 검색 및 budget snapshot필드 fixture 오류로 수정. 제품테스트 RED와 구분.

실제 브라우저 최신 코드 reload→repaired checkpoint 복원→Direct 새해석 M9_DIRECT:2026-09-12T21:21:34.920Z:1 완료. 캔버스 기존예제4.73mm가 실제RC0.59mm로 변경됐고 팝업완료/조합M9_BROWSER_U와 일치. get_result_slice의 raw dmax=0.0005855964622431423m(0.585596mm)와 표시면 반올림 일치. evidence output/playwright/phase25-browser/06-native-canvas-current-rc.png 및 native-canvas-currentness.json. 수치/설계식 변경 없음. 그림의 탄성 예비검정은 최종 상세설계 자격으로 계상하지 않는다. PDF 다운로드·렌더/나머지 M0~M10 마감은 잔여.


## 2026-09-13 M9 저장된 WebMCP 평가의 화면 선택 연결

실제 브라우저에서 WebMCP 상세 평가가 존재하지만 UI 상세 결과 새로고침은 로컬 evaluationId가 없어 EVALUATION_REQUIRED로 중단됨을 확인했다. 저장된 상세 검토 목록/명시 선택/불러오기 UI를 추가했다. 공통 context는 저장 평가의 sources를 격리 복사해 반환한다. 불러오기는 입력해시와 stale을 context 및 조회 결과에서 확인하고, 후보 화면을 무효화한 뒤 동일 평가와 정확한 출처를 채택한다. 자동 최신 평가 선택이나 새 계산은 하지 않는다. 구버전 출처 없는 기록의 빈 sources는 임의 추정하지 않는다.

새 UI 시험 RED: p25-m9-stored-evaluation-ui 직접실행에서 선택 버튼 누락 재현. 최종 focused-2026-09-12T21-31-04-234Z: 선택/오래된 기록 거부113ms, PDF전권UI104ms, 명시 해석재사용UI182ms, 실제 WebMCP 보완/재사용/출처 조회·변조격리4339ms PASS. 브라우저에서 새 선택 UI의 reload 후 확인은 잔여.

기존 브라우저에서 제공 상세 검토 버튼으로 동일 evaluation-f6de2205fdb803b82ce06072d22be5d58efc177af30b0a792b6191fcb618c93e 채택: 208검사, NG4/미검토117/실패0 유지. PDF 전권 ZIP UI는 4권203쪽 생성 및 다운로드 요청 완료 메시지 표시(기존 197쪽 생성물과 다른 평가/출력). 실제 다운로드 파일 경로·해시·PDF 렌더는 아직 확인하지 못했으므로 파일 검증 완료 아님. 캡처07-ui-pdf-bundle-requested.png에는 보관 artifact 12793.8KB가 표시되지만 완료문구는 스크롤 아래에 있어 AX 관측과 구분한다. 체크포인트 M9_BROWSER_RC_UI_REPORT_20260913 durable true,9938115bytes,sha256 74d5d4cad67fe111764d21c26bd81481ea7b1096ad6c601a4acd38276344332e; ui-report-checkpoint.json 기록. 실제건물·종합검증·배포 없음. M0~M9 PARTIAL 및 M10 미마감 유지.


## 2026-09-13 M9 전수 검사 필터와 실제 저장 평가 UI 왕복

실제 내부브라우저에서 최신 코드 reload→M9_BROWSER_RC_UI_REPORT_20260913 복원→CPU/Direct 실행 완료. WebMCP에서 evaluation-37bf486abeaf0a2866e07ae54b9f9c85a84ced1685cd929130e5518a21d215f4 평가를 생성한 뒤 UI 저장된 상세 검토 목록/명시 선택/불러오기로 동일208검사(NG4/미검토117/실패0) 및 KDS근거 표시 확인. UI 제공 상세 검토 버튼 재실행 없이 조회했다. 이전 복원 평가들은 이전 입력·기준으로 표시된다. evidence: output/playwright/phase25-browser/stored-evaluation-ui.json,08-stored-webmcp-evaluation-ui.png. CPU source21:33:15.604Z:1,Direct21:33:16.593Z:2. 이 브라우저 로드는 아래 필터 추가 전 코드다.

M9 원래 계획의 검사 필터 미구현을 보완했다. get_practical_design_result와 UI에 status/entityId/comboId/checkId/reason 정확일치 복합 필터 추가. 필터된 행 순서에서 offset/nextOffset을 계산하고 filteredTotal을 별도 반환한다. 기존 total 및 전체 summary/남은보완 요약은 필터로 축소하지 않는다. 새 계산/원본 검사 삭제 없음. 필터 스키마와 런타임은 같은 허용 필드/길이/상태를 사용한다. UI 적용/해제/이전/다음/새로고침에 적용된 필터를 보존한다. 새 평가를 표시할 때 반환 필터가 없으면 페이지 조회의 적용 필터도 해제된다.

TDD RED focused-2026-09-12T21-33-43-688Z 실제서비스 필터 계약 누락; UI 직접시험에서 필터버튼 누락 재현. 최종 focused-2026-09-12T21-36-36-790Z: 필터경계50ms/UI선택·필터페이지178ms/실제WebMCP 보완 후 필터전수paging·요약불변4682ms/브라우저등록303ms/PDF버튼101ms PASS. 잘못된 필터 거부, 빈 결과, 중복·누락 없는 전수페이지 확인. 실제브라우저 필터 기능 reload 확인·PDF 실제파일확보/렌더·원래 다른 마일스톤 미마감은 잔여. 실제건물·종합검증·배포 미실행.


## 2026-09-13 M7 출력 현재성 조회 최적화·M8 실제 PDF 파일 확보

출력 artifact의 매 조각 조회·목록·시작/게시 현재성 확인이 getEvaluation으로 검사 첫 페이지를 반복 복사하는 경로를 제거했다. practicalWorkflow getEvaluationStatus는 같은 read/stale 검증(입력·규칙·해석출처)을 사용하되 검사/요약은 만들지 않는다. drawingExportService는 compact status를 사용하고 이전 workflow stub에는 기존 조회 fallback을 유지한다. 전체 출처 검사 자체를 캐시하거나 생략하지 않았다. 필터 화면도 새 unfiltered 평가를 채택하면 표시 입력과 적용 필터를 함께 비운다.

TDD RED21-39-22-749Z: 불필요 검사페이지 복사를 오류로 만드는 fixture에서 Worker진입 전 실패 재현. 최초21-39-03은 started만 기다린 fixture의 unsettled await라 제품증거와 구분한다. 최종 focused-2026-09-12T21-44-44-928Z: UI필터 표시/적용 일치213ms, 실제Worker 출력 취소·stale·해제 및 compact현재성314ms, 기존실제PDF출력591ms PASS. 21-39-40에는 필터경계도56ms PASS.

실제브라우저 최신필터 로드→체크포인트 복원 후 metadata에서 Direct21:21:34.920Z:1은 현재 결과임을 확인해 불필요 solver재실행 없이 상세평가. NG필터 UI/WebMCP 모두 e10/e11/e12 최소주근 및 e14 전단보강간격 4건, 전체208건·미검토117 유지. e14 검정비0.000은 전단수요/내력비이고 NG사유는 간격조건이며 수치불일치로 단정하지 않는다. 캡처09-ng-filter-current-summary.png,filter-and-pdf-evidence.json.

브라우저 export_design_drawings pdf volume3 생성: 실제 파일 output/pdf/phase25/browser-rc-volume-4.pdf,3,022,475bytes,23쪽(전체203쪽의181~203),SHA256 e4ecb20a1f2e56d7eeed619cb65f69bcded89a01cd4cf8ea48cad8a674afed99. WebMCP 12288byte 조각의offset/길이/nextOffset/sha/stale 검증,전체hash일치 및 마지막 현재성 재확인 후 저장. 약104초 전송은 CUA도구 중계/병렬조회 포함 시간이며 제품 native UI 다운로드 성능값 아님. 마지막 CUA 표시 bytes147456은 초기 REPL binding snapshot이며 파일stat/hash/manifest의3022475가 실제값. 파일상태 재확인 완료.

Poppler 대표local1/12/23(global181/192/203) PNG 렌더 육안확인: 한글/KDS참조/미검토사유/전권쪽수 판독,겹침/잘림없음. pypdf23쪽/대체문자0/undefined0; .manifest.json/.qa.json/.txt에 기록. 해당권은 기초·접합 누락검사 위주이고 수치설계 통과 증거가 아니다. 영문 내부필드 표현은 여전히 편집 개선 대상. 기존203쪽 전권ZIP 실제 다운로드 파일확보·전체렌더와 구분한다. 저장 후 release_design_drawing_artifact로3,026,659관리bytes해제/보관0 확인; 로컬PDF유지. 실제건물·종합검증·배포 없음. 전체M0~M10 마감 및 M8/M9원래 잔여 유지.


## 2026-09-13 M3 실제 전단 NG의 기계정밀도 잔차 오판정 수정

앞선 NG필터/PDF 확인 당시 e14의 ratio0.000/간격NG는 상세값 확인 전 수치오류로 단정하지 않았다. 이번 저장 check 전수조회로 원인 확정: N=5.1410478232874744e-17kN,Vz=-2.441210207054813e-16kN. kdsMemberShear의 N>0 분기가 무하중 부재의 양의 부동소수 잔차를 인장으로 취급해 Vc=0으로 만들고, 미소V>0 때문에 concrete-only 경로가 해제되어 간격NG가 발생했다. 전단수요/내력비 자체와 간격판정의 차이만으로 설명할 수 없는 실제 수치 분류 결함이었다.

평가버전 v182-shear-force-roundoff. 유효입력 검증 뒤 축력/전단력의 절대값을 64*Number.EPSILON*max(1kN,fck*(Ag/1000)) 이하에서만0으로 정규화한다. fck MPa/Ag mm²에 대한 section nominal-force scale이며 KDS의 하중감소·내력 허용오차가 아니다. 곱셈순서를 나눗셈뒤로 두어 중간 overflow를 피한다. rawAxial/rawShear/usedAxial/usedShear/tolerance/basis/version을 forceNormalization에 기록하고 solver의 concurrentDemand는 변경하지 않는다. 진짜 양의 인장/음의 수요입력 거부/전단·비틀림 조건은 유지한다.

TDD 직접 RED p25-m3-shear-roundoff: 실제잔차값 NG != 무하중OK 재현. 실제작은인장1e-6kN/전단1e-5kN 및 2*tolerance는 인장·간격NG유지; 큰전단+미소축력은 순수전단과 일치. 최종 focused-2026-09-12T21-50-12-121Z: roundoff95ms,실제WebMCP전단보완5522ms,고강도83ms,비틀림routing159ms PASS. 앞서 전단간격제안127ms도PASS.

통합시험 p25-m6-webmcp-shear-repair의 기존fixture는 현재공간후프폐합에 필요한 corner/separation이 없어서 SPATIAL_FIT_CLOSURE_PATH_REQUIRED로 먼저실패(21-48-35). 합성상세에 +y+z/0.03m명시. 이후 보완성공했으나 예전시험이 축약comparison의 빈 KDS배열을 검사해실패(21-49-16); truncated/count/hash 계약은제품정상. 저장된 designComparisonDetails의 전체근거를 검사하고 출력/복원전수근거일치를 확인하도록시험수정. 제품의 공간형상/근거필수조건은완화하지 않음.

실제브라우저 수정코드reload/동일checkpoint복원/동일Direct21:21:34.920Z:1로재평가: 새 evaluation-3276941e3a196eee6c249f283c7d92b61c5ee67bf576c1dea326f97233df764a. e14전단z는 Vc117.57550765359254kN/ratio0/21위치OK. tolerance6.139089236967266e-11kN,원수요보존. 전체208검사유지,NG4→3/OK48→49/미검토117유지. e10/e11/e12실제최소주근NG는그대로. evidence output/playwright/phase25-browser/shear-roundoff-before.json 및 shear-roundoff-after.json. 입력/해석수치/단면·배근을 바꿔 NG를 없앤 것이 아니라 평가기의 잔차분류 수정이다.

기존 browser-rc-volume-4.pdf는v181역사출력으로유지하며 v182최신출력으로재표기하지 않는다. 전체Phase25·M3프로파일/다른마일스톤잔여·전권출력/종합검증은미마감. 실제건물/배포미실행.


## 2026-09-13 M9 검사→입력 이동 및 M2 등록값 UI 보존

결과표에 comboId 열과 입력 보완 버튼을 추가했다. concrete 검사 detailId는 실제배근기록으로, requiredInputRecords의 명시record유형/대상은 해당입력으로 연결한다. 임의 기초/접합값을 생성하지 않는다. openRecord는 현재등록값을 공통 practicalCommandFromRecord로 불러오거나 nodeId/memberId만 seed하며, 기존대기변경목록은보존하고미리보기는무효화한다. UI이동은모델수정/해석실행이아니다. 입력수정은명시새버전·변경안·미리보기·적용으로진행한다. 오래된평가/다른현재입력은채우기차단. 표에가로스크롤을둬열이좁아지는문제를줄였다.

실제브라우저 eval182/NG3필터→e10 입력보완 버튼→M9_R_e10@1/e10/4D16/스터럽150mm 입력복원 확인. before/afterinputHash불변. screenshot10-check-to-input-before-optional-fix.png와check-to-input-navigation.json. 이과정에서기존폼의optional select/boolean이첫값으로자동선택되는결함발견: 원기록에없는횡구속/정착/제품catalog등이등록된듯표시됨. optional field.required=false일때빈선택 '미지정'을먼저두어누락값을보존. 공칭배근불러오기도직경3열만써서면적/제품명이사라지던경로를수정: nominalAreaMm2/designation을5열로복원. 기존등록값불러오기와새openRecord모두동일수정.

TDD: openRecord누락RED, optional stabilityStandard가빈값대신KDS로채워지는RED, 공칭면적/제품명누락RED각재현. 최종 focused-2026-09-12T22-00-25-327Z: 실제typed입력폼/현재기록값·m/mm단위/optional누락·nominal재입력전수동일/모델불변/stale차단237ms,공칭WebMCP통합4551ms,기존입력3217msPASS. 앞선21-56-10의RC_FRAME_REQUIRED는추가fixture의type:'frame'누락으로수정. 제품범위검증완화없음.

브라우저캡처는optional오류수정전발견증거이며새optional기능의육안증거로쓰지않는다. 최신코드reload로오래된선택표시는종료했고, 새optional/form재입력은집중시험증거까지만있다. 전체M0~M10·필수업무UI의나머지폼/최종출력·마감미완료. 실제건물/종합검증/배포미실행.


## 2026-09-13 M1 KDS 보류사유 및 M3 압축부재 진단

명시한 횡구속 단일 압축부재의 공개 WebMCP→CPU→4개 조합 진단을 tools/inspect-p25-compression-profile.mjs 및 verification/evidence/phase25/compression-profile-20260913.json에 보존했다. 실제 건물 또는 자격 통과 시험이 아니다. 띠철근 OK/KDS 미확정은 조항 누락이 아니라 methodReviewRequired=true 때문이다. 축력 부재는 기존 휨 전용 처짐/균열 계산 범위 밖이다. 두 항목을 적합 또는 N_A로 승격하지 않았다.

designCodeBasis v4에 incomplete/위치범위/방법검토/미평가/근거누락/출처불일치의 독립 blockers를 추가하고 reason에 전달했다. 적용 조건은 동일하다. evaluator183으로 기존 평가와 구분한다. 공통 결과로 WebMCP/보고서에 전달. TDD 누락 실패 후 focused-2026-09-12T22-10-49-504Z: 새 사유68ms, 기존 KDS근거219ms, 일반 보 통합4816ms PASS. 압축 진단의 미검토는 유지된다. 압축 사용성 적용 조항/계산 구현, 공간 판정 방법 검토, Direct 국부 안정은 후속 작업. M0~M9 PARTIAL/M10 미마감. 실제 건물·종합검증·배포 미실행.


## 2026-09-13 M3 지속하중 균열폭 및 M0 부록 근거 연결

CRACK_WIDTH_IMPLEMENTATION.md에 공식 원문·독립 산술식·입력·한계·시험을 기록했다. evaluator184: KDS142030:2021 부록 균열폭을 기존 균열단면 평형과 연결, 공개 WebMCP 입력→CPU 압축/단축휨 계산 및 UI 신규 필드 구현. 독립 산술폭0.199512mm/허용0.4mm, 실제 압축 fixture 종방향0. 본문·부록 별도 조항/식 대장으로 같은 번호의 오연결을 차단했다. source manifest 해시 검증 후 생성. focused-2026-09-12T22-23-11-119Z: 새식64ms, 통합2041ms, 기존근거225ms PASS. 이전 focused22-18의 기존 간격/이음 PASS, 22-19 브라우저 정의 PASS. UI 화면11 저장 및 신규 입력 확인. 실제 건물·종합·배포 미실행.

양축 유효인장영역/시간 의존 응력/온도수축 및 특별 균열요구 미완료, methodReviewRequired 유지. 압축 처짐·Direct 국부 안정 포함 원래 M3/M0~M10 완료 조건은 미충족이다. 원 진단의 KDS 미확정을 지우기 위한 N_A 전환이나 무조건 자격 부여 없음.


## 2026-09-13 M3 KDS 탄성 2차 강성 및 M7/M9 연결

KDS_SECOND_ORDER_STIFFNESS.md 참조. KDS142020:2022 4.4.4 보0.35Ig/기둥0.70Ig 및 명시 횡방향 지속하중 비율 보정을 typed 입력→UI/WebMCP→Worker Direct→공통 평가에 연결했다. RC policy v10. 물리 모델 불변, 적용 프로파일 hash/계수/근거 보존. KDS모드는 강도조합 선택 가능. 후보 재해석도 해당 모드 유지. 저장·복원 내부 일치 검사, 취소/메모리 해제 확인.

집중 통합 focused-2026-09-12T22-33-59-972Z 3171ms PASS: 실제 고정단 합모멘트 gross4.211633480613491→지정강성4.224928283584104kNm (0.4666666666666666Ig). UI 새모드/강도조합 인자 focused22-34-52 162ms PASS. 기존 브라우저 정의22-31 PASS. 작은 외팔부재는 강성 전달 시험이며 횡구속 기둥 적합성을 입증하지 않는다. Direct에 국부 확대계수 재곱 없음. 전구간 국부 안정/최소편심·해석경로·횡구속/층별비율 검토는 계속 미완료. M0~M9 PARTIAL/M10 미마감, 실제건물·종합·배포 미실행.


## 2026-09-13 M3 Direct 실제 요소 분할 및 M7 자원 예산

RC policy v11로 KDS 지정강성 모드의 해석 사본을 1→2→4개(설정에 따라 최대8개) 요소로 분할한다. refineFrameModel.js는 부재·절점 ID를 분리하고 점하중/부재모멘트의 위치, 선형분포하중의 구간과 강도를 옮긴다. 원 모델과 물리 단면은 불변이다. 편심/회전릴리스·스프링/변단면/패널 등 분할 전달을 검증하지 않은 경로는 명시적으로 거부하며 전체 기존 Direct 기능을 제거하지 않는다. KDS 새모드의 제한이다.

collapseFrameResult.js는 원 부재 ID로 결과를 복원하며 각 요소의 탄성+기하강성 forceRecoveryInput을 piecewise로 보존한다. 단부 모멘트 직선 보간으로 국부 효과를 지우지 않는다. 분할점의 하중 불연속을 제외한 평형을 검사한다. 실제 분할 모델의 물리 절점 변위·회전, 두 분할의 복원 위치 합집합에서 축력/전단/비틀림/휨을 비교하고 수렴해야 결과를 제공한다. 공간 수렴 실패는 KDS_SECOND_ORDER_FRAME_REFINEMENT_LIMIT로 남긴다. 같은 최종 분할의 1차 seed와 2차 결과를 복원해 총모멘트 비교를 재생성한다.

WebMCP 기존 run_rc_service_iteration의 KDS 모드에서 spatialTolerance/maxRefinements를 사용한다. 설정 저장·복원 시 분할 수준/수렴값/허용값/프로파일 근거가 일치해야 한다. 취소 경로와 10초 Worker 제한을 유지하고, 사전 메모리 예산은 최대 분할 절점의 dense 행렬과 최대600개 부재 결과 위치를 포함하도록 확대했다. maximumAnalysisDofs는 추정 상한이며 실측 heap이 아니다. 프로젝트보다 완화하지 않는 반복 수/허용오차를 사본 해석에 명시 적용한다.

작은 독립 Euler-Bernoulli 외팔 beam-column 공식: 기대 끝변위0.00029717731488474006m. 1/2/4/8요소 절대오차 각각2.783265772802329e-10,2.123637024694855e-11,1.387193528448738e-12,8.761529913040023e-14m. 원 fixture의 전단변형 기본값을 켠 상태는 이 공식의 조건과 달라 별도였고, 시험에서 전단변형을 명시 false로 맞췄다. 제품의 전단변형 선택을 무단 변경하지 않았다. 상승 삼각형하중 합력6kN·1차모멘트12kNm, 경계 점하중 위치1.5m 보존 확인.

집중 실행 focused-2026-09-12T22-49-34-229Z: 분할970ms, 공개 Worker/평가/저장복원/취소3069ms, UI157ms PASS. 합력·1차모멘트·점하중 위치 추가 검증 focused-2026-09-12T22-50-17-116Z 960ms PASS. 전체 실제건물/종합/배포 미실행. 수렴은 독립 방법 인증 또는 전체KDS 적합이 아니며 globalMethodQualified=false 유지. prepareProvidedStability의 기준별 국부 안정 판정 연결, 최소편심·횡구속·세장 효과 적용성, Timoshenko 기하강성의 기존 한계는 후속으로 남는다. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M3 분할 Direct 안정 검토 연결 (evaluator185)

`refinedDirectStability.js`를 `prepareProvidedStability`에 연결했다. 현재 입력 hash·RC 강성 정책·실제 적용 계수 근거, 분할 수렴과 절단점 평형, Direct 수렴/해석기 제한, 현 판본의 전 부재 구간 모멘트 비교를 확인한다. 충족하면 rc-stability 계산은 OK, 1.4 한계 초과는 NG, 필요한 근거가 없으면 NOT_CHECKED로 반환한다. 이미 2차 해석한 부재력에 국부 magnifier를 다시 곱하지 않는다. KDS142020 4.4.2(2),(3),(4) 및 4.4.4 참조와 적용 강성/분할 근거를 결과에 보존한다. 계산 완료와 방법 자격은 별개로 methodReviewRequired=true, globalStabilityQualified=false, designTransferAllowed=false를 유지한다.

공개 Worker→평가 snapshot에서 memberResults.refinement가 누락되어 정상 수렴 결과도 미검토가 되던 문제를 수정했다. 추가 TDD에서 이전 판본 모멘트 비교의 EXCEEDS 문자열이 현재 NG가 되던 오류를 재현하고 차단했다. 원 모델 변경, Timoshenko 등 formulation 제한, 평형 근거 소실, 구판 비교를 각각 미검토로 확인했다. 현 판본 초과 NG 및 영점 분모 ratio=null도 검사한다.

증거: snapshot RED focused-2026-09-12T22-53-27-298Z → 통합 GREEN focused-2026-09-12T22-54-01-258Z. 구판 비교 RED focused-2026-09-12T22-58-21-662Z → GREEN focused-2026-09-12T22-58-37-399Z (새 통합3157ms/기존 비교3670ms). 저장·복원 후 실제 재평가까지 추가한 최종 focused-2026-09-12T22-59-34-527Z 3364ms PASS. 공개 WebMCP 입력/실제 Worker/평가/체크포인트 재평가/취소 해제를 포함하며 실제 브라우저 화면 또는 실제 건물 종합 검증을 대신하지 않는다.

이전 기록의 'Direct 안정 판정 연결 잔여' 중 위의 명시 지정강성·분할 경로 연결은 구현했다. 압축부재 사용성, 이축 균열/시간 의존 단면 응력, 모델 초기 불완전성과 독립 방법 검증은 여전히 잔여다. M0~M9 PARTIAL/M10 미마감을 유지하며 전체 완료 또는 배포를 주장하지 않는다.


## 2026-09-13 M3 분할 Direct 순간 횡처짐 연결 (evaluator186 / RC policy12)

분할 해석 내부 절점을 제거하기 전에 실제 변위·회전을 원 부재 좌표로 변환하여 구간별 Hermite 변위장을 보존한다(`refinedFrameServiceResponses.js`). `candidateAnalysisSnapshot`은 `memberServiceResponses`를 전달한다. 기존 `instant-live-frame` 입력과 공개 `run_rc_service_iteration`의 KDS 지정강성 모드를 연결했다. 명시 전체 D+L 및 기준 D 조합의 변위장을 동일 위치에서 차감한 뒤 chord/고정단 기준 v/w 극값을 구한다. 압축력이 존재해도 휨만 허용하는 Ie 곡률 적분으로 되돌아가지 않는다.

현재 입력·강성 정책·분할 평형/수렴·Direct 제한·비교 판본 근거가 모두 있는 두 결과에 한정한다. 누락 시 REFINED_FRAME_SERVICE_PROOF_REQUIRED 및 원 차단 사유를 보존한다. 기존 RC 이음 프레임 경로도 유지하고 frameSourceMethod로 구분한다. 분할 수렴 비교에 양축의 세 가지 기준 처짐 극값을 추가했다. 근사 변위장에는 하중 particular solution을 임의로 추가하지 않으며 loadParticularSolutionIncluded=false를 유지한다. 이 결과는 지정강성 해석의 순간 횡처짐이며 장기 크리프/수축·축방향 단축이나 전체 압축부재 사용성 완료가 아니다. 사용자가 명시한 live-floor/live-roof 한도를 적용하고 KDS142030 4.2.1/Table4.2-2 참조와 방법 검토 미완료(incomplete=true, methodReviewRequired=true)를 함께 출력한다.

메모리 사전 예약 v4는 최대 분할 수 × 부재 수 × 조합 수의 변위장/극값/전달 사본 예산을 별도 포함한다. 부재 조회는 Map을 사용한다. 평가186/RC policy12로 결과 판본을 갱신하여 구판의 미보존 변위장을 현재 근거로 재사용하지 않는다.

TDD RED focused-2026-09-12T23-02-48-602Z: 공개 서비스 평가가 원래 rc-splice-frame 이외 해석 결과를 받지 못함. GREEN focused-2026-09-12T23-03-21-429Z. 최종 인접 확인 focused-2026-09-12T23-04-26-287Z: 새 공개 경로5420ms, 기존 이음 WebMCP3127ms, 독립 외팔 beam-column/분할 변위955ms PASS. 후속 근거 누락/메모리 반영 focused-2026-09-12T23-05-32-668Z 5424ms PASS. 작은 합성 압축+횡하중 부재의 증가 횡처짐0.00031625562631778245m, 명시한 L/360 한도0.008333333333333333m. 실제 건물이나 독립 KDS 방법 자격 증거가 아니다.

M3 남은 범위: 장기 시간 의존 응력·크리프/수축, 이축 균열폭 및 전체 압축부재 프로파일 통합. M0~M9 PARTIAL/M10 미마감 유지. 실제 브라우저·종합 캠페인·배포 미실행.


## 2026-09-13 M0/M1/M9 계산 방식별 KDS 근거·WebMCP 조회 정합성

코드 대조에서 Direct 지정강성의 실제 4.4.4 경로에도 기본 4.4.6 검토 대상이 붙고, 부록 균열폭에는 본문 4.1/4.2 검토 대상이 붙는 표시 불일치를 확인했다. `designCodeBasis` v5 / evaluator187에서 Direct 경로는 4.4.2(2),(3),(4)/4.4.4를, 부록 경로는 appendix namespace를 유지한다. 1차 기둥 기본 검토 조항은 유지한다. 중복 참조를 제거하되 계산 적용/방법 검토 blocker나 전체 적합 상태를 완화하지 않는다. RED focused-2026-09-12T23-07-42-466Z → GREEN 23-08-10.

`designModuleCapabilities` v34와 선언형 rule registry에 최근 Direct 안정·순간 횡처짐·부록 균열폭 구현을 반영했다. 새 `rcDirectCapabilities.js`는 수치 모듈을 import하지 않으며 member-review의 analysisCapabilities.rcDirect로 모드/3개 실제 제어 도구/검사/분할 상한/잔여 방법 검토를 조회한다. reinforcement와 member-review의 currentTools에도 실제 RC 반복 실행·조회·취소를 연결했다. 이전에는 기능은 구현됐어도 모듈 조회에 제어 도구가 없었다.

전체 모듈 조회에 상세를 중복 추가하면 48,000자 한도를 넘는 것을 재현했다(23-09-54 RESULT_TOO_LARGE). 한도를 늘리지 않고 새 공통 설명을 간결하게 만들고 member-review에서 수치 기능을 소유하도록 했다. 입력 세부 한도는 기존 공유 schema/개발 문서를 사용한다. 전체 8개 모듈 및 각 moduleId 조회 일치·실제 도구 등록·모델 불변 검증 PASS. 원래 부분구현/productionQualified=false는 유지하며 규칙 대장 변경에 따라 rulePackHash도 갱신된다.

최종 집중 증거 focused-2026-09-12T23-11-38-937Z: 코드 근거69ms, 실제 WebMCP 8모듈1395ms, 공개 Worker Direct/안정/사용성/복원/취소5626ms PASS. 실제 화면·종합 회귀·배포 미실행. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M7 RC 반복 Worker 종료 실패 예약 보존

RC 반복이 공통 Worker에 budget을 전달하지 않아 종료 실패 뒤 1,051,744 bytes 예약을 0으로 해제하는 오류를 TDD로 재현/수정했다. 동일 pre-clone owner를 Worker에 전달하고 quarantine→새 실행 거부→실제 exit 후 해제, dispose/clone 이전 부족 거부를 확인했다. shared 호출자는 기존 독립 owner 유지. 상세/정확한 증거는 [M7_RC_WORKER_OWNERSHIP.md](M7_RC_WORKER_OWNERSHIP.md). 실제 Node 취소약14.63ms, 브라우저/전체heap 자격 아님. 최종 focused-2026-09-12T23-15-21-582Z (160/57ms), 실제 Direct 인접5485ms PASS. M7 전체 감사 및 원래 Phase 잔여 유지.


## 2026-09-13 M7/M9 분할 변위장 복원 검증

RC policy12 현재 판본의 checkpoint는 checksum/프로파일/분할 trace를 확인했으나 새 memberServiceResponses의 누락·연속성·저장 극값을 검사하지 않았다. `verifyRefinedFrameServiceResponses`를 restore의 복사/등록 전에 연결했다. 최대30부재, 부재별2~8구간, forceRecoveryInput 길이와 변위장 길이, 부재 ID, 구간 연속성 및 실제 구간 변위에서 다시 준비한 결과와 저장된 극값/metadata의 일치를 검증한다. 손상은 RC_CHECKPOINT_INVALID로 거부한다. 구판은 기존 정책상 stale 처리하며 현재 판본으로 재결속하지 않는다.

직접 oracle 검사에서는 정상2/4/8분할, 필드누락, 극값변조, 구간변위 불연속을 확인했다. 실제 공개 WebMCP로 저장한 checkpoint의 RC 상태에서 변위장 누락/극값변조 후 내부 resultHash와 checksum까지 다시 계산하여도 restore가 거부하고 결과0건·예약0을 유지하는 것을 추가 확인했다. 정상 공개 저장→복원→재평가는 계속 통과한다. 새 검증은 형상/보존 데이터 검증이며 별도 구조 재해석을 실행하지 않는다.

focused-2026-09-12T23-18-18-862Z: 분할/변위검증983ms, 공개경로5468ms PASS. 실제 저장 상태 손상 주입을 추가한 focused-2026-09-12T23-19-01-355Z 5434ms PASS. 실제 브라우저·종합 수치·전체heap 캠페인 미실행. M7/M9 및 전체 Phase의 원래 마감 조건은 계속 남아 있다.


## 2026-09-13 M3 장기 해석과 균열폭 응력 기준 혼합 차단

현재 코드를 대조한 결과 sustained-effective-modulus 해석은 지정 유효탄성계수를 사용하지만, 부록 균열폭 owner는 전달받은 부재력에서 원래 단기 Ec로 단면 응력을 다시 계산했다. 장기 변형/응력 경로가 구현되지 않은 상태에서 이 조합을 수치 OK로 내보내는 것은 잘못된 연결이다. evaluator188은 CRACK_WIDTH_TIME_DEPENDENT_SECTION_STRESS_REQUIRED/NOT_CHECKED와 sourceTimeEffect·실제 적용 creep effect를 반환한다. 일반 순간 단면/기존 균열폭 계산을 제거하지 않는다. 이 차단은 장기 균열폭 구현 완료가 아니다.

RC policy13은 조합별 creepEffects(재하/평가 재령, 지정계수, 재하 탄성계수, 실제 effectiveE, material 판본과 출처)를 원천 set과 candidate snapshot에 보존한다. 일반 조회 응답의 stiffness 요약을 크게 늘리지 않고 기존 결과 detail 청크/상세 평가로 근거를 전달한다. 구판 결과는 기존 정책 기준으로 stale이며 현재 계산으로 재결속하지 않는다.

TDD RED focused-2026-09-12T23-21-52-151Z → GREEN focused-2026-09-12T23-22-58-726Z: 기존/차단 균열폭2192ms, 크리프 독립 축변형 및 공개 Worker4720ms. 실제 공개 장기 해석→부록 균열 검토까지 입력을 연결한 최종 focused-2026-09-12T23-23-35-252Z 4746ms PASS: source effectiveE=10000MPa, coefficient=2가 전달되고 균열폭은 정확한 미구현 사유를 반환한다. 기존 독립 합성축변형/철근력 평형은 유지된다.

후속 필수 구현은 장기 단면 응력(재하 이력·구속/수축 포함 범위)을 균열폭의 철근응력/유효인장영역/평균변형률과 일관되게 연결하는 것이다. 코드에서 단기 Ec만 단순 치환해 완료하지 않는다. 문헌 조사에서 FHWA LRFD Reference Manual의 재하재령 Ec와 크리프 계수 정규화 기준 탄성계수가 구분되는 설명을 확인했다: https://www.fhwa.dot.gov/bridge/pubs/nhi15047.pdf (검색에 제공된 Chapter5 발췌 확인; 전체 문서/공식 KDS 식 적합성 검증은 아님). 기존 Nebraska P530 원문은 웹 도구의 11MB 응답 한도로 열리지 않았으며 검증 완료로 바꾸지 않았다. 이 자료는 KDS 규정의 대체 근거가 아니다.

M0~M9 PARTIAL/M10 미마감, 장기 균열·수축/이축 검토 잔여 유지. 실제 건물·전체 종합·배포 미실행.


## 2026-09-13 M3 재료별 초기변형 단면 kernel

cracked section v3/RC policy14/evaluator189: 콘크리트/철근의 독립 초기변형을 압축 영역·응력·철근 치환 콘크리트·접선/평형 출력에 반영. 독립 전체압축식 ε=−0.0005476851851851852, steel−131.4444kN+concrete−368.5556kN=−500kN 확인. 동일 자유변형 및 부분 압축 이축 불변성/영초기변형 호환 PASS. 상세 [INITIAL_STRAIN_IMPLEMENTATION.md](INITIAL_STRAIN_IMPLEMENTATION.md). focused-2026-09-12T23-27-16-040Z 56ms, 기존 균열/크리프 인접 PASS. 아직 초기변형 등가하중/profile/WebMCP 입력/장기 균열 연결은 남으며 전체 완료 아님.


## 2026-09-13 M3 골조 초기변형 등가하중·변위 복원

Private flexibility profile에 `initialGeneralizedStrain=[epsilon,kappaY,kappaZ]`를 추가했다. epsilon은 무차원, 곡률은 1/m이며 원 부재 좌표의 generalized strain이다. coupled flexibility가 있는 명시 구간에서만 허용하며 부정확한 벡터/비유한 값을 거부한다. 물리 모델을 수정하지 않는다. profile hash와 taper snapshot에 초기변형을 포함한다.

Force-based basic formulation에서 d0=∫Rᵀε0 dx를 준비하고 q0=−BᵀF⁻¹d0를 기존 fixed-end 벡터에 더한다. 외력과 같이 단부 release/연결 처리 및 전역 조립을 거친다. 이 항을 후처리 표시값에만 더하지 않는다. 부재 내부 변위 적분도 실제 compliance×부재력에 구간 초기변형을 더하며 기존 온도하중의 별도 초기변형을 중복 생성하지 않는다. profile 반복 수렴 검사에도 초기변형 차이를 포함했다.

독립 확인: 길이3m의 자유단 부재, 초기 epsilon=−.0003/kappaY=.0004/kappaZ=−.0002에서 축변위−.0009m, 양축 끝변위−.0009m/.0018m, 회전ry=−.0012/rz=−.0006rad를 회복한다. 완전 구속에서는 EA=1e6kN에 대해 인장축력300kN. 중간1.5m 위치 변위/회전도 독립 적분식과 일치한다. 두 반구간의 초기변형이 서로 다를 때는 축/회전의 구간 적분과 횡변위의 (L−x) 가중 적분을 별도로 검증했다.

RED focused-2026-09-12T23-30-41-097Z → GREEN23-31-22. 내부 변위/기존 실제 크리프 인접 focused-2026-09-12T23-32-34-834Z 428/4773ms PASS. 최종 구간별 독립 적분/입력거부 focused-2026-09-12T23-33-28-483Z 506ms PASS. flexural profile v3/taper v4/RC policy15/evaluator190.

이 단계는 명시 초기변형 profile의 실제 골조 전달이다. 다음은 재료의 지정 수축 입력 및 단면 평형에서 `strain−flexibility×demand`로 얻는 초기변형 항을 coupled 반복에 연결하는 작업이다. 아직 공개 입력에서 건조수축/시간 이력 전체를 해석한다고 주장하지 않는다. 장기 균열폭/인장강성·부착/전역 시간 이력은 잔여. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M2/M3 지정 자유수축 입력과 공개 반복 해석 연결

재료 공통 typed schema/UI/WebMCP에 shrinkageMicrostrain(양수 수축량, με)과 shrinkageReference를 추가했다. 기존 creepLoadingAgeDays~creepEvaluationAgeDays 구간의 지정 자유수축이며 시간별 수축을 자동 예측하지 않는다. 관련 크리프 재령/탄성계수/근거와 함께 저장·검증한다. 값이나 근거의 부분 입력은 거부하고, 동일 재령에서 비영 수축은 거부한다. 0~20000με 한도는 수치 입력 보호이며 코드 허용수축 기준이 아니다.

지속 유효탄성계수 모드에서는 εc0=−shrinkageMicrostrain/1e6, εs0=0을 단면 kernel에 적용한다. 각 실제 평형에서 `initial strain offset = total strain − flexibility × concurrent section demand`를 계산하고 frame 좌표로 변환해 private profile에 전달한다. 이를 통해 강성 변화와 초기변형에 따른 등가하중/변위가 함께 반복된다. 수축을 입력하지 않은 기존 모드에는 임의 초기변형 항을 추가하지 않는다. instantaneous 모드는 기존 순간 상태를 유지한다.

공개 run_rc_service_iteration/get_rc_service_iteration은 specifiedShrinkageIncluded를 표시한다. source creepEffects 및 get_rc_service_bar_forces는 실제 재료 초기변형/단면 초기변형 항을 전달한다. 재령/수축/계수/근거를 복원 가능한 원천에 보존하며 timeHistoryCreepRedistributionIncluded=false를 유지한다. concrete creep v2/coupled iteration v6/RC policy16/evaluator191.

집중 TDD: typed schema RED focused-2026-09-12T23-35-44-792Z → GREEN focused-2026-09-12T23-36-38-059Z 입력1333ms/실제 해석6614ms. 결과/철근력 공개 초기변형 조회까지 연결한 최종 focused-2026-09-12T23-37-44-335Z 6727ms PASS. Ec,eff=10000MPa, 4D20, .3×.6m, 길이3m, 축압축500kN 및 지정 자유수축300με에서 독립 합성단면식 기대 축변위−0.0015201090643588674m, 실제−0.0015201090643588685m. 물리 입력 hash 불변 및 기존 단기/크리프 경로를 확인했다.

선택한 압축 전용 콘크리트/탄성 철근 모델에서의 명시 수축 근사 구현이다. 자유 수축만으로 발생하는 인장 콘크리트/부착·tension stiffening, ageing/시간별 응력이력, 전체 장기 균열폭 방법은 구현 완료로 주장하지 않는다. 이전 기록의 '재료 수축 입력/profile/WebMCP 연결 잔여' 중 위 범위는 구현했고, 장기 균열폭/전체 프로파일 마감은 계속 잔여다. M0~M9 PARTIAL/M10 미마감 유지.


## 2026-09-13 M3 동일 장기 재료 상태의 위치별 단면 응력

`sustainedSectionStress.js`/evaluator192: 공개 장기 해석 source의 current model hash/RC policy/mode/조합을 확인하고, 원 재료에서 다시 확인한 creep effect(재료 판본·재령·탄성계수·수축·근거)가 저장 source와 동일할 때만 위치별 단면 평형을 계산한다. 원천 해석과 동일한 effectiveE 및 지정 수축 초기변형을 사용하고 철근력/총변형률/순콘크리트력/잔차를 준비된 결과로 남긴다. 부록 균열폭 owner는 이 preparedSectionStress를 제공하며 더 이상 단기 Ec로 대체하지 않는다.

현재 전체 장기 균열폭 판정은 NOT_CHECKED를 유지한다. 단면 응력이 준비되면 사유가 CRACK_WIDTH_TIME_DEPENDENT_MEAN_STRAIN_REQUIRED로 구체화된다. source/재료 상태가 다르면 준비 실패 사유를 보존한다. 철근 항복강도 또는 콘크리트 압축강도를 초과한 탄성 상태는 SUSTAINED_SECTION_ELASTIC_RANGE_EXCEEDED로 차단한다. 유효탄성계수 평형 결과를 곧바로 평균 균열변형률의 KDS 적합으로 승격하지 않는다.

공개 WebMCP→Worker 장기 해석→균열 상세에서 Ec,eff=10000MPa 및 −50kN 축평형을 확인했다. 실제 source의 effectiveE를1MPa 변경하면 상태 불일치, 과도한 인장 수요는 탄성범위 초과를 반환한다. 기존 순간 균열/지정 수축 실제 해석도 유지된다. focused-2026-09-12T23-40-35-003Z (2066/6899ms), 최종 focused-2026-09-12T23-41-32-075Z 6854ms PASS. 장기 평균변형률·이축 유효영역·시간 이력/인장강성 및 전체 마일스톤 잔여 유지.


## 2026-09-13 M3 지속 단면 응력→부록 평균 균열변형률 연결

공식 저장 원문 KDS-142030-official.json의 부록 sort187,195,203~205 및 기호 sort146/151/159를 다시 읽었다. 식4.1-7은 균열단면 철근응력과 Es/Ec를 사용하며 기존 scalar owner가 해당 식을 이미 구현했다. 별도 시간계수를 임의로 추가하지 않는다. 웹 재검색은 비공식 재게시본도 반환했으므로 그 페이지를 새 공식 근거로 채택하지 않았다. 이 확인은 저장된2021판본 대조이지 최신 모든 개정판 검증이 아니다.

Evaluator193은 수축 초기변형이0인 지속 유효탄성계수 source에 대해 검증된 동일상태 단면 응력의 철근력을 기존 부록 평균변형률 식으로 전달한다. sectionConcreteModulus는 source의 effectiveE, meanStrainConcreteModulus는 부록 기호 Ec에 대응해 지정한 원 재료 Ec로 명시한다. 유효탄성계수 응력 근사와 이 연결의 독립 방법 검토(methodReviewRequired)는 유지한다. 단면의 양축 회전/응력과 기존 유효인장영역 적용 조건도 보존한다.

실제 공개 지속 압축 해석→상세의 종방향 인장 없음은0을 계산한다. 별도 지정 압축+단축휨 수요의 단계 결합 검증에서는 sectionE=10000MPa, meanStrainE=30000MPa, 폭0.0942675984356412mm. 평균변형률 및 폭을 식4.1-7/4.1-2로 별도 산술 확인했다. 이 휨 수요는 계산 연결 시험이며 전체 휨 골조 E2E 증거는 아니다. 기존 지정 수축 실제 해석 변위도 유지된다.

focused-2026-09-12T23-44-31-211Z 기존 균열2068ms/공개 장기6814ms, 최종 focused-2026-09-12T23-45-50-048Z 6901ms PASS. 수축 초기변형이 비영인 경우는 CRACK_WIDTH_SHRINKAGE_MEAN_STRAIN_REQUIRED로 별도 미완료를 남긴다. 일반 이축 유효영역·수축/부착/인장강성·시간 이력 및 전체 마일스톤 마감은 잔여다. 이전 '평균 장기 균열변형률 전부 미구현' 기록 중 위 명시 무수축 경로의 계산 연결은 이번에 구현했다.


## 2026-09-13 M3 실제 지속 휨 WebMCP 연결 및 미검토 진단

Evaluator194. 실제 WebMCP Worker로 길이3m 외팔부재에 축압축20kN, 전역-Y 끝하중8kN을 적용했다. 기본 로컬축의 My 최대24kN.m가 외력 평형식과 일치한다. 원천 해석을 공개 practical evaluation에 연결한 고정단 균열폭은0.1397106402840814mm다. 전체21개 위치 중13개 계산 OK,8개 미검토이며 전체 상태는 NOT_CHECKED를 유지한다. 이전 지정 부재력만 사용하는 시험과 구분되는 실제 하중→해석→평가 연결 증거다.

8개 미검토는 감소하는 휨모멘트 구간에서 유효인장영역에 철근이 없거나 인장 철근이 없는 조건이다. 이 상태를 곧바로 배근 부족 NG 또는 해석 오류로 단정하지 않는다. 현재 압축 전용 균열 단면과 균열폭 적용 조건의 연결 한계를 포함하므로 비균열 상태/균열 이력 판단은 별도 방법 검토가 필요하다. 자동 배근 추가를 자격 없는 상태에서 실행하지 않는다.

providedCrackWidth는 이 두 미검토 경로에서 버리던 동일 상태 단면응력 trace를 보존하고 reinforcementDiagnostic에 인장면, 유효영역 깊이, 철근 깊이와 응력, 단위 및 automaticRepairQualified=false를 반환한다. WebMCP 평가 snapshot의 지배 미검토 위치에도 이 진단이 전달됨을 검증했다. 평가 버전 갱신으로 과거 결과와 구분한다.

첫 시험은 로컬축을 Mz로 가정한 fixture 오류였으며 My로 정정했다. 이후 전체 판정 OK를 기대한 시험은 실제8개 미검토를 발견했다. 미검토 자체를 삭제하지 않고 진단 보존을 수정했다. 최종 focused-2026-09-12T23-53-27-839Z: 공개 장기/휨/수축9018ms, 기존 균열2063ms PASS. 실제 건물·전체 캠페인·배포는 수행하지 않았다. M0~M9 PARTIAL, M10 미마감은 유지한다.


## 2026-09-13 M3 KDS 인장철근량과 유효콘크리트면적 분리 수정

Evaluator195. 공식 저장 KDS142030:2021 부록 sort139/140/200/201/202를 MathType 식까지 직접 재대조했다. As는 휨부재 인장철근량이며 식4.1-5는 As/Acte, 식4.1-6은 Acte=b*dcte다. 코드가 dcte 밖에 철근 중심이 있다는 이유로 인장철근량 자체를 버리던 추가 필터를 제거했다. 유효인장깊이는 콘크리트 면적 계산에 적용하고 실제 인장 철근량은 별도로 유지한다. 면적·철근 깊이·응력·근거 설명을 준비 결과에 남긴다.

동일 실제 WebMCP 지속 휨 해석→평가에서21개 위치 중20개 OK/1개 미검토다. 고정단24kN.m와 균열폭0.1397106402840814mm는 유지된다. x=1.8m의 인장철근 중심은 dcte 밖이지만 As=2*pi*20^2/4mm²가 포함되고 rho=As/Acte임을 별도 산술 검증했다. 직전8개 미검토 중7개는 이 추가 필터의 코드 결함이었다. 남은1개는 철근이 모두 압축응력인 위치이므로 CRACK_WIDTH_TENSION_REINFORCEMENT_REQUIRED를 유지한다. 그 위치를 검증 없이 무균열 또는 배근 부족 NG로 바꾸지 않는다.

RED focused-2026-09-12T23-56-26-001Z, GREEN focused-2026-09-12T23-57-05-390Z: 장기/실제 휨/수축9029ms, 기존 균열2051ms PASS. CRACK_WIDTH_RULE_MAP.json에 원문 파일 SHA256/관련 row/식/구현/시험 대응을 기록했다. 저장2021판본의 조항 대조이며 최신 모든 개정판 또는 독립 방법 검토 완료가 아니다. 비균열·균열 이력, 수축 평균변형, 일반 이축 영역 및 전체 마일스톤 잔여는 유지한다.


## 2026-09-13 출력 자원 소유권 보완

폰트 timeout/cancel 후 미완료 loader 예약 조기 해제와 UI 다운로드 배열·Blob URL의 장부 누락을 수정했다. 실제 PDF bundle, 설치 UI 및 N/2N 계상을 집중 확인했다. 상세와 한계는 M7_RC_WORKER_OWNERSHIP.md의 같은 날짜 항목 참조. 최종 focused-2026-09-13T00-05-50-385Z 3건 PASS. 전체 마일스톤 완료 선언은 아님.

## 2026-09-13 복원 검토의 무효화 사유 구분

- 조회 API의 평가 상태·목록·검사 상세에 `staleReasons`를 추가했다. 해석 원천, 계산기 버전, 기준 묶음, 빌드 미확인 복원, 입력 변경을 구별한다.
- 빌드 식별자 없는 저장 결과의 재검토 보호 정책은 유지한다. UI는 이를 입력 변경으로 오표시하지 않으며 저장 결과 채택을 차단한다.
- TDD: 기존 동작에서 두 회귀 테스트 실패 확인. 서비스/메모리 테스트 통과: `focused-2026-09-13T00-22-40-796Z`(3008ms). UI 테스트 통과: `focused-2026-09-13T00-23-01-399Z`(212ms). UI 테스트용 가짜 DOM은 자식 textContent를 합치지 않아 상태 p 요소를 직접 검사하도록 보정했다.
- 이번 수정 뒤 실제 브라우저 재검증은 아직 수행하지 않았다. 수치식과 평가기 버전은 변경하지 않았다. M0–M9 PARTIAL, M10 미완료 상태를 유지한다.

## 2026-09-13 M8 반복 해시 출력 참조화

- recordedCalculationPages의 64자리 16진수 문자열은 완전 일치 기준으로 최초 원문을 보존하고 반복 출력을 H번호/실제 원문 쪽수로 참조한다. 해시 배열은 항목 순서와 중복을 유지한다. 비16진 문자열과 수치 정밀도는 그대로 출력한다.
- 메모리 상한: 해시 사전 최대 2048건. 상한 초과는 원문 출력으로 돌아간다. 저장 결과·수치·KDS 조항은 변경하지 않았다. 도면 포맷 버전 v43-hash-references.
- RED: focused-2026-09-13T00-24-58-796Z. 최종 GREEN: focused-2026-09-13T00-26-17-195Z, shared-records 108ms / bounded-record-text 95ms.
- output/pdf/phase25/hash-references.pdf 및 PNG 1쪽을 실제 렌더링·육안 확인했다. 한글, 원문 해시, 참조, 수치가 잘림 없이 표시된다. 작은 서식 합성 시험이며 전체 203쪽 보고서나 브라우저 출력 재검증은 아니다.
- M8 전체 완료는 아직 아니다. 원래 WORKPACKAGES 완료 조건과 나머지 M0–M10 범위를 유지한다.

## 2026-09-13 M3 압축부재 필수검사 통합 감사

실제 WebMCP preview/apply → CPU 4조합 → practical 평가의 56개 검사 ID를 확인했다. 합성 240mm 정사각 단면·4-D20·D/L 축압축 입력이며 실제 건물이나 횡구속 자격 시험이 아니다.

- U 축력 -28kN: 안정 검사는 OK. 최소 편심 및 증폭 후 단면 강도 검정비 0.03777993636이지만 인장변형률 0.00331826878 < 요구 0.004로 NG. 작은 강도 검정비가 상세 변형률 조건 충족을 뜻하지 않음을 확인했다. `strengthRepairRegions.blocked=true`여서 이 NG의 자동보완 경로를 다음에 점검해야 한다.
- LIVE 처짐은 `long-term-curvature` 방법이 축력을 받는 경우 `UNIAXIAL_FLEXURE_WITHOUT_AXIAL_FORCE_REQUIRED`로 미검토. 기존 순간 frame 방식은 장기/부착 이후 검토를 대신하지 않는다. 다음 수치 작업은 축력·균열·장기 변형의 검토 방법과 현재 프레임 응답 연결이다.
- SUST 전압축 균열폭은 0/OK이나 METHOD_REVIEW_REQUIRED 유지. LIVE/SUST 적합성은 NC, U는 NG. 56개 필수검사를 삭제하거나 N_A로 치환하지 않았다.
- focused-2026-09-13T00-28-40-903Z: 3947ms PASS. 이는 위 진단·미완료 유지 회귀의 통과이며 압축 프로파일 자격 통과가 아니다. 원본 세부 수치: output/phase25/column-profile-audit.json. 초기 00-27-49 실행은 상태 관찰용이며 제품 RED 아님.

M3 전체 및 Phase25 상태는 PARTIAL/IN_PROGRESS를 유지한다.

## 2026-09-13 M6 변형률 NG 자동보완 경로 정정 및 후보 비교 개선

앞선 압축 프로파일 감사의 “자동보완 차단”은 전체 경로에 대한 결론이 아니었다. `strengthRepairRegions.blocked`는 철근 개수 증가 방식에만 적용된다. 실제 `memberReinforcementProposal`은 단면 확대 방식으로 이어지며, WebMCP 계획→후보 1건→4조합 재해석·전체 평가가 동작했다. 300×240 후보는 잔여 NG/NC가 있으므로 적용·완료로 세지 않았다.

- 후보 점수 v3: 최소 인장변형률 NG는 저장된 양의 minStrain/tensionStrain으로 부족 정도를 정량화한다. 기존 강도비도 1 초과면 큰 값을 사용한다. 변형률 누락·0·음수·모순은 미정량 NG로 보존한다. 전체 NG/NC/FAILED 우선순위 및 계산식·KDS 합격 기준은 그대로다.
- strategy160: 이전 전략으로 만든 계획/작업의 현재성 정책을 유지한다. 기존 계획을 새 점수와 혼용하지 않는다.
- RED focused-2026-09-13T00-32-15-551Z. 점수 회귀 GREEN 00-32-40-779Z 51ms. 실제 WebMCP 후보 GREEN focused-2026-09-13T00-33-13-186Z 10950ms. 중간 테스트 오류는 requestId 누락 및 best 축약 객체에 없는 analysisProofCount 조회였으며 제품 오류로 세지 않는다.
- 통합 증거: output/phase25/column-profile-audit.json에 원래56검사·강도/안정/사용성 원문과 계획/후보 요약을 저장했다. 전체 프로파일/장기처짐 방법 및 Phase25 완료는 여전히 미충족이다.

## 2026-09-13 M3 상대 축변위 결과 준비 및 공개 조회

장기 결과를 비교하기 위한 응답 기록 중 축방향 정보가 빠져 있었다. frameServiceResponse에 axialRelative를 추가했다. 첫 끝단의 병진을 제거한 부재 끝 상대변위(양수 신장/음수 단축), 구간 전체 최소/최대/절대최대와 위치를 m 단위로 저장한다. 선형 축변위 시험함수의 극값은 구간 끝점에서 구하며, 서로 다른 메시를 가진 두 프레임 결과를 뺄 때도 기존 필드 차분 후 같은 owner에서 준비한다.

- 기존 이음 프레임 및 refined Direct 결과에 보존. practical 처짐 검사 상세/WebMCP/보고서에서 동일 axialRelative를 사용한다. 수치법의 KDS 합격이나 장기 하중이력 구현으로 승격하지 않는다.
- 결과 계약 변경: evaluator196, RC policy17. 새 Direct 복원 검사에서 축변위 요약을 실제 구간변위로 재계산하여 변조를 거부한다.
- RED focused-2026-09-13T00-36-39-441Z. GREEN focused-2026-09-13T00-37-39-666Z: 실제 WebMCP 입력·해석·검사 상세·보고서3124ms / 응답75ms. 강체 병진 제거, 구간 내부 절점의 극값, 서로 다른 메시 차분, 자기차분0 확인.
- Direct 복원 필드 검증 focused-2026-09-13T00-38-14-677Z 984ms PASS: 축변위 요약 변조 거부 및 기존 횡방향·연속성 검사 유지.

잔여: fully-cracked-elastic의 force-based 적분 응답은 다른 표현이며 이번 Hermite 시험함수 요약으로 대체하지 않는다. 지속/부착시점/현재 상태의 실제 하중이력 조합과 장기 처짐 판정은 아직 미구현이다. 전체 Phase25 완료 아님.

## 2026-09-13 M8 시간효과 계산 근거 전달 누락 수정

selectReportSource가 stiffnessProvenance만 보존하고 실제 부재별 creepEffects를 버리던 경로를 수정했다. 상세 snapshot/계산서에는 계수·재하/평가 재령·탄성계수·수축 초기변형률·입력 근거·관련 출처를 그대로 보존한다. 계산 재실행이나 계수 추정은 하지 않는다.

- Worker artifact manifest에는 creepEvidence(memberCount,sha256,basis)만 전송해 부재별 전체 입력을 반복 적재하지 않는다. 두 번의 snapshot 선택에도 원문과 해시가 유지된다. 새 set이 있으면 오래된 wrapper의 시간효과를 끌어오지 않는다.
- 도면 포맷 v44-time-effect-evidence. 부재별 한글 항목명, MPa/일/무차원 단위를 추가했다. 원래 입력의 최종설계 미승인·응력이력 미포함 상태도 출력한다.
- RED focused-2026-09-13T00-39-56-854Z. 최종 GREEN focused-2026-09-13T00-41-38-297Z 847ms. 실제 출력 Worker manifest에서 해시 동일/원문 생략, dispose 후 관리 bytes 0 확인.
- output/pdf/phase25/applied-stiffness-proof.pdf 및 time-effect-proof-1.png 한 쪽 렌더링을 확인했다. 이 합성 서식 시험은 실제 장기 해석 방법의 검증을 대신하지 않는다.

남은 수치 작업은 force-based 장기 응답 표현과 부착 전후 하중이력 연결이다. 원래 Phase25 마일스톤 및 전체 완료 조건을 유지한다.

## 2026-09-13 원래 M3 범위 재대조 및 처짐 방법 조회 계약

범위 정정: WORKPACKAGES M3-4/5는 채택 프로파일에서 순간/장기·부착 후 처짐과 실제 SLS 결과 연결을 요구한다. 모든 재령별 응력·하중이력 구성모델을 독립적인 전 Phase 완료 필수조건으로 추가하지 않는다. 최근 기록의 “전체 하중이력 미구현”은 현행 고급 방법의 한계이며, 원래 완료 조건을 임의 확장하는 문구로 읽지 않는다. 압축·Direct 등 채택 프로파일의 미충족 검토를 N_A로 지우거나 범위를 축소하는 결정도 아니다.

- get_design_rule_catalog v5-service-methods에 세 가지 실제 serviceabilityMode의 선택 계약을 추가했다. 축력/이축휨, 부착후 처짐, 필요한 source 종류, 필수/조건부 입력, 지원 기간을 조회할 수 있다.
- instant/long-term curvature는 축력·이축휨 비지원. instant-live-frame은 축력·이축휨을 받는 지원 프레임 응답을 사용하지만 부착후 장기 검토를 대체하지 않으며 methodReviewRequired=true. 자동 fallback은 모두 false.
- 이 metadata는 숫자 모듈을 import하지 않으며 실제 수치 owner의 입력/근거 검사를 생략하지 않는다. KDS 적합성 부여 없음.
- TDD: RED focused-2026-09-13T00-44-26-696Z, GREEN focused-2026-09-13T00-44-51-735Z 852ms. 실제 WebMCP 조회, profile/gap 대장 및 복사 불변성 확인. 종전 registry test에 남아 있던 v3 기대값은 현행 v4에서 이번 v5로의 변경에 맞춰 갱신했다.

전체 Phase25 상태는 IN_PROGRESS. 원래 M0~M10 완료 조건에 대한 증거 대조와 미구현 연결을 계속한다.

## 2026-09-13 M9 실제 브라우저 복원 → 현재 평가 확인

내부 브라우저 localhost:5185 최신 코드에서 M9_BROWSER_V195_OUTPUT_20260913 체크포인트를 복원했다. 저장 sha256 b10d5913410c18cc3d96d421aff6ac6a34c7b466d86ca797ae8dfa1affec29be 일치. 최신 저장평가 v195는 EVALUATOR_VERSION_CHANGED/RESTORED_BUILD_UNBOUND이며 INPUT_CHANGED가 아님을 WebMCP와 실제 UI에서 확인했다. 불러오기 차단과 정확한 한국어 사유 캡처를 남겼다.

- UI에서 제공 상세 검토를 다시 실행. 새 evaluation-8b1e188df79534903f0116b7d911c297555005bc1c7c80e4702e035b868f5ca9, stale=false/reasons=[], 입력해시 cd594dcf315d3e233b21363765d3cfb6595e6e6b58a8da5a3c8368ca2d10a5db 유지.
- 원천 M9_DIRECT:2026-09-13T00:09:28.253Z:2를 사용하며 새 해석은 실행하지 않았다. 208검사: OK49/NG3/NC117/N_A39/FAILED0, complete=false. 기존 조합 누락·프로파일 미검토 유지.
- 발견한 UI 설명 오류: 지정 균일 수축이 반영되는데도 수축 전체가 미완료라고 표시하던 문구를 현재 지원 범위로 수정했다. 긴 저장평가 선택 상자가 모달을 넘지 않도록 maxWidth를 지정했다. reload 후 실제 문구/화면 재확인.
- 최소 UI 회귀: focused-2026-09-13T00-47-30-916Z 156/209ms PASS.
- 실제 증거: output/playwright/phase25-browser/v196-restore-review.json, 14-v196-restore-reasons.png, 15-v196-current-review.png. 화면을 열린 상태로 남겼다.

이 증거는 v195→v196 복원 보호/재평가 경로를 확인하며 M9의 모든 중단·undo·redo나 Phase 전체 완료를 입증하지 않는다.

## 2026-09-13 M7/M9 복원 후 입력 이력·명시 재사용 통합 검증

최신 버전의 unbound 저장평가를 복원한 뒤 명시적 재평가하면 동일 evaluationId의 복원 stale 상태가 해소됨을 확인했다. 이후 실제 WebMCP section 입력→undo→redo→undo를 거쳤다. 물리 section은 돌아오지만 p19InputRevision은 단조 증가하므로 이전 inputHash/평가가 자동으로 되살아나지 않는다. 이는 기존 보호 정책이며 hash에서 revision을 제거하지 않았다.

- 오래된 inputHash 평가 요청은 STALE_INPUT으로 거부.
- 마지막 undo 후 실제 reuse_design_analysis가 수치 의존성 일치를 검사하여 새 source를 생성. 그 source로 새 evaluationId/stale=false 및 동일 검사집계를 확인. 과거 평가는 INPUT_CHANGED 상태 유지.
- restored/runtime dispose 이후 모든 관리 owner와 bytes 0. 기존 N/2N 예약량/캐시·메모리 부족 시 source 미조회 검증 유지.
- 최종 focused-2026-09-13T00-52-22-266Z 4757ms PASS. 테스트: p25-m7-memory-scaling. 초기 실패(00-50-53,00-51-26)는 undo가 과거 inputHash로 돌아올 것이라는 잘못된 테스트 가정으로, 실제 meta.p19InputRevision 증가 확인 후 보호 정책에 맞게 수정했다. 제품 수치 수정으로 기록하지 않는다.

M9의 해당 통합 경로 증거를 보강했으며, 전체 마일스톤/Phase25 완료 선언은 아니다.

## 2026-09-13 M4 접합 강도비 축력 위치 검증

기둥·보 강도 관계가 N/xs 배열의 유한성만 확인하여 [1,3]처럼 부재 시작 구간을 누락한 결과에도 NG/OK 수치 판정을 반환하는 오류를 RED로 재현했다. jointStrengthRelation에서 전체 부재 양단, 위치 범위·단조성·좌우 side 계약과 최대 600개 위치를 검사한다. 부적합은 JOINT_AXIAL_STATION_GRID_INVALID / NOT_CHECKED이며 기존 KDS 출처를 유지한다. 불연속점의 left/right 쌍은 그대로 허용하여 -100/-120 두 축력 모두 강도 경계에 반영한다. KDS 식을 변경한 작업이 아니라 해석 수요 입력 자격을 보강한 작업이다.

- RED: verification/evidence/phase25/focused-2026-09-13T00-57-49-602Z
- GREEN: verification/evidence/phase25/focused-2026-09-13T00-58-20-422Z (joint-candidate 7609ms, joint-shear-geometry 166ms)
- 실제 WebMCP 후보 통합 테스트를 포함한 2개 최소 회귀 통과. 실건물/종합 검증은 수행하지 않았다.
- 평가 버전 v197-joint-axial-station-grid로 변경하여 이전 저장 평가를 자동 최신 처리하지 않는다.
- 원래 WORKPACKAGES의 M4 통합 프로파일 완결 및 M0~M10 전체 완료는 아직 미충족이다.

## 2026-09-13 M4 예상 철근력 연결 검증·보완 후 9검사 대조

jointProbableForces가 같은 좌표의 별도 절점에 연결된 보를 접합 보로 계산하고, 존재하지 않는 지정 부재를 조용히 제외하는 결손을 재현했다. 지정 부재의 존재/접합 절점 연결/중복 및 등단면 범위를 검사하도록 수정했다. evaluator v198-joint-probable-connectivity. KDS 수식 변경은 없다.

- 최초 01-00-25 실패는 기울어진 보를 만든 시험으로 기존 형상 차단도 작동했다. 같은 좌표의 별도 절점으로 교정한 RED: focused-2026-09-13T01-00-46-149Z.
- 실제 WebMCP 후보 적용 다음 apply_design_candidate_and_review를 같은 requestId로 실행하여 새 source/평가를 확보했다. 단순 apply 응답에는 evaluationId가 없으므로 시험에서 followUp.evaluationId를 사용하도록 수정했다(01-01-25 시험 연결 실패).
- GREEN focused-2026-09-13T01-02-07-008Z: 후보9769ms, 접합전단154ms. 보완 전후 모든 필수 접합 9검사를 누락 없이 보존.
- output/phase25/joint-profile-geometric-audit.json 및 joint-profile-catalog-audit.json에 before/after·평가ID·KDS codeBasis 저장.
- 기하/공칭 양쪽 모두 평형·예상철근력·전단·강성 OK 유지. 횡구속 면적NG, 내진 후크 상세입력NC, 종방향 혼잡NG, 보-기둥 강도비NG 유지.
- 공칭 D13 띠철근 확대 후 정착은 OK→NG(HOOK_OUTSIDE_CONFINED_CORE). 코어 축소에 따른 종속 검토이며 오류 은폐 없이 재평가로 발견했다. 명시 후보 적용을 자동 완료로 표시하지 않는다.

다음 M4/M6 실제 결손은 띠철근 확대와 후크/패널 기하의 결합 보완 및 전체 9검사를 충족하는 통합 상세다. 이번 변경만으로 해당 프로파일/Phase 전체를 완료했다고 판정하지 않는다.

## 2026-09-13 M4/M6 접합 코어 후크 자동 보완

신규 jointHookAnchorageProposal은 기존 정착 계산기의 available/farReach와 실제 코어 피복/띠철근 직경으로 공통 후크 연장 변화량을 구한다. typed reinforcement-record의 해당 단부 연장만 다음 버전으로 제안하고 기존 정착 계산기로 가상 모델을 다시 검사한다. 잠긴 배근, 관련 이음, 철근별 공통 이동 불가, 허용 연장 범위 및 이동 후 정착 미충족은 자동 제안하지 않는다. 재료/단면/판정 기준을 완화하지 않는다.

jointRepairProposal에 연결하여 연결부 대상 자동 WebMCP 계획이 보 철근 추가 명령도 포함한다. 기존 지지철근 보완과 같은 기록을 동시에 수정할 때는 충돌 사유를 반환한다. 후보 전략 v161-joint-hook-core. 기존 평가 수치식은 바뀌지 않아 evaluator v198 유지.

- RED focused-2026-09-13T01-05-13-675Z: 자동 계획 relatedReinforcementCount=0, 기대1.
- 실제 WebMCP 자동계획→후보 재해석→적용 후 재해석/평가에서 joint-anchorage NG→OK, 필수 접합9검사 유지.
- 공칭 D10 실제9.53mm→D13 실제12.7mm에 따라 보 startExtension 0.29047m→0.28730000000000006m. 01-07-51 실패는 시험이 D10을10mm로 계산한 기대값 오류이며 실제 공칭값으로 바로잡았다.
- GREEN verification/evidence/phase25/focused-2026-09-13T01-08-26-391Z: 실제 후보12820ms, 기존 자동제안92ms.
- output/phase25/joint-hook-repair-audit.json에 실제 최종 평가ID·변경·9검사·KDS codeBasis 저장.
- 남은 통합 상세 조건: 횡구속 수평간격NG, 내진 후크 상세입력NC, 종방향 혼잡NG, 보-기둥 강도비NG. 전체 완료false 보존. 이번 작업은 후크 연장 결합 보완이며 패널 확대·전체접합 자격을 구현 완료했다고 주장하지 않는다.

## 2026-09-13 M4 명시 접합 프로파일 RED·후크 수치/구간 오차 수정

새 tests/p25-m4-profile-closure.mjs는 실제 WebMCP 입력→CPU 해석→필수접합9검사 전체 OK를 요구한다. 기준을 맞추려고 검사를 제거하지 않았다. 명시 400각 기둥 상하2개·300각 보·D12 후크·400MPa 띠철근 합성 입력을 만들었다. 초기 배근/간격 입력 시행착오는 제품 결함으로 세지 않는다. 최종 전체9검사 시험은 아직 RED이다.

확인/수정한 실제 결손:
- barGeometry는 0.012*3, 0.012*12의 ULP 오차 때문에 정확히 입력한 36mm/144mm 최소 굽힘·후크를 거부했다. 1e-12m 산술 허용오차 적용. 제작 허용오차가 아니며 1e-9m 부족은 여전히 거부한다. profile 시험 앞부분에 경계검증 포함.
- jointCongestion이 후크 전체의 최대 sagitta를 직선 꼬리까지 적용하여 외곽 띠철근과 실제 접촉하는 직선을 불확정으로 만들었다. buildBarFabrication의 segmentErrors를 절단 경로와 함께 보존하고 횡-종 철근 조립 검사가 구간별 오차를 사용하도록 수정. 예전 오류 배열이 없는 데이터는 기존 보수적 sagitta를 사용한다. 부적합 배열은 NOT_CHECKED.
- 평가 v200-joint-segment-errors. 실제 접합의 transverseLongitudinalAssembly는 NOT_CHECKED→OK, 평형/예상철근력/전단/횡구속량/혼잡/강도비/정착/강성 OK.

남은 RED: joint-hoop-detail의 longitudinalSupport가 4개 모서리 지지철근 사이 순간격 약0.254m를 maximumExclusive0.15와 비교하여 NG. 해당 KDS 횡지지 조건 해석과 crossTieSupports 구현을 원문으로 확인해야 한다. 이를 임의 완화하지 않았다. 통합 결과 output/phase25/joint-complete-input-audit.json, RED verification/evidence/phase25/focused-2026-09-13T01-15-35-960Z. 현재 M4/전체Phase 완료 증거가 아니다.

## 2026-09-13 M4 횡지지 원문 대조·추가 철근 상세

KCSC에서 저장한 KDS-142050-official.json 및 142050-text.txt 행196(4.4.2(3)③)을 확인했다. 원문은 횡지지된 인접 축방향 철근의 순간격이150mm 이상일 때 추가 띠철근을 요구한다. 현재 구현을 단순히 모서리 철근이라는 이유로 면제할 근거가 없으므로 crossTieSupports 판정은 변경하지 않았다. 공식 사이트 검색은 현행 원문 세부행을 반환하지 않아 판본 검토는 저장된2022 공식 자료 기준이며 최신판 적합성 전체 확인으로 주장하지 않는다.

합성 통합시험에 중간 주근4개(상하기둥 각8개 주근) 및 직교 연결띠철근2쌍을 명시하고 기존 fitCrossTieCage의 유계 배치 탐색을 사용했다. 외곽띠철근 지지·연결띠철근 접촉·종방향 횡지지는 모두OK로 바뀌었고, 공간 외곽-연결띠철근 간 조립도OK이다. 그러나 실제 보 후크와 횡철근 간 교차가 남아 cross-tie 면적 가산이 차단된다. 따라서 최종 joint-confinement 면적NG와 joint-hoop-detail 간섭NG가 남는다. 평형·예상철근력·전단·종방향 혼잡·강도비·정착·강성은OK 유지.

- 최신 RED: verification/evidence/phase25/focused-2026-09-13T01-21-45-935Z (2679ms)
- 실제 출력: output/phase25/joint-complete-input-audit.json
- 변경 대상: tests/p25-m4-profile-closure.mjs의 명시 합성 상세/유계 배치 준비. 수치 owner·KDS 식·evaluator v200은 그대로다.
- 완료조건9개를 유지한 통합시험은 아직RED. 다음 작업은 보 후크와 연결띠철근을 함께 배치하는 형상 보완이며, 횡지지 조건을 완화하거나 실패검사를 삭제하여 통과시키지 않는다.

## 2026-09-13 M4 외부 접합 필수9검사 통합 GREEN

기존400각 상하 기둥·300각 보·8개 기둥주근 및 직교 연결띠철근이라는 시험 범위를 유지했다. tests/p25-joint-layout-probe.mjs는 실제 입력 모델에서 48개 단일 보 철근 위치의 종방향/횡철근 간섭을 약2.1초에 확인하는 진단 도구이며, 해석 반복 탐색이나 조합 완료 증거가 아니다. 그 결과에서 상부 y=.07,z=-.105/-.045, 하부 y=-.105,z=.105/.045 위치를 구성하고 전체 상세를 실제 WebMCP 입력→CPU해석→재평가했다.

- 최종 필수접합9검사 모두OK: 평형·예상철근력·전단·횡구속·횡철근상세·종방향혼잡·보-기둥강도비·정착·강성. 실제 경로 지지/간섭이 통과하면서 횡철근 면적 가산도 정당하게 반영됨.
- 기존 전체 프로젝트/독립 방법검토 상태는 유지. 전단 등 codeBasis NOT_ESTABLISHED는 그대로이고 전체summary.complete=false이다. 일부 수치OK로 KDS전체적합성을 선언하지 않는다.
- export_design_drawings JSON을 실제청크로 조회하여 9검사와 codeBasis가 저장 snapshot의 JSON 표현과 정확히 같음을 확인. undefined 프로퍼티 생략만 직렬화 계약에 맞췄다.
- 후크형식 jointTieClosure를 누락한 새 typed기록을 WebMCP로 입력한 뒤 실제 새 CPU해석/평가: 9검사 유지, joint-hoop-detail NOT_CHECKED, 전체완료false. 이 변경은 기존source 재사용을 허용하지 않아 보호를 바꾸지 않고 재해석했다.
- GREEN verification/evidence/phase25/focused-2026-09-13T01-26-58-401Z, 11410ms. 앞선01-24-10은 양성9검사2724ms. 01-25-19/01-26-07 실패는 각각 undefined JSON 기대와 재사용 가능 가정이라는 시험 연결 오류이며 제품 오류로 분류하지 않는다.
- 출력: output/phase25/joint-complete-input-audit.json, joint-complete-input-drawing.json, joint-missing-closure-audit.json, joint-layout-probe.json.

이 통합 GREEN은 M4 외부접합 프로파일의 명시 양성/입력누락 경로와 M8 JSON 추적 증거다. 내/모서리 접합 등 원래 범위 대조 및 M0~M10 전체 완료감사는 계속 필요하다. evaluator v200/strategy v161 변경 없음.

## 2026-09-13 M4 접합 연결형상 결과·관통 철근 결손 확정

jointTopology owner를 추가하여 실제 절점 연결로 column-only/one-sided/two-opposite/two-adjacent/three-sided/four-sided를 분류한다. 보별 X/Y 부호·부재ID·i/j 단부와 상/하 기둥을 보존하며 중복면·누락부재·비직교/영길이 형상은 분류미검토다. rcJoint의9검사에 동일한 jointTopology를 붙여 WebMCP/JSON으로 노출한다. classificationOnly=true이며 구조시스템/건물 위치/정착 적합성 인증을 대신하지 않는다. evaluator v201-joint-topology.

- p25-m4-joint-topology:6가지 배치·입력순서 불변·누락 차단 단위PASS, focused runner등록.
- p25-m4-profile-closure: 실제9검사 모두one-sided metadata, 실제JSON동일성·누락후크NC 유지. GREEN focused-2026-09-13T01-31-40-870Z 11407ms.
- 현재 정착 owner/input은 special-frame-beam-90-hooks만 지원한다. 내접합 관통 직선 철근의 연속성 경로는 미구현으로 확인했다.
- KCSC 직접CodeViewer 브라우즈는 안전URL 오류로 열리지 않았다. 이미 저장된 공식2021 API자료 sort242~246의 data-script를 확인하여 JOINT_THROUGH_BAR_RULE_MAP.json에 판본·SHA256·수식·다음 구현요건을 기록했다. 보통중량콘크리트 기둥깊이/철근직경 최소비는 fy<=400에서20, fy>400에서25이며, 이를 전체연속성검증으로 대체하지 않는다.

다음 M4 개발은 typed 관통철근 연속성·상대편 철근 실제경로·깊이 조건과 기존 혼잡/구속의 통합이다. 전체Phase 미완료.

## 2026-09-13 M4 관통 직선 철근 입력·연속성·기둥깊이 구현

jointThroughBars owner를 구현했다. 공통typed입력의 jointAnchorageMode에 special-frame-beam-through-bars, jointBeamContinuity에 aligned-through-bars를 추가하여 실제 WebMCP로 입력한다. 접합단의 명시0 끝거리를 허용하되 관통모드에서만 해당 단부를 내부점으로 제작경로를 계산한다. 외부끝의 피복/끝거리검사는 그대로다.

- 반대면 보2개 또는4개·중심/등단면·직교기둥·보통중량콘크리트·특수골조 범위를 검사.
- 접합면에서 끝거리가0, 추가연장이0인 직선철근만 허용. 양쪽 실제전역위치/직경/면적/재료참조/제품표/호칭을1:1매칭. 후크종료·틈·관련이음·불일치는NC. 이음은 현재 보수적으로 해당기록 연계이음 전체를 검토대상으로 남긴다.
- KDS142080:2021 4.6.1(4) 기둥평행깊이/직경20(fy<=400)·25(fy>400)를 계산한다. 깊이NG와 연속성확인은분리. 지원fy상한600MPa, 경량콘크리트 미포함.
- 혼잡owner는 검증된 양쪽직선경로를 실제한barPath로병합하고 continuationIds·구간오차를보존한다. 선언만으로 틈/이음을덮지않는다.
- evaluator v202-joint-through-bars, 규칙대장범위갱신. 독립방법검토/전체설계완료false 유지.

실제WebMCP/CPU합성내접합: 필수9검사OK. 전역좌표매칭 방향반전, 위치/면적불일치, 틈/후크거부, h=.4m/db=.02m에서fy400 경계비1 및fy500 부족비1.25, 실제관통4경로병합확인. 외부후크배치를그대로사용했을때의간섭은실제NG였으며48개단일위치형상진단후별도내접합배치를검증했다. 진단은종합검증/자동전체설계증거가아니다.

남은작업: 관통철근의도면/제작수량에서두부재분할을하나의물리철근으로추적하는출력경로감사, 연관이음허용범위확장,4면/모서리및혼합정착범위확인. 이번9검사OK를이들출력/전체Phase완료로승격하지않는다.

## 2026-09-13 M4/M8 관통 철근 물리 수량·분할 구간 추적

prepareThroughBarLinks가 검증된 관통 연결만 모아 부재/배근버전/철근번호를 연속 그룹으로 묶는다. 실제 내부 연결단에만 interiorStart/interiorEnd를 적용하여 끝거리0 구간을 준비한다. 외부끝의 피복/후크검사는 그대로 유지한다. 준비된 각 구간에 physicalBarId를 붙이고 throughBarSchedule은 모든 sourceFragments와 연결부ID, 실제 절단길이·체적을 보존한다. 연속된 여러 연결은 그룹으로 합칠 수 있도록 구성했으나 이번시험은 단일내접합이다.

도면은 원래 부재별 구간을 표시하고 통합수량표 참조 문구를 추가한다. 수량표에서는 해당 구간행을 하나의물리철근행으로 합쳐 count/pieceCount=1과 전체길이를 기록한다. 단위질량이 없거나 조각별로 다르면 질량미확정이며 밀도로추정하지않는다. 모든 행은 fabricationApproved=false 유지.

- 준비형상v42, 도면v45, 평가v203-through-bar-quantity.
- 실제내접합4개관통철근:각5.92m·1개, 원래8개부재구간참조를4개행에보존. JSON/CSV수량에서동일확인.
- 출력 output/phase25/joint-through-schedule.json 및 joint-through-quantities.csv. CSV재파싱으로4행/수량1/길이5.92/각sourceFragments2개확인.
- GREEN verification/evidence/phase25/focused-2026-09-13T01-46-06-431Z: 관통2730ms, 기존CSV57ms, 외부접합11227ms.
- 앞선01-42-21/01-43-50시험은 기본60쪽한도에서중단되어수량assertion에도달하지못했다. 지원되는maxPages600/pageLimit8로작은보관창을사용했다. 운영한도를무작정확대한수정은없다.

남은 M8 작업은 실제 PDF 표의 연속철근 수량/표시 및 렌더 검토, 다중접합 연속열·반대방향·일부실패의출력계약검토다. 이번 JSON/CSV 통과를 모든제작도·PDF완료로 간주하지않는다. 전체Phase미완료.

## 2026-09-13 M8 관통 철근 PDF 통합수량·대표3쪽 시각검토

continuousBarPages를 추가하여 물리철근별 수량/전체길이/직경/질량상태와 원본부재·배근버전·철근번호·분할길이를 별도 페이지로 출력한다. 부재별 검토도는1개라는 표현 대신분할구간으로 표시한다. 기록계산서에도 통합전quantities가 전달되던 누락을 수정하여 JSON/CSV와 같은finalQuantities를 소비한다. 도면v46-through-bar-pdf, 평가v203/준비v42 유지.

- RED focused-2026-09-13T01-49-22-267Z: 통합수량표 페이지 없음.
- 최종 GREEN focused-2026-09-13T01-52-10-065Z: 관통2682ms/CSV55ms.
- 실제 합성 입력/CPU/검토 snapshot에서 부재BC, 접합J, 관통수량표의3쪽을 동일PDF writer로 출력: output/pdf/phase25/through-bar-review.pdf.
- 각쪽 PNG를렌더하여검토. 통합표4개×5920.000mm/수량1, 원본2구간각2960.000mm, 미확정공칭질량 및 분할구간표현 확인. 겹침/잘림없음.
- 대표쪽은 전체119쪽 중3/5/6쪽이며 원래쪽번호를유지한발췌다. 전체119쪽을시각검토했다고주장하지않는다. 실건물테스트아님.
- PNG output/pdf/phase25/through-bar-review-1.png ~ -3.png. 최종텍스트추출로분할구간표현과5920.000 네번도확인했다.

다중접합연속열/다양한출력창의경계검증 및 나머지 M0~M10 마감감사는잔여다. 전체Phase미완료.

## 2026-09-13 M4/M8 다중접합 연속철근·연결실패 검증

단일내접합의 실제WebMCP/CPU fixture에서 모델을 복제하여 두접합/세보구간의 준비형상을 검사했다. 12개구간이4개물리철근으로합쳐지고 각8.92m로 집계됨을 확인했다. 이 추가사례는 준비형상/수량계약검사이며 두접합 전체CPU/KDS검증으로 주장하지않는다.

접합기록의열거순서를반대로바꾸면 connectionIds순서만달라지는 비결정적출력을 RED로 확인했다(focused-2026-09-13T01-54-49-628Z). 연결ID와 물리철근레코드순서를정렬하여 동일수량표가되도록수정. throughBarSchedule v2-canonical, 준비v43, 평가v204.

추가로 세번째구간의철근위치를1cm어긋나게해 연결검증을실패시켰다. 확인되지않은내부끝거리가완성길이로계산되지않으며 physicalBarCount=null, 레코드NOT_CHECKED/cutLength=null을확인했다. 연결실패를기하길이만으로통과시키지않는다.

- GREEN verification/evidence/phase25/focused-2026-09-13T01-55-31-080Z: 관통/연속열3549ms, CSV55ms.
- output/phase25/joint-through-chain-audit.json: joined/incomplete 실제준비결과.
- 기존단일내접합9검사·제품/위치불일치·기둥깊이경계·물리수량/CSV검증유지.
- 아직원래M0~M10전체완료감사, 혼합정착/접합범위등잔여. 전체Phase미완료.

## 2026-09-13 M4 혼합 정착 방향·실패 분리

평가 v205에서 `special-frame-beam-mixed`와 `jointThroughAxis`(X/Y)를 공통 typed 입력에 추가했다. 실제 WebMCP preview/apply → CPU 해석 → 평가 경로로 입력을 전달한다. 선택 방향의 반대편 두 보만 관통 철근으로 연결하며, 수직 방향의 보 단부는 기존 90도 후크 검토를 수행한다. 검증된 관통 부재만 내부 단부 피복 예외 및 물리 철근 수량 병합 대상이다.

합성 3면 접합에서 정착 검사는 OK지만 구속철근량 부족, 횡철근-주철근 충돌, 주철근 사이 간격은 NG다. 이 fixture는 완성 배근 예제가 아니라 서로 다른 검사의 실패를 보존하는 통합 회귀 사례다. 처음의 전체 OK 기대는 잘못된 fixture 가정이었으며, 계산 임계값을 완화하지 않고 실제 NG 사유를 명시한 회귀시험으로 수정했다. 기존 2면 관통 접합의 9검사 OK는 그대로 유지한다.

방향 누락/잘못된 방향, 후크 입력 누락, 관통 철근 단부 공백, 관통 깊이 NG와 후크 미검토의 동시 발생을 검사했다. NG와 incomplete를 동시에 보존하며 미검토를 0 여유율로 표시하지 않는다. 8개 관통 구간은 4개 물리 철근으로 준비되고 수직 후크 4개는 그 병합에서 제외된다. 결과의 KDS 출처 및 독립 방법 검토 미완료 상태를 유지한다.

선택 검증: `verification/evidence/phase25/focused-2026-09-13T02-04-09-899Z` — mixed 2991ms, through/chain 3541ms PASS. 실제 건물·종합검증·최신 버전 브라우저 검증은 실행하지 않았다. `output/phase25/joint-mixed-input-audit.json`에 실제 9검사와 요약을 보존한다. 전체 M0~M10은 미완료이며, 혼합 접합의 충돌 없는 완성 배근 증거와 원래 범위의 전체 대응 감사가 남아 있다. 커밋/배포는 이번 변경에 포함하지 않았다.

## 2026-09-13 M6 혼합 정착의 부분 보완 책임 분리

혼합 접합에서 관통 깊이와 후크 코어가 동시에 NG이면, 기존 후크 후보 생성기가 관통 검사행에 farReach를 요구하여 JOINT_HOOK_COMMON_EXTENSION_UNAVAILABLE로 종료했다. RED: focused-2026-09-13T02-06-03-690Z. 후크 후보는 실제 hooks 하위 결과만 사용하도록 수정했다. 후크 수정 후에는 후크 OK 여부와 전체 정착 상태를 따로 반환하고, 관통 깊이 NG는 remainingAnchorageChecks에 유지한다. 자동 적용 허용은 false, 새 해석과 후보 전수 평가 요구는 유지한다.

시험은 RP 후크만 새 버전으로 수정되고 RB/RL 관통 기록은 그대로임을 확인한다. 관통 깊이 NG 4개가 남아도 수정 가능한 후크 후보는 생성되며, 전체 정착을 OK로 승격하지 않는다. 후보 전략 v162-mixed-hook-repair로 기존 후보의 재사용을 차단한다.

GREEN: verification/evidence/phase25/focused-2026-09-13T02-06-33-914Z — 혼합 접합 3026ms, 기존 실제 WebMCP 후보 적용/재해석 12962ms PASS. 혼합 사례의 추가 검사는 후보 helper와 typed 명령 적용 범위다. 기존 외부 접합 WebMCP 전체 경로와 혼합 접합 전체 후보 업무의 증거를 혼동하지 않는다. 원래 M0~M10 완료 감사와 혼합 접합 완성 배근 증거는 아직 남아 있다.

## 2026-09-13 M6/M9 혼합 후크 실제 WebMCP 보완·멱등 재검토

`tests/p25-m6-mixed-hook-webmcp.mjs`를 추가했다. 3면 합성 접합에서 입력 preview/apply → CPU 해석 → 평가 → 자동 후보 계획/실행 → 명시 적용 및 새 해석/재검토까지 실제 WebMCP 도구를 호출한다. 초기 25mm 철근 fixture는 외측 위치의 피복 범위를 벗어나 BAR_OUTSIDE_SECTION로 거부되었다. 입력 검증을 우회하지 않고 관통 두 보의 같은 z 좌표를 0.8배로 조정하여 유효한 입력으로 실행했다.

후크 RP의 연장량 0.20m→0.19m, 버전 2를 확인했다. RB/RL 관통 기록은 바뀌지 않으며 관통 깊이 NG는 최종 정착 검사에 유지된다. 9개 필수 접합 검사와 각 codeBasis, 전체 complete=false를 확인했다. 동일 requestId로 apply_design_candidate_and_review를 다시 호출하면 같은 후속 evaluationId를 반환하고 배근/접합 기록에 중복 버전을 만들지 않는다.

선택 증거: verification/evidence/phase25/focused-2026-09-13T02-09-02-447Z, 7504ms PASS. 출력: output/phase25/joint-mixed-repair-webmcp-audit.json. 이로써 혼합 후크 부분 보완의 실제 WebMCP 업무 경로 증거를 추가했다. 브라우저 화면 검증이나 충돌 없는 전체 접합 배근 적합성을 입증하는 사례는 아니며 원래 M0~M10 전체 완료 감사는 남아 있다.

## 2026-09-13 M8/M10 Pages 하위 의존 파일 누락 차단

Pages 패키지 검사는 대표 파일과 폰트만 요구하여 하위 모듈 누락을 놓쳤다. 실제 jointThroughBars.js를 archive 파일 집합에서 제거한 시험이 실패하여 RED를 확인했다(focused-2026-09-13T02-10-30-576Z). tools/pages_asset_validation.py에 상대경로 literal import/export, 동적 import, new URL(..., import.meta.url) 참조 대상 검사를 추가했다. 로컬 디스크에 파일이 있어도 archive 집합에서 빠지면 PAGES_LITERAL_DEPENDENCY_MISSING으로 차단한다. 기존 build-pages.py의 커밋 바이트 기반 패키징/dirty 차단은 유지한다.

선택 시험은 현재 src 파일 집합의 연결성, 실제 하위 모듈 삭제, 네 가지 문법의 누락, 기존 필수 파일/폰트 해시·크기·라이선스 검사를 포함한다. GREEN: verification/evidence/phase25/focused-2026-09-13T02-10-53-975Z, 1290ms. 검사기는 literal 참조의 보수적 텍스트 검사이며 JS 전체 파서나 계산된 URL·HTML 의존성 검사가 아니다. 실제 commit artifact 생성과 Pages 배포는 수행하지 않았다. M10 종료를 뜻하지 않는다.

## 2026-09-13 M8/M10 HTML 진입점 배포 의존 검사

Pages 검사에 HTMLParser 기반 자원 참조 검사를 추가했다. script/src, stylesheet/icon/preload/modulepreload link, img/iframe/source/audio/video src 및 video poster의 로컬 대상을 archive 파일 집합에서 확인한다. 인라인 script의 literal import도 문서 디렉터리를 기준으로 검사한다. URL query/fragment는 파일 경로에서 제외하고 외부/data URL 및 일반 탐색 링크는 자원 포함 검사와 구분한다.

RED focused-2026-09-13T02-12-13-500Z에서 누락 HTML 자원이 기존 검사에 통과함을 확인했다. GREEN verification/evidence/phase25/focused-2026-09-13T02-12-43-024Z, 1950ms: 현재 6개 진입 HTML과 전체 src 참조, 누락 스크립트/스타일/이미지/인라인 모듈, 정상 쿼리 경로, 외부/data URL 구분, 기존 폰트 무결성 시험 통과. CSS 내부 URL, srcset, 계산된 URL, 실제 브라우저 요청 전수 검증은 이 검사의 증명 범위가 아니다. 실제 커밋 패키지 생성/배포는 수행하지 않았으며 M0~M10 전체 완료도 미확정이다.

## 2026-09-13 M10 README·실행 안내 현행화

README의 Phase21 중심 현재 상태 및 docs/README.md의 Phase25 제품 구현 미착수 표기를 현재 개발 진행/전체 완료 전 상태로 수정했다. 고정 36개 도구 수 대신 현재 등록 schema를 참조한다. 이전 21개 비교표와 릴리스 기록은 보존하고 최신 RC 규칙 자격과 분리했다. 소스 기능과 실제 Pages 배포 커밋을 구분했으며 이번 원격 배포 확인/배포는 수행하지 않았다.

새 docs/phase25/USAGE.md는 실제 practicalTools 계약과 합성 재현 시험을 바탕으로 공통 입력, source 결속, 전수 결과 조회, 후보 적용/재해석, PDF 묶음, NG/미검토/제작 승인 상태를 설명한다. 선택 시험 명령과 재실행 시 사례 출력 갱신도 명시했다. README·문서 인덱스·새 안내의 로컬 Markdown 링크는 모두 존재함을 확인했다. 문서 변경으로 수치 시험은 반복하지 않았다. M10 전체 종료나 Phase25 구현 완료를 선언하지 않는다.

## 2026-09-13 원문 요구 대조표·적용 후 실패 재시도

REQUIREMENT_AUDIT.json에 WORKPACKAGES 원문 SHA-256과 줄 번호를 결속하여 11개 마일스톤의 세부 요구 52개, 진입/시험/완료 조건을 합한 85항목을 등록했다. UNREVIEWED는 미구현이라는 뜻이 아니라 해당 원문 범위 전체의 증거 대조가 아직 끝나지 않았다는 뜻이다. 확인된 부분은 PARTIAL과 정확한 잔여 범위로 기록하며 기존 원래 요구를 축소하지 않는다.

M6-5 대조에서 tests/p25-m6-apply-review.mjs의 P25_RETRY 분기가 기존 선택 실행 목록으로는 실행되지 않음을 확인했다. p25-m6-apply-retry.mjs를 명시 등록하고 실제 소형 CPU/WebMCP 적용 직후 해석 실패 → 동일 요청 재시도 → 새 평가 완료 및 중복 배근 버전 방지를 확인했다. 별도 수치 규칙은 변경하지 않았다.

증거: verification/evidence/phase25/focused-2026-09-13T02-18-36-007Z, 5086ms PASS. 명시 rollback과 이후 사용자 변경 보호까지 입증한 것으로 확대하지 않는다. M6-5 및 M0~M10 전체는 아직 완료 전이다.

## 2026-09-13 M6/M9 대상 지정 undo/redo·실제 실패 복구

공통 입력 undo/redo에 선택적 expectedRequestId를 추가했다. 최신 이력의 요청 ID와 다르면 UNDO_TARGET_MISMATCH/REDO_TARGET_MISMATCH로 거부하며 모델을 수정하지 않는다. WebMCP와 Agent가 같은 서비스 인수를 전달한다. 일반 apply_design_changes 응답에 inputRequestId를 노출하여 미리보기 요청과 적용 요청을 혼동하지 않게 했다. 인수 없는 기존 UI undo/redo는 호환 유지한다.

RED: focused-2026-09-13T02-20-40-684Z. 최초 구현 뒤 시험에서 일반 입력 이력의 ID가 apply 도구 요청이 아닌 preview 요청임을 확인해 fixture를 바로잡았다. 현재 GREEN focused-2026-09-13T02-21-28-989Z: 대상 보호 1635ms, 기존 history 1218ms. 이후 사용자 입력이 최신 이력일 때 과거 후보를 지정한 undo는 거부하고 모델이 동일함을 확인했다.

추가 실제 WebMCP/CPU 시험 p25-m6-apply-rollback은 후보 단면/배근 적용 후 해석 실패를 주입하고 대상 undo로 원래 단면·배근을 복원한다. 같은 후보 요청 재시도가 복원된 입력을 다시 덮지 않음을 확인했다. focused-2026-09-13T02-21-53-523Z, 4327ms PASS. M6-5 대조표와 사용 안내 갱신. 전체 실패/복원 세션 행렬 및 원래 M0~M10 완료 감사는 잔여다.

## 2026-09-13 M9 복원 입력 이력의 영수증·대상 무결성

공통 입력 이력 v1 복원에서 checksum이 일치하는데 receipt.requestId가 요청 맵 키와 다르거나 receipt가 없거나 동일 requestId가 history/future에 중복된 경우도 허용함을 RED로 확인했다. 체크섬을 구조 유효성의 대체물로 사용하지 않도록 요청 ID·영수증 결속과 이력 ID 유일성을 복원 전 검사한다. 실패 시 undo/redo 이력에 부분 등록하지 않는다.

p25-m9-input-history-restore는 정상 저장 상태에 undo 및 redo 이력을 모두 포함해 복원한 뒤 대상 불일치 차단, 올바른 redo, 연속 undo를 확인한다. 잘못된 영수증/중복 이력은 checksum을 재계산해도 INPUT_HISTORY_INVALID로 거부한다. 기존 WebMCP 대상 지정 시험도 유지한다.

RED focused-2026-09-13T02-23-56-258Z. GREEN verification/evidence/phase25/focused-2026-09-13T02-24-15-253Z: 복원 954ms, WebMCP 대상 보호 1582ms. 이는 공통 입력 서비스의 저장 상태 검증이며 실제 브라우저 전체 Book 복원/재접속 행렬 증거와 구분한다. M9-3 원문 대조표 갱신, 전체 M0~M10 완료 전.

## 2026-09-13 M3 압축부재 재점검·장기 미검토 근거 보존

기존 column-profile-audit가 평가 v195 기록임을 확인하고 현재 소스로 4조합/56검사와 단면 후보 1건을 재실행했다. 최소 인장변형률 NG와 축력을 포함하는 장기 곡률법 NC가 그대로 확인됐다. 후자는 지역 source 적용 조건에서 N/My를 허용하지 않는 구현 경계이며, 순간 frame 변위 검토가 장기/부착 후 검토를 대신하지 않는다.

이 경계에서 regionalServiceability의 NC가 장기 방식/근거를 잃고 반환되는 문제를 수정했다. 요청 방식 long-term-curvature, 실제 실패 단계 regional-source-applicability 및 KDS 14 20 30 장기 식을 포함한 참조를 보존한다. 단일 구간의 순간 검토 선행 실패도 instant-live-curvature 단계로 구분한다. 수치 임계값이나 미검토/NG 상태를 완화하지 않았다. 평가 v206-long-term-prerequisite-basis.

RED focused-2026-09-13T02-26-57-268Z 및 02-27-12-959Z에서 누락 필드와 실제 regional 선행 경로를 확인했다. GREEN verification/evidence/phase25/focused-2026-09-13T02-27-44-146Z, 10878ms. 출력 output/phase25/column-profile-audit.json은 현 평가 버전으로 갱신됐다. M3-5의 축력 포함 장기 경로 구현/검토는 명시 잔여로 남기며 전체 Phase 완료를 주장하지 않는다.

## 2026-09-13 M3 축력 장기 경로의 단계 응답 합성 기반

기존 rcCoupledIteration에는 축력/양축휨과 sustained-effective-modulus 응답 계산이 존재한다. 현재 미완료는 그 계산 전부의 부재가 아니라 재하/부착 단계별 source를 연결하는 장기 평가 경로다. 공개 검색은 공식 KCSC 원문을 새로 확보하지 못했으므로 검색 결과의 민간 재게시 문서를 새 규칙 근거로 채택하지 않았다. 기존 수집 KDS 원문과 별개로 이번 변경은 수치 변위장 합성만 구현한다.

frameServiceResponse에 combineRcMemberServiceResponses를 추가했다. 최대 3단계·단계당 20구간을 공통 분할망으로 보간하고 축변형/양방향 변위/회전을 부호 있는 계수로 합성한 뒤 상대변위 극값을 계산한다. memberId/length와 실제 segment의 불일치, 잘못된 계수, 단계 한도를 거부한다. 최대변위 스칼라의 합은 사용하지 않는다.

RED focused-2026-09-13T02-30-27-397Z. GREEN verification/evidence/phase25/focused-2026-09-13T02-30-54-516Z, 55ms: 독립 선형 축변형·이차 횡변위 식으로 서로 다른 분할망의 합성 값과 내부 최대 위치를 확인했다. 이 helper는 아직 생산 WebMCP 장기 평가에 연결하지 않았다. 다음 필수 작업은 같은 모델의 단계 source 결속·재하/부착 정책·유효탄성계수 적용 범위 검증 후 기존 공통 평가/출력에 연결하는 것이다. timeHistoryQualified=false 및 designTransferAllowed=false를 유지한다. M3-5와 전체 Phase는 미완료.

## 2026-09-13 M3/M9 단계 응답 source 결속·WebMCP 연결

rcServiceWorkflow.composeStages 및 공통 bridge/WebMCP compose_rc_service_stages를 추가했다. 현재 inputHash, 기록의 규칙 버전/복원 자격, 수렴, 서비스 조합, 준비된 부재 변위장과 같은 해석 method를 확인하고 최대 3단계 한 부재를 합성한다. source별 iteration/combination/resultHash, 계수, stiffnessMode/timeEffect와 KDS source references를 반환한다. 합성 자체의 법규 적합성은 SOURCE_REFERENCES_ONLY/timeHistoryQualified=false로 유지한다.

임시 합성 자원은 budget에 예약하고 finally 해제한다. 실제 Worker 지정강성 Direct 서비스 TOTAL-BASE의 WebMCP 합성 결과가 기존 처짐 평가 값과 1e-12m 이내로 일치하며 반복 합성 hash 동일·메모리 반환·stale 입력 거부를 확인했다. 선택 증거 verification/evidence/phase25/focused-2026-09-13T02-35-50-855Z, 5576ms.

중요 잔여: fully-cracked-elastic 크리프 해석의 analysis.byCombo는 현재 memberServiceResponses를 저장하지 않는다. 해당 source는 RC_SERVICE_STAGE_FIELD_REQUIRED로 거부한다. 이를 endpoint Hermite 보간으로 임의 대체하지 않는다. 분할 강성/축-휨 연성 및 분포하중을 반영한 부재 내부 변위장 복원과 재하/부착 정책 검증을 연결해야 원래 장기 평가 요구를 닫을 수 있다. 이번 도구는 source 결속 수치 합성이며 장기 설계 판정 완성이 아니다.

## 2026-09-13 M3/M7 크리프 내부 변위 복원·보존 메모리

rcIntegratedDisplacements는 수렴한 부재력, 실제 분할 taper의 축-휨 flexibility/초기변형률, 재료 및 양단 변위로 기존 taperedForceDisplacement 적분을 수행한다. 부재력 station/구간 경계/중간점의 최대 620개 위치에 6성분 변위·회전을 저장하고, 후속 임의 위치 평가를 위한 integration field도 보존한다. 단순 양단 Hermite 보간으로 대체하지 않았다. 샘플에 대한 결과이며 globalExtremaEvaluated=false다.

rcCoupledIteration이 수렴 결과에 memberIntegratedDisplacements를 준비하고 candidateAnalysisSnapshot이 같은 자료를 보존한다. 기존 get_rc_service_iteration_detail로 저장 결과 전체를 조회할 수 있다. 서비스 v18, coupled v7, 메모리 산정 v5. 새 샘플·descriptor의 준비/전송 복사분은 Worker 실행 전 working-set 예약에 포함한다.

RED focused-2026-09-13T02-38-31-073Z. GREEN verification/evidence/phase25/focused-2026-09-13T02-39-58-338Z: 크리프 실제 WebMCP/기존 균열 검토 8980ms, 작업 메모리 185ms. 독립 EA 식의 중간/끝 축변형과 양단 폐합, snapshot 보존을 확인했다. 일반 분포하중/축-휨 내부 극값 및 단계 합성기는 이 새 integration field를 아직 소비하지 않는다. 다음은 해당 field의 위치 평가·단계 합성·재하/부착 정책을 연결하는 작업이다. 전체 M3-5/Phase 미완료.

## 2026-09-13 M3/M9 크리프 적분 변위의 단계 합성 연결

compose_rc_service_stages가 memberIntegratedDisplacements의 integration field를 소비한다. positions로 1~64개의 오름차순 위치(m)를 지정하면 기존 구간 부재력 적분으로 6성분 응답을 평가한 후 단계 계수를 적용한다. trial-field와 적분-field 혼합은 거부하며, 적분 source의 누락/범위 밖 위치를 차단한다. 반환은 지정 위치의 값으로 globalExtremaEvaluated=false이고 장기 적합성/시간이력 승인으로 승격하지 않는다. 합성 버전 v2-integrated.

실제 WebMCP에서 같은 inputHash의 순간/유효탄성계수 크리프 두 결과를 만들고 차분을 합성했다. 중간/끝 축변형 증가가 독립 복합 EA 식의 차와 1e-11m 이내로 일치한다. 처음에는 기존 후속 굽힘 시험이 저장 2건 한도에 걸렸고, 사용을 마친 순간 기록을 release_rc_service_iteration으로 해제하도록 수정했다. 저장 한도를 상향하지 않았다.

RED focused-2026-09-13T02-41-46-044Z. 현재 GREEN verification/evidence/phase25/focused-2026-09-13T02-43-15-998Z: 크리프/차분/기존 균열 업무 10718ms. 기존 지정강성 trial-field 합성도 02-42-31-091Z에서 5711ms PASS(같은 실행의 크리프 fixture는 당시 자원 해제 누락으로 실패). 일반 연성/분포하중 위치 값과 내부 극값 검증, 재하·부착 정책 및 장기 판정·출력은 여전히 잔여다.

## 2026-09-13 M3 연성·분포하중 내부 위치 독립 검증

p25-m3-integrated-coupled-load는 두 구간의 서로 다른 양정치 축-양축휨 flexibility, 구간별 초기변형률, 3방향 등분포하중, 비틀림 및 전단변형 on/off를 직접 구성한다. N(x), My(x), Mz(x)의 독립 다항식 원시함수로 내부 위치/구간 경계/끝점의 6성분을 비교한다. 같은 field의 +1/-1 합성은 전 위치에서 0임을 확인한다.

최초 실패 focused-2026-09-13T02-46-06-804Z는 oracle의 전단 부호 오류였다. native memberForceAt의 Vy/Vz가 사용 모멘트 기울기의 음수인 계약을 확인해 독립식의 전단 기여를 수정했다. 수치 엔진 결함으로 기록하지 않는다. 이후 준비 샘플과 WebMCP 위치 조회에서 중복되던 적분 호출/강체변위 합산 코드를 evaluateRcIntegratedDisplacement 단일 함수로 정리했다.

GREEN verification/evidence/phase25/focused-2026-09-13T02-48-03-324Z: 독립 내부 적분 86ms, 실제 순간/크리프 WebMCP 차분 및 기존 균열 업무 10542ms. 등분포하중과 두 구간의 내부 위치 값 검증이며 일반 하중의 모든 내부 극값 검증은 아니다. M3-5의 극값·재하/부착 정책·최종 장기 판정/출력은 잔여다.

## 2026-09-13 M3/M9 적분 변위장 내부 극값·WebMCP

rcIntegratedExtrema는 일정 compliance 구간과 지원 하중 경계를 합친 최대 128구간에서 변위의 5차 이하 다항 표현을 구성하고 도함수 근으로 내부 극값 후보를 찾는다. 후보 값은 원래 부재력 적분으로 다시 평가한다. 보간 잔차를 추가 위치에서 확인하며 범위 밖 하중(예: foundation-distributed)과 비분할 taper는 명시 거부한다. 지점 chord/양단 cantilever 기준 횡변위와 첫 단부 기준 축변형을 계산한다. 최대 샘플값을 연속장 극값으로 승격하지 않는다.

compose_rc_service_stages의 extrema/boundary 입력으로 연결했다. 응답은 지원 범위 내 globalExtremaEvaluated=true이지만 timeHistoryQualified/designTransferAllowed는 false다. 위치 샘플도 요청하면 별도로 반환한다. 합성 계약 버전 v3-integrated-extrema.

RED focused-2026-09-13T02-51-09-472Z. GREEN verification/evidence/phase25/focused-2026-09-13T02-53-12-674Z: 독립 등분포 단순보 중앙 최대식, 삼각형 분포 단순보 비중앙 최대 위치/값, 부호 합성 상쇄 및 미지원 하중 차단 85ms. 실제 순간/크리프 WebMCP 차분의 축변형 극값 및 기존 업무 10630ms. 초기 시험 생성 명령의 문자열 인용 오류는 구현 RED와 별도이며 즉시 수정했다.

재하·부착 시점 정책, 유효탄성계수 시간 적용 전제, 최종 장기 판정/보고서 연결은 아직 잔여다. 이 수치 극값 검증을 KDS 장기 설계 자격으로 주장하지 않는다.


## 2026-09-13 단계 합성의 시점 근거 보존
- WebMCP compose_rc_service_stages v4는 지속하중 원본의 재하/평가 재령, 유효탄성계수, 크리프 계수, 수축 및 근거를 sources.timeState로 반환한다.
- 원본 시점 누락, 재령 역전, 유효탄성계수 불일치, 수축 근거 누락과 순간해석/크리프 상태 충돌을 거부한다. 순간해석의 재령 및 부착 재령을 추정하지 않는다.
- TDD: 신규 모듈 미존재 RED 확인 후 단위시험 및 실제 Worker/WebMCP 크리프, KDS 2차 강성 인접시험 3건 PASS(53/10630/5568 ms).
- 증거: verification/evidence/phase25/focused-2026-09-13T03-01-03-508Z/SUMMARY.json
- 단계 합성은 수치 연산이다. 부착시점 정책, 장기변형 최종 판정/보고서 연결과 원래 M0–M10 전체 요구사항 대조는 남아 있다. 전체 Phase25 완료 아님. 종합시험/실제 건물시험/배포 미실행.


## 2026-09-13 M9 체크포인트 실패 시 현재 이력 보존
- 실제 WebMCP 입력 편집 후 손상된 체크포인트 복원을 호출하면 catch의 dispose가 현재 undo 이력을 삭제하는 오류를 RED로 재현했다(UNDO_EMPTY).
- 복원 시작 전 기존 분석/설계 외 입력 preview/receipt/undo/redo, practical 평가/계획/job/application, RC 반복/이음 결과 및 활성 계산을 모두 검사한다. 해당 상태가 있으면 CHECKPOINT_RESTORE_REQUIRES_EMPTY_RUNTIME으로 거부하며 현재 모델과 이력을 보존한다. 큰 결과 clone 대신 각 소유자의 상수 시간 상태 조회를 쓴다.
- 빈 세션에서는 저장 읽기 실패와 뒤쪽 practical store 복원 실패 후 정상 체크포인트 재시도가 가능함을 확인했다.
- RED: verification/evidence/phase25/focused-2026-09-13T03-04-42-696Z/SUMMARY.json
- GREEN: verification/evidence/phase25/focused-2026-09-13T03-06-02-892Z/SUMMARY.json (실패/undo/재시도 1745 ms, 실제 coupled 후보→적용/재계산→복원 8600 ms)
- 최종 확장 시험: verification/evidence/phase25/focused-2026-09-13T03-06-41-374Z/SUMMARY.json (기존 coupled 결과 보존 guard 포함 8518 ms).
- 브라우저 화면 캡처·전체 migration matrix·종합검증·배포는 이번 실행에 포함하지 않았다. 원래 Phase25 전체 완료 조건은 유지한다.


## 2026-09-13 M10 요구사항 원문·증거 대조 도구
- tools/audit-phase25-requirements.mjs 추가. 원문 hash, 85개 항목의 id/종류/행/본문, 누락·중복·변경·근거 없는 VERIFIED 및 조기 완료 표기를 확인한다. 수치시험을 자동 실행하지 않는다.
- 연결 파일 hash와 선택 시험 SUMMARY/SOURCE_MANIFEST 및 현재 source/test 차이를 기록한다. 과거 PASS 기록의 무결성과 현재 버전 일치 여부는 별도 필드이며, 자동 대조만으로 내용상 요구사항 충족을 선언하지 않는다.
- RED: focused-2026-09-13T03-08-44-674Z. GREEN: verification/evidence/phase25/focused-2026-09-13T03-10-34-618Z/SUMMARY.json (56 ms).
- 실제 대조: verification/evidence/phase25/requirements-2026-09-13T03-10-36-209Z/AUDIT.json. 원문 항목85/누락·중복 없음, 연결자료38/무효0, 과거 source/test 상태 시험묶음12. 실행 시점의 상태는 UNREVIEWED79/PARTIAL6. 미대조는 미구현과 다르며 항목별 완료 판정은 아직 미완료다.
- 처음 검사에서 test 변경을 기록 자체 무효로 분류했던 부분은 historical/currentTestsMatch로 분리해 수정했다. 과거 기록은 삭제하거나 현재 PASS로 재표기하지 않았다.


## 2026-09-13 잔여 실행계획 C1 착수 — 장기 처짐 계산 기록/보고서
- REMAINING_EXECUTION_PLAN.md에 C1 장기변형, C2 접합 보완, C3 저장/버전, C4 실제 UI/WebMCP, C5 원문 감사, C6 공개 패키징의 순서와 완료 근거를 정했다. 원래 M0–M10/85개 요구사항을 대체하거나 축소하지 않는다.
- regionalServiceability의 최종 수치 준비 단계에 postAttachmentCalculation v1 추가. LIVE/SUST/TOTAL, 기간·재하순서, 경계·허용비, 구간별 Ec/Ie/압축철근비/장기계수/부착 전 공제/잔여 활하중 비율과 최종 수요·허용값·판정·KDS 근거를 보존한다.
- 계산서 formatter는 준비된 기록을 한국어 계산 단계로 출력한다. 수치 재계산 없음. 기존 무축력 단축휨 곡률 경로의 지원 범위를 유지한다.
- evaluator v207, RC service policy v19로 갱신하여 이전 준비 결과와 구분한다.
- RED: focused-2026-09-13T03-23-12-085Z (계산 기록 없음). GREEN: focused-2026-09-13T03-24-08-509Z (독립 장기 수치/보고서930 ms, 실제 Worker/WebMCP3331 ms). 최종 v19 공통 평가 기록 확인: focused-2026-09-13T03-24-46-927Z (3353 ms).
- 실제 WebMCP 공통 평가 snapshot에서 동일 demand와 부착 전 공제 근거 보존 확인. PDF 화면 렌더 검증 및 새 축력/양축 프레임 경로의 부착 정책은 잔여이며 C1 전체 완료 아님. 종합/실제 건물/배포 미실행.


## 2026-09-13 C3/C4 실제 브라우저 Book 가져오기 수정 및 출력/복원 확인
- 실제 메뉴에서 Product Book v2를 가져오면 기존 JSON handler가 거부하는 오류 재현. nativeBookFileInput을 공통 nativePersistence에 연결했다. format이 다른 기존 파일은 원래 이벤트로 1회 전달한다. 32 MiB 입력 상한/읽기 전 메모리 예약/읽기 중 입력 변경 및 pagehide 차단/해제를 추가했다. native persistence v7.
- 선택 TDD: focused-2026-09-13T03-58-57-689Z RED → focused-2026-09-13T03-59-54-042Z GREEN(새 입력54 ms, typed Book 호환1249 ms). 최초 선택 실행의 미등록 기존 시험은 runner에 명시 등록 후 실행했다.
- 기존 ordinary beam fixture를 공용 tests/fixtures/p25/ordinaryBeam.js로 분리하고 재현 Book 생성 tool 추가. 기존 56개 부재검사 집중 시험 focused-2026-09-13T03-56-03-087Z PASS(4874 ms).
- 별도 Playwright 세션에서 UI 가져오기→실제 WebMCP 네 CPU 조합→상세 검토→UI 저장 평가 선택/필터→PDF 전권 ZIP→IndexedDB 저장/새 페이지 복원을 실행했다. 사용자 in-app 탭의 모델은 변경하지 않았다.
- 결과116건: OK32/NG0/NOT_CHECKED42/N_A42/FAILED0. 전체 설계 미완료 유지. 장기 처짐 demand=0.0003190508465214752 m, capacity=0.00625 m, ratio=0.051048135443436025. 실제 UI/KDS 근거 및 PDF37쪽에서 준비된 계산 기록 확인.
- PDF3권149쪽의 각 byteLength/hash/연속 페이지 범위 및 평가/입력 ID 일치 확인. 37쪽을 시각 확인했으며 전체 페이지 시각 검증은 실행하지 않았다. 계산서가 지나치게 길다는 사용성 잔여를 기록한다.
- 같은 평가 ID 복원 후 RESTORED_BUILD_UNBOUND 상태 유지 확인. 독립 방법 자격이나 전체 골조 UI 검증 완료로 승격하지 않는다.
- 증거: output/playwright/phase25-closeout/AUDIT.json, 실제 캡처/Book/전후 JSON 및 output/pdf/phase25-closeout/ordinary-beam-review-all.zip.
- 초기 npm 네트워크 접근 실패 후 이미 설치된 CLI 사용. 브라우저 데몬 경로 접근은 자동 승인된 실행 권한으로 진행했다. 초기 화면의 legacy statusChip과 workflow 결과 상태 차이는 아직 결함으로 확정하지 않았다.


## 2026-09-13 C2 — 관통 정착 기둥 깊이 보완 연결
- jointColumnDepthProposal v1: 기존 jointThroughBars의 기록된 필요 깊이를 사용해 정렬된 직사각형 상·하부 기둥을 25 mm 단위로 함께 확대한다. 새 단면 ID를 할당하므로 기존 단면을 공유하는 다른 부재는 바뀌지 않는다.
- 현재 기둥의 전체 배근 구간을 확인하고 bar index/제품/개수를 보존한다. 기둥 후프가 선언된 경우 기존 memberCandidateCommands의 배근·이음 변환을 사용한다. 후프가 없는 기록은 패널 경계를 기준으로 외곽 좌표 이동/내부 좌표 비례 이동 후보만 만들며, 후프를 임의 생성하거나 접촉·간섭 합격을 추정하지 않는다. 이 경로의 이음은 명시적 매핑 없이는 거부한다.
- 잠긴 상세, 불일치 기둥 단면·축, 구간 공백, 오프셋/변단면 및 명령 한도 초과를 거부한다. 연결된 다른 접합부/기초 치수는 기존 section coupling owner를 사용한다. 후보 적용 후 반드시 전역 재해석과 전체 재검토를 수행한다.
- WebMCP 공통 후보 서비스에 jointWidth/jointDepth 제약, affectedMemberIds, 유효한 affectedDetailIds를 연결했다. 생성 불가 시 hook/depth 등의 하위 사유를 포함한 proposalFailure를 반환한다. candidate strategy v163.
- 작은 혼합 접합 WebMCP 회귀: 기존 후크 보완 후 기둥 깊이 400→500 mm, 두 기둥 단면·배근 변경, 새 해석 및 정착 OK 확인. 다른 보 단면/관통 철근 불변, 잠금·불일치 거부, 계획의 입력 비변경을 검사했다.
- 초기 RED focused-2026-09-13T04-24-11-244Z: 기존 배근 변환이 해당 배치를 거부했다. 중간 거부 기록과 변경 과정을 보존한다. 기둥 깊이 helper 초안은 이 RED 이전 작성되었으므로 helper 전체를 선행 TDD로 작성했다고 주장하지 않는다.
- 최종 결과에도 joint-confinement, joint-hoop-detail, joint-bar-congestion 3건 NG가 남는다. 정착만 해결한 것을 접합 상세 전체 완료로 표시하지 않는다. C2와 Phase25 전체는 미완료다.
- 전체 회귀/실제 건물/배포는 실행하지 않았다.

- 최종 선택 검사: `verification/evidence/phase25/focused-2026-09-13T04-31-39-044Z/` — 혼합 접합 후보 적용/재해석 11302 ms, WebMCP 모듈 1239 ms PASS. 요구사항 증거 검사 `requirements-2026-09-13T04-32-39-370Z/AUDIT.json` — 원문 85개 정합, 증거 47개, 무효 0개. 항목별 원문 조건 전체 완료 대조는 아직 미완료다.


## 2026-09-13 C2 접합 공간 상세 보완 및 WebMCP 조회 크기 수정

- `resizeSpatialHoopCoordinates`의 정확한 좌표 대응과 원래 후프 지지점 증명을 `fitSpatialHoopBars`에 연결했다. 새 단면의 공간 굽힘 접촉을 다시 풀며 철근 번호를 보존한다. 임의 재정렬·다른 직경·후프 조건 변경·미지원 transfer는 이 경로로 승인하지 않는다. 기둥 깊이 proposal v2.
- RED `focused-2026-09-13T04-46-31-503Z`: 단순 확대 후 기존 모서리 지지 OK가 NOT_CHECKED가 되는 결함. GREEN `focused-2026-09-13T04-47-24-104Z` 1872 ms. 최초 시험 작성 때 잘못된 결과 owner를 읽은 실패는 별도 이력으로 보존했다.
- `jointCageSpacingProposal` v2: 기록된 수직 간격 상한 안의 25 mm 격자 최대 8개를 탐색한다. 종방향 철근 간섭이 해소된 뒤에는 최대 40개 간격/시작·끝 위치 조합에 대해 전체 후프·구속 계산을 확인한다. 검토자가 지정한 상세를 자동 변경하지 않으며, 동일 배치 반복 후보를 제외한다. 탐색 범위를 넘는 해의 존재를 부정하지 않는다.
- `jointBeamLayerProposal` v1: 확인된 혼합 접합의 관통 보 2개(전 구간, 이음/후프 매핑 불필요한 제한 범위)를 100 mm 확대하고 기존 철근층을 보존해 이동한다. 같은 보의 대향 후크가 겹치면 음의 y 철근층을 z 방향의 별도 위치로 이동한다. 이동량은 기존 직경·요구 이격을 바탕으로 5 mm 단위/최대 50 mm로 제한한다. 제품·개수·하중·재료 강도는 보존하고 연결 패널 높이를 갱신한다. 건축 간섭은 미확인이다.
- 실제 WebMCP 후보→적용→새 해석→재검토에서 주근 간섭 및 정착 OK 확인. `focused-2026-09-13T04-54-54-303Z` 7091 ms. 이후 탐색 실패/입력 비변경까지 `focused-2026-09-13T05-00-03-771Z` 7405 ms 및 모듈 조회 1257 ms PASS.
- 시험 모델의 접합 9개 검사 중 7개 OK, `joint-confinement`와 `joint-hoop-detail` 2개 NG. 남은 사유는 후프와 보 주근의 물리적 간섭 때문에 크로스타이의 구속 기여를 인정할 수 없는 것이다. 범위 내 적합 배치를 찾지 못하면 `JOINT_CAGE_NO_QUALIFIED_LAYOUT`와 시도별 사유를 반환하고 계획/입력 변경을 만들지 않는다. 합격하도록 허용값이나 검사를 바꾸지 않았다.
- 증거: `output/phase25/joint-layer-repair-webmcp-audit.json`, 공용 혼합 접합 fixture 및 `p25-m6-depth-contact`, `p25-m6-joint-layer-webmcp`.
- candidate strategy v165. `get_design_modules` v35에서 최적화 모듈에 접합 보완 제약을 공개했다. 전체 목록이 48000자 응답 한도를 넘는 RED를 발견했고, reinforcement/member-review의 중복 sectionRepair를 optimization 참조로 바꿨다. 전체 목록 42697자; 상세 moduleId 조회와 동일성/읽기 전용 검사 `focused-2026-09-13T05-05-18-621Z` 1271 ms PASS. 응답 제한 자체는 늘리지 않았다.
- C1 조사: 기존 단축 장기 처짐 최종 계산/계산서는 연결되어 있다. 새 축력·양축 프레임의 `composeStages`는 서로 다른 수치 상태 합성만 제공한다. 부착 당시의 하중·재료 시간 상태가 정의되지 않은 결과에 KDS 최종 장기 판정을 부여할 수 없으며, 이 경로의 시점 입력/상태 해석/판정/보고서 연결은 이번 C2 수정으로 구현되지 않았다.
- C3/C4 이전 브라우저 증거는 이전 소스 이력이다. 이번 변경의 새 브라우저 화면/전체 저장·복원 재검증, C5 원문 85개 의미상 충족 감사, C6 최종 공개 패키징은 완료로 승격하지 않는다. 전체 회귀·실제 건물·배포 미실행.

- 최종 선택 검사 `verification/evidence/phase25/focused-2026-09-13T05-09-54-784Z/`: 공간 접촉/미지원·잠금/배치 실패 2744 ms, 실제 WebMCP 보완 및 실패 시 입력 보존 7500 ms, 모듈 조회 1251 ms PASS. 요구사항 파일 검사 `requirements-2026-09-13T05-10-40-639Z/AUDIT.json`: 85개 원문 항목 정합, 증거 52개, 무효 0개. 전체 요구사항의 의미상 완료를 입증한 결과는 아니다.


## 2026-09-13 부착 시점 축력·양축 장기변형 연결

- 콘크리트 재료에 부착 재령, 부착 시점 크리프 계수와 근거, 건조수축 값과 근거를 추가했다. 최종 재령 입력은 유지한다. 부착 상태를 최종 상태에서 암묵적으로 복사하지 않는다.
- 동일 입력·지속하중 조합으로 `attachment-effective-modulus`와 `sustained-effective-modulus`를 실행하고, 공용 `compose_rc_service_stages.postAttachment`에서 최종 변형장 − 부착 변형장의 극값을 구한다. 축변형 u와 양방향 처짐 v/w를 각각 지정 허용변위와 비교한다. 개별 결과의 최대값끼리 빼지 않는다.
- 화면의 결과 선택/판정과 WebMCP가 같은 준비 결과 및 Markdown 계산서를 사용한다. 재료/재령/하중 조합 불일치, 비현재 결과, 빈 허용값을 거부한다. 화면 이탈 후 이전 요청의 늦은 완료가 새 요청 상태를 바꾸지 못하게 했다.
- 두 결과 저장·복원 후 판정 해시와 계산서 일치를 확인했다. 결과 보관 상한 2개와 임시 작업 메모리 반환 정책을 유지했다.
- 범위는 동일 타설 재령·일정 지속하중·지정 계수 유효탄성계수의 두 재령 근사다. 응력이력 적분, 부착 후 추가 활하중, KDS 허용값 자동 산정, 전체 설계 승인은 포함하지 않는다. KDS 14 20 10 / 14 20 30 출처·조항을 기록하되 수치 OK와 KDS 적합성 미확정을 구분한다.
- 선택 검사 6개 PASS: `verification/evidence/phase25/focused-2026-09-13T05-56-46-966Z/SUMMARY.json`. 실제 Worker·WebMCP의 축력/양축 합성 시험을 별도 변환단면 탄성 공식과 대조했으며 오차 < 1e-9 m. 시험의 허용값 1 mm는 임의 검증값이다. 실제 건물·전체 회귀·브라우저 화면·배포 검증을 뜻하지 않는다.
- 상세 사용법: `docs/phase25/ATTACHMENT_TIME_REVIEW.md`. 생성 계산서: `output/phase25/rc-attachment-review.md`, 동일 원시 기록: `output/phase25/rc-attachment-review.json`.
