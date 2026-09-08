# 코드 리뷰와 최적화 — 2026-09-08

개발 기준선 `3e877d5`를 검토하고 런타임 `07b3e93`에서 관련 회귀 **95/95 PASS**를 확인했다. 8부재·32힌지 Pushover의 실행시간 중앙값은 **21.65초 → 5.97초(3.62배)**이며, 비교한 수치 결과는 정확히 일치한다. [원본 증거와 해시](../../verification/evidence/phase19/review-20260908/README.md)를 함께 보존한다.

## 리뷰 범위와 수정

723개 소스 파일·2,444개 import 관계를 정적으로 검사하고, 비선형 자동미분 연산·WebMCP 세션 종료·결과 조회 경로를 집중 검토했다. 모든 파일의 수치 알고리즘을 수동 검증한 것은 아니다.

| 우선순위 | 발견 내용 | 수정과 검증 |
| --- | --- | --- |
| P2 | `secondOrderJet`의 입력·출력 검사마다 gradient/Hessian TypedArray를 일반 배열로 복사해 반복 할당 | 복사 없이 전체 원소의 유한성을 검사한다. 수식·허용오차는 유지했다. 변경 가능한 배열의 검증 결과를 캐시하지 않으며, NaN/Infinity·출력 overflow 거부와 해석적 혼합미분을 확인했다. |
| P2 | 종료된 세션의 도구 정의를 직접 보관한 호출과 진행 중 응답이 살아남고, 취소 예외 하나가 후속 정리를 중단 | 실행 전·비동기 완료 후 `SESSION_DISPOSED`를 검사한다. 각 작업 취소를 독립적으로 시도하고 오류를 등록 상태에 기록한다. 재종료, 잔존 참조, 늦은 응답의 활동 통지 차단을 검사했다. 기존 등록 wrapper의 종료 차단은 유지된다. |
| P2 | Pushover capacity 조회가 페이지 요청에도 전체 곡선을 변환하여 응답 크기 제한에 도달할 수 있음 | 먼저 페이지를 선택한 뒤 변환한다. 10,000단계 중 20개 조회 시 선택점 포함 최대 21개만 투영한다. 전체 개수·전역 인덱스를 보존하며, 페이지 지정 없는 기존 UI 전체 곡선 조회도 유지한다. |

구현 커밋은 `3015978`, `2287d11`, `07b3e93`이다. 종료 후 접근의 오류 코드는 `HANDLE_NOT_FOUND` 대신 `SESSION_DISPOSED`가 우선한다. 종료 전에 이미 발생한 변경을 되돌리는 기능은 아니다.

## 성능과 수치 동일성

Windows x64, Node v24.16.0, Intel Core i7-13700KF에서 측정했다.

| 측정 | 이전 중앙값 | 수정 후 중앙값 | 비율 |
| --- | ---: | ---: | ---: |
| Jet 크기 12, 식 1,500회 | 80.32 ms | 12.73 ms | 6.31배 |
| Jet 크기 18, 식 1,500회 | 154.85 ms | 20.93 ms | 7.40배 |
| 8부재·32힌지 production WASM Pushover | 21.65 s | 5.97 s | 3.62배 |

Jet은 준비 실행 후 전후 7회 교대 측정했으며 값·gradient·Hessian 300개 비교가 정확히 일치했다. 프레임은 각 버전 3회, 매번 새 Node 자식 프로세스에서 실행했고 import 후 해석 시간만 측정했다. 다른 회귀 실행이 끝난 뒤 측정한 `frame-benchmark-controlled.json`을 표에 사용했다. 회귀와 동시에 실행한 탐색 측정은 로컬 output에만 보존하며 성능 근거에서 제외했다.

프레임 이전 checkout은 `467dd70`이며 리뷰 시작점 `3e877d5`와 수치 런타임이 같다. 수정 후 checkout은 `07b3e93`이다. capacityCurve·memberResults·hingeResults·storyResponse·단계별 audit가 6회 모두 깊은 동등성 검사에 통과했다. 이는 해당 소형 fixture의 측정이며 대형 모델, 전체 UI 응답시간 또는 M-tier 성능 자격으로 일반화하지 않는다.

## 회귀와 남은 작업

`verification/specs/phase19/review-tests.json`의 95개를 고정 커밋의 별도 archive checkout에서 실행했다. 탄성설계, WebMCP/host, 보고서, Pushover/NLTH, 힌지·fiber/PMM·SH1 관련 회귀를 포함한다. 95개 로그의 SHA-256을 확인했다. 전체 테스트 목록 442개를 이번에 모두 실행한 것은 아니며, 이번 브랜치의 GitHub CI·실제 브라우저 재검증 결과도 아니다.

아키텍처 감사는 전후 모두 import cycle 0, 미해결 상대 import 0이다. 기존 **경계 위반 41건(UI→수치 core 40, report→solver 1)**과 **문서화되지 않은 compatibility wrapper 5개**는 남아 있어 아키텍처 gate는 통과하지 못한다. 이 수는 정적 규칙 위반이며 41개의 재현된 런타임 결함을 뜻하지 않는다. 경계 위반을 숨기는 재수출 변경은 하지 않았다.

다음 구조 개선은 실제 호출을 확인한 뒤 UI 계산 준비를 제품 서비스로 옮기고, 보고서가 불변 결과만 소비하도록 분리하며, compatibility wrapper의 소유자·이행 계약을 정리하는 순서가 적절하다. 각 경계별 동등성 검증이 필요하다. 독립 외부 비교 2건·pilot 5건과 M-tier·배포 자격은 기존 미완료 상태를 유지한다.

