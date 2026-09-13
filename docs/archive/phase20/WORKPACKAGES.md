# Phase 20 작업 패키지

계획 v1 · [목표 구조](TARGET_ARCHITECTURE.md) · [검증 계획](VALIDATION_PLAN.md)

## M0 — 기준선과 경계 계약

**입력:** 현 HEAD·작업 트리, Phase 19 리뷰/95개 manifest, public export·compatibility 정책.

- 사용자 변경과 기존 증거를 보존하고 별도 개발 브랜치·archive checkout을 준비한다. 기준 commit/tree/runtime·소스 해시·문서 변경을 구분한다.
- 41건을 버전/표시/진단/계산 실행으로 분류하고 import 심볼·실제 public 설치 후 함수·간접 호출을 기록한다. 버전 import 외의 manifest 의존성도 목록화해 범위를 고정한다.
- `linear3d.js` 전체 export와 src/index·Worker·CLI·Agent·tests의 소비자를 찾고 sync/async·옵션 기본값·반환·에러·빈/실패 모델 계약을 고정한다.
- snapshot 입력/run/options 키, 입력 진단, compatibility 예외, 필수 시험·수치 비교 필드·성능/메모리 측정 조건을 구현 전에 확정한다.
- 임의 새 자격 조건을 추가하지 않고 기존 문서에서 실제 진행 상태·공개 상태를 원본 증거에 맞춰 확인한다.

**산출물:** 기준선 manifest, 경계/소비자 목록, 계약 fixture, Phase 20 필수 시험 manifest, 성능 기준 기록. 제안 위치는 `verification/specs/phase20/`와 `verification/evidence/phase20/m0/`이며 실제 실행 후 생성한다.

**완료:** 모든 변경 대상에 현 owner·새 owner·소비자·호환 방침·시험이 대응되고 미확정 경로가 명시된다. 공개 API 파괴 없이 구현할 수 있는 설계가 정리된다.

## M1 — 버전·표시 정보 분리

**의존:** M0.

- 가벼운 metadata owner에 기존 상수 정의를 이동하고 old export를 보존한다. manifest가 numerical module/barrel을 거쳐 상수를 가져오지 않게 한다.
- badge/상태 표시와 계산 owner를 분리한다. 값의 수동 복사와 같은 계산의 UI 복제를 금지한다.
- 지원 기능·버전·engineId·자격 표시를 기존 manifest와 비교한다. 정적 그래프와 실제 metadata import 시 backend 초기화 여부를 검사한다.

**완료:** 기존 34개 metadata 직접 참조 제거, metadata의 전이적 수치/Worker 의존 0, 관련 public constant·capability 동등. 표시 소비자는 계산 실행 0. 크기·로드 시간 개선은 측정값만 기록한다.

## M2 — 준비된 결과와 보고서

**의존:** M0, M1의 공통 metadata 계약.

- 기존 `resultViewCache`·workflow result 저장 구조를 재사용해 builder를 제품 결과 준비 owner로 이관한다. 이미 순수 조회인 23종을 다시 구현하지 않는다.
- 상세보고서 → 통합 결과 → 비선형 trace 등 간접 계산까지 인벤토리화하고 `getCalculationPackage`도 함께 전환한다.
- 분석 결과 준비와 모델 입력 진단 준비를 구분한다. 즉시 입력 진단 getter는 호환 API로 유지하며 신규 제품 호출은 명시적 준비를 사용한다.
- run/model/design/options/schema/locale에 결속한 snapshot, 미준비·stale·실패·재준비·세션 종료를 구현한다. 변경 중 준비·동시 요청·캐시 상한을 검증한다.
- UI·Agent·WebMCP와 report export는 같은 snapshot을 소비한다. 보고서 열기 버튼은 명시적으로 준비를 요청할 수 있지만 일반 읽기 도구는 준비를 호출하지 않는다.

**완료:** 신규 제품 조회·renderer의 solver/설계/trace builder 호출 0, input 진단 호환 예외는 별도 보고. 동일 run의 수치·출처·경고가 UI/Agent/WebMCP/HTML·JSON·CSV에서 일치. 보고서 부족 데이터를 자동 재해석으로 채우지 않음.

## M3 — 탄성 실행 조정 분리

**의존:** M2의 snapshot·호환 계약.

