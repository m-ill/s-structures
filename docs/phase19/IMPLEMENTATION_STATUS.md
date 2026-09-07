# Phase 19 실제 진행 상태

```yaml
version: p19-status-v5
updated: 2026-09-07
status: m0-m4-complete
development_baseline: 7bb55d7ec6bd6b155361b26b7830c70b45043acb
public_baseline: e18d5b432c780523496f8aad489b502934ae0ebd
implemented_workpackages: [M0, M1, M2, M3, M4]
m0_m1_latest_distinct_tests: 59
m2_required_tests: 27
m2_passed_tests: 27
m2_failed_tests: 0
m2_source_commit: a9ec274ecdf49690e400256325a410beee520267
m3_required_tests: 34
m3_passed_tests: 34
m3_failed_tests: 0
m3_source_commit: 7683047ac3552672bd0c2dad8ae0919c6ae989e5
m4_required_tests: 39
m4_passed_tests: 39
m4_failed_tests: 0
m4_source_commit: 0c4142ff1f08af4cea4f75b4867165353f66c797
validation_strategy: m4-full-targeted-suite-on-one-commit
release_status: not-qualified
github_publication: not-performed
```

M0 기준선, M1 공통 계약에 이어 M2 탄성설계 입력 서비스를 구현했다. M2 고정 커밋의 별도 checkout에서 관련 회귀 27개가 모두 PASS다. M0~M1의 과거 59개 최신 판정과 이번 27개는 범위가 겹치므로 합산하지 않는다. M3 해석→설계검토→보고서 서비스도 구현했고 고정 커밋에서 관련 회귀 34/34 PASS를 확인했다. M4에서 WebMCP 27개 도구와 app 호스트 연결까지 구현하고 최종 관련 회귀 39/39 PASS를 확인했다. 비선형 추가 통합·자격 검증은 M5 이후 범위다.

| 작업 | 상태 | 근거 또는 남은 작업 |
|---|---|---|
| M0 기준선·범위 | 완료 | 소스 ZIP/SHA, API 대응표, High 41건, 기존 qualification·성능·미확정 담당 목록 |
| M1 공통 계약 | 완료 | 버전 입력 식별, 불변 기록, 명시적 준비, stale 및 조합·단위·변조 차단 |
| M2 설계 입력 | 완료 | 11개 타입, UI·Agent 공통 preview/apply, 원자성·단일 Undo·결과 무효화, 강재·RC 폼 동등성, 회귀 27/27 |
| M3 탄성설계 서비스 | 완료 | 실제 탄성 제품 실행→강재/RC 검토→불변 보고서, 회귀 34/34; 자동 PDF 실환경 검증은 별도 |
| M4 WebMCP·화면 | 완료 | 27개 도구, 직접/호스트 실제 강재·RC 흐름, 세션·프로젝트 결속, 회귀 39/39 |
| M5 비선형 기반 | 계획 | 초기상태·checkpoint·PMM 조립·엔진 routing |
| M6 Pushover/fiber/PMM | 계획 | 전역 경로·반전·rollback·독립 비교 |
| M7 MDOF NLTH | 계획 | 시간 적분·에너지·재시작·외부 비교 |
| M8 작업·성능·복구 | 계획 | 실제 Worker 취소·응답·규모·결과 보존 |
| M9 종합 검증 | 계획 | 해당 배포 범위의 G1~G8 및 독립 자격 |
| M10 배포 | 계획 | build/rule pack 결속, 공개 패키지·CI·Release |

## 구현 범위

- `p19-input-v1`: 모델·케이스·설정·설계기준·재료·단면·규칙판·build 식별을 분리하고 결속한다. 구버전 해시는 보존한다.
- 해석 run과 설계 run을 별도로 기록한다. 완료·수치 자격·설계 검토·전달 허가·stale을 구분한다. 설계 계산은 M3 공통 서비스에서 명시적으로 실행한다.
- 탄성 제품 작업은 큐 등록 시 입력을 복제한다. 실행 중 수정된 모델에 이전 결과를 새 결과로 결속하지 않는다.
- 23개 계산형 보고서·설계·trace·diagnostic getter는 준비된 view만 읽는다. `prepareResultView`에서 명시적으로 준비하며 UI 보고서 버튼과 기존 시험을 이 계약에 맞췄다.
- WebMCP v1 도구 9개와 기존 modelHash 계약을 유지하고 context에 새 입력 식별을 추가했다. M4에서 설계 입력·실행·보고서 도구 18개를 추가했다.

상세 API와 재현 명령은 [구현 계약](M0_M1_CONTRACT.md), 호출 예시는 [Agent Guide](../user-manual/AI_AGENT_GUIDE.md)에 있다.

## M2 구현과 검증

