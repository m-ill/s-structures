# Phase 20 검증 계획

계획 v1 · 여기의 기준은 구현 합격 조건이며 **아직 실행하지 않았다**.

## 판정 gate

| Gate | 검증과 합격 조건 |
| --- | --- |
| G0 기준선 | source commit/tree/dirty files·runtime·고정 manifest·fixture·소비자·허용 예외 확인 |
| G1 의존성 | cycle·미해결 상대 import·production→verification 0; metadata 전이 수치 의존 0; 기존 41건의 처리 결과를 개별 추적 |
| G2 결과 준비 | 신규 제품 getter·renderer 호출 중 solver/설계/trace builder 0; 동일 키 재사용·stale/run/options 분리·상한 검증 |
| G3 탄성·동적·설계 동일성 | 계산 필드·단위·축·부호·조합·출처·경고·적격성 동일; 기존 공개 sync/async·오류·기본 옵션 유지 |
| G4 호환·라우팅 | public exports/alias 유지, 미분류·미문서 호환 항목 0, 허용하지 않은 호출/legacy fallback 0; 현역 계약과 등록 예외 raw graph에 표시 |
| G5 제품 표면 | 동일 입력/run의 UI·Agent·WebMCP·보고서 수치 동일; 오류·취소·stale·세션 종료·재열기 상태 일관 |
| G6 성능·증거 | 같은 환경·같은 fixture 비교, 고정 후보 회귀 PASS, 소스/로그/패키지 hash 검증, 한계 명시 |

정적 lint의 숫자만 0으로 만들지 않는다. M1의 metadata 의존·M2의 간접 builder·M3의 실제 solver 경계를 개별 검사한다. 공개 façade 유지에 필요한 최대 1개의 정확한 compatibility bridge(제안)는 G4 목록과 함께 G1 원시 결과에 노출한다. canonical solver 상향 의존이나 경로 전체 예외를 허용하지 않는다.

## 의미 있는 시나리오

| 대상 | 필수 시나리오 |
| --- | --- |
| metadata | old/new 값과 capability 깊은 동등성, 단독 import의 전이 그래프·backend 초기화 없음 |
| 모델 입력 진단 | 해석 run 없이 준비 가능, 모델/하중/설정 변경 후 stale, 기존 즉시 getter 호환 |
| 결과 snapshot | 미준비·정상·동일 입력의 다른 run·다른 options/locale/단위·입력 변경·실패 결과·누락 옛 기록 |
| 준비 동시성 | 동일 키 중복 요청, 다른 키 동시 준비, 준비 중 모델 변경·dispose, 늦은 완료가 현재 결과 덮어쓰기 금지 |
| 보고서 | 준비 완료 후 신규 제품 조회·renderer 구간의 간접 trace 포함 계산 호출 0, 입력 부족 시 명시적 오류, HTML·JSON·CSV 같은 snapshot 출처; 명시적 준비/옛 public builder 호환 경로의 계산은 별도 계수 |
| 탄성 실행 | first-order, P–Delta off/direct/legacy, 동적 enabled/disabled/default, 빈/잘못된/미완결 조합, override·screening·shell eligibility |
| 설계 | 기존 지배 envelope·source·경고·NOT_CHECKED·차단 보존, 강재·RC 명시적 검토의 해석 출처 동일 |
| 요소·동적 | frame·plate/shell·foundation/link, modal/RSA·buckling·linear THA와 질량·preload 의존 |
| 비선형 | 기존 8부재·32힌지 Pushover, NLTH, equilibrium/control trace 구분, explicit engine·async 강제, 미지원 SH1 dynamic 차단 |
| 공개 API | `src/index.js`·직접 `linear3d.js`·sync façade·CLI/Worker의 export/인자/default/result/error 동일 |

기존 파일이 확인된 필수 회귀 후보는 `m34-detailed-report`, `m42-calculation-package`, `p13-m2-agent-report-parity`, `p3-m12-wall-slab`, `p3-m19-integrated-report`, `p15-m8-pdelta-first-order-ownership`, `p9-m3-elastic-runtime`, `p9-m5-elastic-hybrid`, `p9-m5-pdelta-hybrid`, `p9-m6-eigen-dynamics`, `p10-m0-quick-corrections`다(`tests/*.mjs`). 기존 95개와 중복 제거 후 manifest에 포함한다. bridge가 없는 standalone Agent, 반환 clone의 외부 변조, 고정 generatedAt 기준 HTML 데이터 동등성도 확인한다.