## 기능별 모듈 재점검

사용자의 후속 요청에 따라 `81f6825` 기준 실제 import·실행 진입점을 재점검했다. **해석기는 이미 기능별로 분리되어 있다.** 41건을 모듈 분리 실패나 해석 재실행 41건으로 해석해서는 안 된다.

| 책임 | 실제 구현 위치 |
| --- | --- |
| 탄성 정적 조정·조립·요소·복원 | `src/solver/linear3d.js`, `linear3dFirstOrder.js`, `linear3dAssembly.js`, `linear3dElement.js`, `linear3dRecovery.js`, `linear3dPost.js` |
| P–Delta | `src/solver/pdelta/`의 secondOrder·tangentStiffness·stability 등 |
| 모드·응답스펙트럼·좌굴·선형 시간이력 | `src/dynamics/`의 modal·globalBuckling·linearDirectIntegration 등 |
| 판·쉘·기초·링크·구속조건 | `src/solver/shell/`, `foundation/`, `link/`, `domain/` |
| 비선형 정적·동적 실행 | `src/nonlinear/pushover/productionPushover.js`, `dynamics/productionNlth.js` |
| 비선형 평형·요소·재료·단면·상태 | `src/nonlinear/equilibrium/`, `elements/`, `materials/`, `fiber/`, `core/` |
| 공통 수치 계산·백엔드 | `src/compute/sparse/`, `elastic/`, `eigen/`, `backends/`, `nonlinear/` |
| 작업 실행·취소·결과 조회 | `src/compute/product/`, `src/nonlinear/product/`, 각 runtime/Worker |

`indexBridge.getProductAnalysisService()`는 탄성 static을 elastic service로, modal/responseSpectrum을 eigen service로 연결하며 이 Worker 조건에 해당하지 않는 경우 공통 case runner로 전달한다. 비선형 product job manager는 `analysisRouter.js`를 통해 engineId에 맞는 구현을 선택한다. Production Pushover와 NLTH는 공통 평형·요소·상태 모듈을 재사용한다. 비선형 router는 지원하지 않는 엔진을 legacy로 묵시적으로 대체하지 않는다.

정적 감사 재실행 결과는 723개 파일·2,444개 import·cycle 0으로 동일하며, sparse assembly·plate boundary·foundation recovery·stabilization의 owner 검사도 통과한다. 다만 이 검사는 이름·경로에 따른 제한된 감사이며 모든 수식 중복이나 책임 결합을 검출하지는 않는다.

41건의 실제 구성은 다음과 같다.

- `agentManifest.js` 34건: 모두 버전 상수 import다. 해당 import 자체가 해석 함수를 실행하는 것은 아니다. 모듈 로딩 의존성은 남으므로 가벼운 metadata 계약으로 정리할 수 있지만 실제 시작 시간·bundle 효과는 측정하지 않았다.
- `indexAgentApi.js` 3건: 진단·확장·등가 쉘 trace 참조다. `getAnalysis()`는 저장 결과가 없으면 `RESULT_REQUIRED`를 발생시키며 자동으로 전체 해석을 시작하지 않는다. 하중 확장 등 조회 시 파생 계산은 별도로 남는다.
- `indexPhase13ElasticWorkspace.js` 2건: 동일 shellLab 모듈의 lab·containment 함수에 대한 별도 import다. 독립 모듈 결함 두 개로 계산하지 않는다.
- `indexResultsPanel.js` 1건: 등가 쉘 badge 표시 함수 참조다.
- `detailedReport.js` 1건: 등가 쉘 trace 생성이다. 저장된 shellFrameAssembly가 없으면 `expandShellsToFrameLinks()`로 표현을 재구성한다. 전체 구조해석 재실행을 확인한 것은 아니며, 불변 결과만 읽는 보고서 계약과의 차이를 구분해야 한다.

남은 구조 개선도 기능 모듈의 전면 재분할보다 다음에 집중한다. 첫째, 버전 metadata·표시 함수와 계산 소유자의 의존성을 분리한다. 둘째, trace의 파생 계산을 명시적 결과 준비 단계로 옮긴다. 셋째, `linear3d.js`가 동적 해석과 강재 설계까지 조정하는 기존 통합 진입점의 책임을 정리한다. 넷째, `nonlinear/control/`의 초기 trace와 `equilibrium/`의 MDOF 구현, 기존 sparse와 compute sparse 경로의 사용자를 확인해 호환성 문서를 보완한다. 유사한 폴더 이름만으로 중복 엔진으로 판정하거나 삭제하지 않는다.

이번 후속 점검은 코드·정적 의존성 검토이며 런타임 수정과 수치 시험 재실행은 하지 않았다. 기존 95/95 결과는 앞서 기록한 고정 런타임에 대한 증거다.

## 재현

```powershell
node tools/run-p19-validation.mjs output/review-repeat --manifest=verification/specs/phase19/review-tests.json
node verification/harnesses/benchmark-jet-validation.mjs
node verification/harnesses/benchmark-frame-review.mjs <baseline-checkout> <candidate-checkout> --out=output/frame-review-repeat.json
```

회귀는 현재 HEAD를 고정한다. 원본 실행을 재현하려면 `07b3e93`을 별도 checkout하고 실행한다. 프레임 비교에는 같은 fixture가 있는 `467dd70`과 `07b3e93`의 깨끗한 checkout을 제공하고, 다른 수치 작업과 동시에 실행하지 않는다. 기존 증거 파일은 덮어쓰지 않는다.