- 새 공통 서비스가 설계기준·하중·질량원·조합·재료/단면·부재 설계 속성·탄성 케이스 입력을 처리한다. 기존 designBasisChangeSet·massSourceChangeSet·loadCombinationChangeSet을 재사용한다.
- **탄성해석 → 설계 입력 변경** 패널과 in-page Agent의 4개 메서드는 같은 서비스를 사용한다. 기존 7단계 창/모델러는 유지하며 이 시점 이후 M4에서 신규 WebMCP 도구와 app host를 연결했다.
- 미리보기는 원본 revision/hash·단위·영향 부재·이전/다음 값·경고를 포함한다. 적용 시 입력/정책 재검사, 전체 검증, 단일 커밋과 Undo를 수행한다. 실패·변조·stale·중복·잠금·수정 불가능한 모델을 시험했다.
- 질량원 ID→solver 정의 객체 mapping과 참조 케이스 갱신, 6자유도 회전 질량 보존, 5종 탄성 케이스 settings 전달, 강재 별칭 우선순위와 RC 명시적 철근량 충돌을 처리한다.
- 기존 후보 KDS 팩의 승인 조건을 유지하며 요청으로 reviewer·승인 서명을 만들 수 없다. 신뢰하는 호스트 규칙 팩의 상태가 preview 후 바뀌면 적용을 차단한다. 수동 조합은 자동 승인 상태가 아니다.
- 검증 소스 `a9ec274`에서 27개 모두 PASS. 신규 서비스 시험 11개 시나리오와 강재·RC 각 폼 이벤트→Agent canonical model 일치→Undo를 포함한다. 입력 경로의 숨은 solver 실행 0회를 확인했다.
- 같은 런타임의 실제 Codex 브라우저에서 하중 케이스 생성→미리보기→적용→실행취소, 결과 무효 표시, 기존 native WebMCP context의 입력 해시 변경·job 0개·console error 0건을 확인했다. 실제 브라우저 전체 강재·RC 설계나 지원 브라우저 matrix 검증은 아니다.
- [M2 계약](M2_CONTRACT.md), [고정 시험 목록](../../verification/specs/phase19/m2-tests.json), [증거와 재현](../../verification/evidence/phase19/m2/README.md). 원본 소스 ZIP·checkout·로그는 `output/phase19/m2-r1-20260907/`에 보존한다. 후속 문서·taxonomy 변경은 런타임을 바꾸지 않는다.

## M3 구현과 검증

- 정적·Direct P–Delta·모달·RSA·좌굴·선형 THA를 기존 제품 실행기로 순차 실행한다. 선행 조합 실패·취소·미발행 기록을 과거 성공으로 대체하지 않는다.
- 강재·RC 실제 정적/Direct 실행 기록에서 조합별 검토를 만들고 UI bridge/Agent 검토 행의 동등성을 확인했다. 조회와 보고서 생성은 추가 해석을 하지 않는다.
- 강재·RC·service 조합 층간변위·접합/기초 예비 검토를 포함한다. 필요 기초면적은 안전 판정이 아니므로 NOT_CHECKED, RC 입력 경고는 WARN을 유지한다. Legacy P–Delta 비교 결과와 비정적 설계수요 mapping은 차단한다.
- 같은 불변 snapshot으로 한·영 HTML, JSON, CSV 및 P11 PDF용 HTML 부록을 만든다. 실제 브라우저 다운로드 3종의 수치와 source ID를 대조했다. 예제 91행 중 WARN 8 / NOT_CHECKED 4를 그대로 표시한다.
- 자동 PDF는 기존 P11 workflow에 연결했지만 기본 브라우저의 transport·figure·qualification이 미준비여서 차단된다. 실제 PDF 생성·인쇄·레이아웃 자격 검증은 수행하지 않았다.
- 소스 `7683047`의 별도 checkout에서 관련 시험 34/34 PASS. [M3 계약](M3_CONTRACT.md), [고정 목록](../../verification/specs/phase19/m3-tests.json), [검증 증거](../../verification/evidence/phase19/m3/README.md). 이전 시험 개수와 합산하지 않는다.
- GitHub push·공개 재배포는 수행하지 않았다. M4에서 신규 WebMCP 도구·작업 화면 통합을 이어서 완료했다.

## M4 구현과 검증