- 순수 탄성 단계와 제품 orchestration을 먼저 병존시켜 기준 경로와 비교한다. 비교를 위해 제품 실행 때 이중 해석하지 않고 test harness에서 두 경로를 별도로 실행한다.
- 조합 복원·완결성·envelope, P–Delta off/direct/legacy, 동적 enabled 기본값, 설계수요 선택·차단·경고·audit 순서를 보존한다.
- 내부 adapter/case engine/Worker를 leaf 또는 canonical product owner로 순차 이행한다. factor cache·override·취소·진행률을 같이 확인한다.
- 기존 공개 API는 문서화된 동기 façade로 연결한다. 상향 compatibility edge를 raw 감사에도 노출하며 cycle 없이 허용 소비자만 남긴다.

**완료:** 순수 탄성 owner의 dynamics/design/product 실행 의존 0, 내부 production 소비자의 옛 façade import 0, 기존 public sync/shape/default/error 동등, 수치·차단·결과 출처 일치. metadata만 재수출해 기존 실체를 숨긴 상태는 완료가 아니다.

## M4 — 초기 trace와 호환 경로 관리

**의존:** M0의 인벤토리, M3의 최종 소비자 이행.

- trace/legacy/production와 sparse 계층별 역할 표를 파일·함수·실제 소비자·engineId·state/backend·결과 자격에 연결한다.
- 기존 public path와 alias는 유지하고 신규 production 코드는 허용된 production owner만 사용하도록 검사한다. 명시적 진단 목적의 trace 호출은 따로 표시한다.
- 미문서 wrapper와 기한 경과 policy를 소비자별로 폐기·이행·유지 결정한다. 유지할 경우 다음 검토 조건과 제거 조건을 구체적으로 기록한다.
- 자동 wrapper 후보 중 현역 도메인 계약·legacy 자격 정책을 구분해 문서화한다. 분류를 바꾸면 raw 발견과 변경 사유를 함께 보존한다. shared router의 명시적 legacy 분기는 production 실행 fallback과 별도로 검사한다.
- unsupported engine, sync production 호출, 미지원 제어 방식과 nonlinear→elastic 설계전달 차단을 재검증한다.

**완료:** 미문서 compatibility 0, 소유자 없는/묵시적 예외 0, cycle 0, 허용되지 않은 production→legacy fallback 0. 숫자를 줄이기 위한 무조건 삭제·전역 예외·정책 날짜 변경은 허용하지 않는다.

## M5 — 통합 재검증과 공개 준비

**의존:** M1~M4 집중 검증 완료.

- 최종 후보 한 커밋의 clean archive checkout에서 고정 manifest를 실행한다. 이전 버전의 개별 PASS를 합산해 새 후보 PASS로 표시하지 않는다.
- 기존 95개를 바탕으로 M0에서 추가한 Phase 9 adapter/Worker, Phase 13 workspace, public sync/metadata/report/legacy 필수 회귀를 함께 실행한다. 변경 경로에 필요한 테스트를 고르고 전체 개수는 고정 manifest로 산출한다.
- Windows·Ubuntu Node 및 실제 지원 브라우저에서 UI·Agent·WebMCP 결과 동일성, 오류·취소·stale·패키지 재현을 확인한다. native WebMCP 사용 불가 환경과 모의 시험을 분리한다.
- 동일 환경의 이전 최적화 런타임 대비 수치·해석 시간·결과 준비 시간·반복 조회·캐시 메모리를 측정한다. 수치 작업을 병렬 실행해 시간을 왜곡하지 않는다.
- README·개발 상태·API/호환 표·증거 안내·Wiki를 갱신한다. 소스·runtime·검증 패키지는 기존 개발 프리뷰와 별도 버전으로 준비하고 현재 권한/저장소 흐름에 따라 개발 PR에 게시한다.

**완료:** [검증 gate](VALIDATION_PLAN.md)가 같은 후보에 결속되고 실패·예외·잔여 생산 자격을 함께 공개할 수 있다. 개발 PR/프리뷰·main/Pages·생산 자격의 상태를 각각 기록한다. 독립 검토 담당자의 외부 비교·pilot 판정은 사용자가 제공한 결과만 반영한다.

## 실패 시 처리

단계별 변경과 증거를 별도 커밋으로 묶는다. 수치·공개 API·자격 경계가 달라지면 해당 단계를 미완료로 두고 원인을 수정한 뒤 영향 범위를 재검증한다. 원인을 찾기 위해 기준 snapshot을 덮어쓰거나 허용오차를 늘리지 않는다. 되돌려야 할 경우 해당 단계의 알려진 변경만 새 되돌림 커밋으로 복구하고 사용자 작업·이전 증거는 보존한다. 실패 상태에서 다음 단계나 공개 상태를 완료로 올리지 않는다.
