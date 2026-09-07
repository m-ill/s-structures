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

## 재현

```powershell
node tools/run-p19-validation.mjs output/review-repeat --manifest=verification/specs/phase19/review-tests.json
node verification/harnesses/benchmark-jet-validation.mjs
node verification/harnesses/benchmark-frame-review.mjs <baseline-checkout> <candidate-checkout> --out=output/frame-review-repeat.json
```

회귀는 현재 HEAD를 고정한다. 원본 실행을 재현하려면 `07b3e93`을 별도 checkout하고 실행한다. 프레임 비교에는 같은 fixture가 있는 `467dd70`과 `07b3e93`의 깨끗한 checkout을 제공하고, 다른 수치 작업과 동시에 실행하지 않는다. 기존 증거 파일은 덮어쓰지 않는다.
