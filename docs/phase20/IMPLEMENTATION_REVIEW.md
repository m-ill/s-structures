# Phase20 구현·검증 결과

2026-09-08 · M0~M5 완료 · 검증/패키지 소스 `810abc06fe9be38eb7bb10f1ba590cbcb87f36be` · 개발 프리뷰

버전·표시 의존, 조회에서의 파생 계산, 탄성 실행 조정, 초기 trace/production 호환의 책임을 분리했다. 기존 공개 동기 API와 수치·축·단위·설계 적격성은 유지한다. 기본 브라우저 예제와 JSON 가져오기의 오래된 스키마, 화면을 열 때 입력이 바뀌던 문제도 실제 브라우저 발견 후 수정했다.

## 실제 소유자

| 역할 | canonical owner | 유지한 호환 경로 |
| --- | --- | --- |
| 버전상수59개 | `src/metadata/numericVersions.js` | 원래47개 owner의 import/re-export; Agent manifest 값 불변 |
| shell 표시 | `src/results/equivalentShellScope.js` | `solver/shell/equivalentScope.js` |
| shell lab | `src/compute/product/shellLab.js` | `solver/shell/phase13ShellLab.js` |
| 파생 결과 준비 | `src/compute/product/resultPreparationBuilders.js` | UI/Agent API의 명시적 prepare와 old builder |
| 상세·계산서 데이터 | `src/compute/product/detailedReportData.js`, `calculationPackageData.js` | report의 공개 create builder, 순수 renderer |
| 준비된 결과 보관 | `src/compute/product/preparedResultViews.js` | `src/ui/resultViewCache.js` 재수출 |
| 탄성 조립·solve·resume | `src/solver/elastic/stages.js` | `src/solver/linear3d.js` 공개 동기 façade |
| 결과 계약 | `src/solver/elastic/resultContracts.js` | 기존 공개 함수 재수출 |
| P–Delta 조합 | `src/solver/pdelta/combinations.js` | 기존 analyzeModel 결과/기본 method |
| 동적·설계 조정 | `src/compute/product/elasticAnalysisWorkflow.js` | linear3d의 정확히1개 공개 호환 bridge |
| sparse 구현 | `src/compute/sparse/*`, `src/compute/backends/wasmCpuBackend.js` | 옛 solver/nonlinear sparse 경로 |

원시 감사는 직접 위반41→0, cycle0, 미해결 상대 import0이다. 모든 예외를 감춘 숫자가 아니다. 공개 bridge1개는 raw graph에 남고, 옛 공개 policy 날짜4개도 그대로 보존한다. [호환 registry](../../verification/specs/phase20/compatibility.json)가 22개 파일의 source hash·소유자·실제 허용 소비자·다음 검토/삭제 조건을 검사한다. 이 registry는 유지보수 검토의 기준이며 solver의 자격 정책을 덮어쓰지 않는다.

production Pushover/NLTH의 전이 의존은 초기 control/legacy 계산 경로로 이어지지 않는다. 기존 public path와 shared router의 명시적 legacy 분기는 남으며 미지원 engine·sync production·미지원 제어·설계전달은 차단한다. 숫자를 줄이기 위해 현역 도메인 계약이나 policy를 삭제하지 않았다.

## 결과 준비와 조회 계약

기존 computed view23개는 `prepareResultView(name, options)`에서 계산하고 `get…(options)`에서는 보관한 결과를 복제해 반환한다. 입력 진단은 해석 run 없이 `prepareInputDiagnostics(name, options)` → `getPreparedInputDiagnostics(name, options)`를 사용한다. 기존 `getElasticExpansionTrace`/`getLoadsV2Trace` 즉시 호출은 명시적 호환 API다.

- 입력 hash·결과 revision·options·view schema를 결속한다. 동일 요청 재준비는 snapshot을 재사용하며 동일 async 준비는 한 작업을 공유한다.
- 미준비는 `RESULT_REQUIRED`, 입력/결과 변경은 `STALE_INPUT`. 오래된 비동기 완료가 현재 모델 결과를 덮어쓰지 못한다.
- 32개 또는16 MiB **직렬화 바이트** 상한에서 오래전에 준비된 항목을 퇴출한다. 큰 단일 결과는 `RESULT_VIEW_TOO_LARGE`, async 작업 상한은 `RESULT_VIEW_BUSY`다. 실제 JS heap이나 빌더 중간 메모리 전체에 대한16 MiB 보장은 아니다.
- 모델 객체 전환·`clearResultViews()`·pagehide에서 준비 저장소를 비운다. 기존 결과의 영속 저장/재시작 복원은 이 저장소의 역할이 아니다.
- UI 보고서 버튼은 명시적으로 준비할 수 있다. 준비하지 않은 보고서를 일반 조회가 자동 재해석으로 채우지 않는다. 공개 create builder를 직접 사용하는 기존 통합 코드는 명시적 계산 경로다.

브라우저 host의 시작·모델 생성·JSON migration에서 현재 모델 스키마를 준비한다. 입력/context getter에서 migration을 실행하지 않는다. 설정 화면의 draft 읽기는 project ID를 쓰지 않아 결과 입력 식별자가 유지된다.

## 같은 후보의 검증