코드 모양만 확인하는 테스트보다 실제 최종 설치된 API 호출, 입력 변경, 다른 run, 누락·오류 경로에 대한 검증을 우선한다. 호출 카운터/테스트용 dependency injection과 정적 전이 그래프를 함께 사용한다. renderer가 wrapper 뒤의 계산을 호출해도 검출해야 한다.

## 수치 비교 원칙

- 알고리즘·연산 순서를 보존하는 리팩토링이므로 결정적 수치 필드는 정확한 동등성을 우선 요구한다. 기본 허용오차를 넓히거나 기존 실패값을 새 expected로 대체하지 않는다.
- 기존 정밀도 기준이 필요한 backend/플랫폼 비교는 이미 고정된 tolerance를 사용한다. 차이가 나면 원인·영향을 설명하고 이 페이즈의 단순 책임 이동에서 분리한다.
- run ID·timestamp·duration 같은 실행별 필드는 M0에서 승인할 비교 제외 목록에 정확한 경로와 이유를 기록한다. displacement·force·design ratio·audit의 공학 필드나 qualification을 제외하면 안 된다.
- `analysisSource`, `designEligibility`, model/case/settings hash, candidate/blocked 상태는 필수 비교 대상이다. canonical snapshot version을 추가하면 기존 결과와의 변환을 별도 검증한다.

## 성능·자원

이전 최적화 버전 `07b3e93`을 비교 기준으로 사용한다. 5.97초는 특정 장비의 과거 중앙값이며 다른 장비의 절대 SLA가 아니다. 같은 환경에서 baseline과 candidate를 새로 측정한다.

M0에서 장비·Node/브라우저·fixture·warmup·표본 수·메모리 측정 방식·캐시 상한을 고정한다. 초기 제안은 같은 8부재 fixture 전후 각각 3회 fresh process 교대 측정, 준비/반복 조회는 warmup 후 7회 이상, 다른 수치 작업 동시 실행 금지다. 예산 제안은 해석 중앙값·최대 RSS가 baseline보다 10% 넘게 악화되지 않는 것과 캐시 상한 초과 시 검증된 퇴출이다. 장비 잡음으로 재측정할 조건도 결과를 보기 전에 정한다. M0에서 확정하지 못한 성능 기준은 미확정으로 남기며 PASS를 만들지 않는다.

metadata 첫 로딩과 보고서 준비/재조회 시간을 해석 실행과 따로 기록한다. 반복 조회 비용과 memory가 사용자 입력 없이 계속 증가하지 않는지 확인한다. 이는 Phase 20 회귀 예산이며 M-tier·대규모 모델 생산 성능 자격은 별도다.

## 검증 실행과 증거

기존 `verification/specs/phase19/review-tests.json`은 95개 관련 회귀의 출발점이다. 전체 taxonomy 442개를 이미 통과했다고 표현하지 않는다. M0에서 실제 소비자에 따라 adapter·sync·workspace·새 경계 시험을 추가한 Phase 20 manifest를 고정한다. M1~M4는 변경 범위 집중 시험, M5는 최종 후보 전체 manifest를 실행한다.

제안 증거 구조:

```text
verification/specs/phase20/          # 고정 입력·manifest·비교/호환 계약
verification/evidence/phase20/<run>/
  README.md                         # 판정·범위·실패·한계
  source-manifest.json               # commit/tree/runtime/archive hash
  validation.json + logs/            # manifest·test별 결과와 SHA-256
  architecture.json                  # 원시 발견과 허용 예외를 함께 보존
  parity.json                        # 전후 수치·API·출처 비교
  performance.json                   # 개별 표본과 측정 환경
  compatibility.json                 # 정확한 consumer·owner·예외
  SHA256SUMS
```

실제 실행 전에는 PASS 내용이나 빈 증거 패키지를 만들지 않는다. 예전 봉인 자료·실패 이력은 보존하고 재실행은 새 run 폴더에 남긴다. Git에는 재현에 필요한 fixture·계약·검증 로그를 두고 큰 소스/runtime ZIP은 versioned release artifact로 제공한다. `.gitattributes`의 증거 바이트 보존과 파일별 해시를 확인한다. 로컬 검증·GitHub CI·브라우저·외부 독립 검토는 출처별로 기록한다.

보고서 데이터 변경은 renderer smoke와 레이아웃 확인을 수행한다. PDF export가 해당 환경에서 차단되면 사유와 HTML/JSON 검증 범위를 기록하고 PDF 완료로 표시하지 않는다. native WebMCP 브라우저가 없으면 도구 계약 모의 시험과 실제 UI 검증을 구분한다.