- 기존 9개 도구에 typed 입력/케이스 변경, 탄성 순차 실행·취소, 설계 검토·페이지 조회, 보고서 생성·조각 조회, 화면 전환을 추가해 27개를 제공한다. 임의 코드·파일 경로·외부 발송은 제공하지 않는다.
- 직접 index와 app 호스트가 같은 서비스를 사용한다. 호스트는 실제 iframe·Document·origin·session/nonce·project 결속을 확인하며 전환 시 등록·핸들 폐기와 소유 작업 취소를 요청한다. 세션 UUID로 서로 다른 프로젝트의 핸들 순번 충돌도 차단한다.
- 로컬 서버의 `/index.html?shell=1`만 같은 출처 임베딩을 허용한다. API와 다른 페이지의 DENY/CSP 정책을 유지하고 실제 HTTP 회귀로 확인했다.
- 최종 소스 `0c4142ff1f08af4cea4f75b4867165353f66c797`의 별도 checkout에서 **39/39 PASS**. [M4 계약](M4_CONTRACT.md), [시험 목록](../../verification/specs/phase19/m4-tests.json), [증거](../../verification/evidence/phase19/m4/README.md).
- 실제 Site tools로 강재 직접 진입·RC app 호스트의 입력→정적해석→설계→보고서를 완료하고 UI와 snapshot 해시가 일치했다. 프로젝트 A/B 전환 시 stale 등록과 이전 변경 handle이 차단됐다. 세션 보강 후 강재 전체 흐름도 재확인했다. 최종 fallback 변경과 브라우저 후보별 범위는 증빙에 구분한다.
- WebMCP 미지원·crypto API 부재의 일반 UI 초기화는 모의 환경에서 확인했다. 초기 호스트 MutationObserver 오류 1건은 출처 미확인이며 새 프로젝트 세션에서 재현되지 않았다. 일부 CDP 조작 지연은 접근성 API로 완료했다. 브라우저 matrix·UI 성능 자격으로 확대 해석하지 않는다.
- 자동 PDF 실환경·비선형 생산 자격·GitHub push는 미완료다. 다음 구현 범위는 M5다.

## 검증 추적

[검증 요약](../../verification/evidence/phase19/m0-m1/acceptance-summary.json)에 59개 필수 시험의 최신 PASS, 실행 커밋, 로그·ZIP 해시와 변경 범위를 기록했다. 최종 한 커밋에서 59개를 일괄 실행한 결과는 아니다.

- R1: 34개 중 32 PASS. 두 보고서 시험을 명시적 준비 계약으로 이행했다.
- R2: 53개 중 52 PASS. 대형 P–Delta 보고서가 180초 제한에 도달했다.
- R3 (`0116957`): 56개 중 55 PASS. 대형 보고서는 600초 예산에서 통과했다. 명령 브리지의 trace 조회 시험 호출 한 곳을 수정했다.
- R4 (`fafff38`): 명령 브리지 1개 PASS. R3와 런타임은 동일하다.
- R5 (`e07f975`): diagnostic getter 3개를 cache에 추가한 뒤 새 대상·공통 계약·수치 동등성·명령 브리지 6개 중 5 PASS. Pilot 시험의 모델 context가 빠져 있었다.
- R6 (`b8dd864`): Pilot API fixture에 모델 context를 제공한 후 1개 PASS. R5와 런타임은 동일하다.

R3 이후의 런타임 변경은 [cache 대상 세 이름 추가](../../verification/evidence/phase19/m0-m1/runtime-delta.diff)뿐이다. 회귀 목록 전체의 최신 결과는 59 PASS/0 FAIL이다. 테스트 호출·fixture 변경으로 기존 수치 판정과 비교 기준을 완화하지 않았다. 원본 실패 로그는 별도 run에 보존했다. 문서 매뉴얼 검사도 별도로 통과했다.

`e75fb2f`의 실제 Codex 브라우저에서 탄성 탭, 설계요약 생성, native WebMCP context의 `p19-input-v1`, 조회 후 job 0개를 관찰했다. 이것은 로컬 스모크이며 강재·RC 전체 WebMCP 작업, app host, 브라우저 matrix, 성능 자격 검증은 아니다.

## 남은 생산 조건

- 아키텍처 High import 41건(UI 수치 직접 의존 40, report→solver 1)은 M3/M5에서 해소·검증한다. 명시적 보고서 준비 안의 legacy solver 실행도 남아 있다.
- 비선형 Q1 외부 비교 2건, Q4 규모·브라우저, Q5 독립 pilot 5건의 자격 조건을 유지한다. PMM 전역 조립은 M5에서 검증한다.
- 런타임 build/rule pack이 미주입이면 새 기록의 설계전달은 차단된다. 외부 검토 담당과 고정 성능 장비의 브라우저·전원 모드는 미확정이다.
- 기존 21개 비교나 이번 계약 회귀의 통과를 전체 비선형·최종설계 자격으로 확대하지 않는다.

현재 작업 브랜치는 `work/phase19-m2-20260907`이다. 이번 범위는 로컬 구현·커밋·검증이며 공개 main과 GitHub Pages는 갱신하지 않았다.