| Gate | 최종 확인 |
| --- | --- |
| G0 기준선 | 07b3e93 runtime, 131a2b3 계획/M0, 최종810abc0 commit/tree/clean archive·manifest 고정 |
| G1 의존 | metadata 전이 구현 import0, 직접 위반0·cycle0·미해결 상대 import0, bridge1개 노출 |
| G2 결과 준비 | 명시적 준비/읽기 분리, clone·중복 공유·run/options/stale·상한·늦은 완료 시험 |
| G3 수치/API | 빈 모델 + P–Delta off/direct/legacy × dynamics on/off의7개 결정적 전체 결과 정확 동등, sync export/default 보존; 동적·shell·강재·RC·비선형 관련 회귀 |
| G4 호환 | registry22개 source/consumer 검사, 허용 밖 fallback·routing 차단, 공개 manifest 값 불변 |
| G5 제품 | UI·Agent·WebMCP 자동 회귀; native WebMCP36개·정적/설계/보고서·Pushover/NLTH·stale·세션 재열기 실제 확인 |
| G6 증거/성능 | 로컬/Windows CI/Ubuntu CI 각112/112, frame10% 예산, report 준비/조회 측정, ZIP manifest·설치·원격 다운로드 hash 확인 |

최종 manifest hash는 `37e7c98284ee4d0567102509654a8ecbe51bc54d78ca893596614d8cff113cba`다. [CI34177589220](https://github.com/m-ill/s-structures/actions/runs/34177589220), [기존 Public validation34177589242](https://github.com/m-ill/s-structures/actions/runs/34177589242)도 success다. 전체 taxonomy447개 또는 npm test 전체를 실행했다고 주장하지 않는다. 112는 해당 manifest의 실행 단위 수다.

실제 브라우저 기본8부재 검토는79 OK·8 WARN·4 NOT_CHECKED, 최대비0.9103732902271767이었다. UI summary와 JSON은 정확히 같고 HTML은 같은 snapshot을 표시한다. CSV의91개 행은 같은 해석 출처·수치이며 기존 수식 주입 방지용 apostrophe 표기를 그대로 보존한다. schema blocker0, 최초 화면 전환 input hash 유지, 입력 변경 후 stale/보고서 차단, reload 후 HANDLE_NOT_FOUND를 확인했다. Pushover/NLTH는 module-worker/production-wasm-sparse, fallback false, candidate/designBlocked 상태다. HTML1280px 시각 검토와 화면 증거도 보존했다.

브라우저 실행 중 취소의 별도 타이밍 시험은 하지 않았다. 관련 취소·dispose·late completion은 자동 회귀로 검증했다. PDF 자동 저장은 기존 adapter·필수 figure·qualification 조건 부족으로 BLOCKED다. 이 차단을 우회하지 않았으며 HTML/JSON/CSV와 PDF 검증을 혼동하지 않는다.

## 성능 측정

Node24.16.0 / Windows x64 / i7-13700KF, 같은 최적화 기준07b3e93과 최종810abc0을 교대로3회 fresh process에서 측정했다. 다른 수치 작업을 동시에 실행하지 않았다.

| 항목 | 기준 | 최종 후보 | 판정/의미 |
| --- | ---: | ---: | --- |
| 8부재·32힌지 해석 중앙값 | 5912.54 ms | 5791.04 ms | -2.05%, 사전10% 회귀 예산 통과 |
| 최대 process RSS | 308940 KiB | 312820 KiB | +1.26%, 사전10% 예산 통과 |
| manifest import/evaluation 중앙값 | 410.32 ms | 407.50 ms | 계측값, browser 첫 로딩 개선으로 해석하지 않음 |
| 상세보고서 신규 준비 중앙값 | 1280.65 ms | 1300.28 ms | 약+1.5%, 소형 fixture 특성 측정 |
| 상세보고서 일반 조회 중앙값 | 10.02 ms | 10.01 ms | clone/identity 포함 |
| 같은 상세보고서 재준비 중앙값 | 1278.14 ms | 9.97 ms | 기존 빌더 반복에서 snapshot 재사용으로 변경 |

보고서는 process3회마다 warmup1회 후7개 준비 표본, 각20회 조회로 측정했다. 최종 캐시8개·6795232 직렬화 바이트·pending0이었다. 시간은 전체 모델 SLA가 아니며 M-tier나 대규모 생산 성능 자격이 아니다. 이전 페이즈의21.65→5.97초 최적화 수치를 Phase20 개선으로 재사용하지 않는다.

## 공개 패키지와 남은 범위

[개발 프리뷰](https://github.com/m-ill/s-structures/releases/tag/phase20-boundaries-preview-20260908)에 소스·runtime·evidence ZIP 및 SHA256SUMS를 게시했다. 세 ZIP 모두810abc0 소스 식별자를 사용한다. 설치 smoke는 runtime의740개 manifest 파일을 확인하고 새 디렉터리에서 서버·해석·6개 공개 경로를 검증했다. 게시 파일을 다시 다운로드해 SHA-256도 대조했다.

패키지에는 검증 커밋 당시 문서가 들어 있다. 완료 상태·사후 증거/공개 영수증은 개발 브랜치의 최신 문서를 따른다. 문서/증거 후속 커밋에 대해 새로운 수치 검증을 주장하지 않는다. 검토 PR은 Phase19 개발 브랜치를 기준으로 하므로 직전 코드 리뷰 최적화도 포함하며 그 별도95개 결과는 기존 문서에 기록돼 있다.

외부 비교2건·pilot5건의 판정은 사용자가 담당한다. 19A/B/C·M-tier·재시작 복원·생산 배포·최종 설계 승인 조건은 이번 구조 정리로 충족되지 않는다. 후속 사용자 요청으로 main/Pages에 반영했고 [배포 기록](PAGES_DEPLOYMENT.md)에 같은 소스의 재검증과 공개 확인을 남겼다. 웹 배포 이후에도 비선형은 candidate 및 설계전달 차단을 유지한다.
