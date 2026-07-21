# P10-M0 Code Review

```yaml
reviewed_at: 2026-07-20
milestone: P10-M0
workpackage: WP-00
review_status: complete
milestone_decision: complete
full_npm_test: pass
critical_findings_open: 0
high_findings_open: 0
```

## 판정

P10-M0의 θ 4상태 판정, 2차해석 요구 차단, RSA 전 응답 scaling 및 provenance에 대한 focused review와 보정을 완료했다. 아래 focused tests와 선행 Phase 회귀 범위에 더해 저장소 전체 `npm.cmd test`가 종료 코드 0으로 완주했다.

따라서 코드·테스트·evidence·독립 리뷰 게이트를 모두 충족했으며 P10-M0를 완료로 판정한다.

## 리뷰 범위

- `src/solver/linear3d.js`: θ 경계, `statusLegacy`, Direct/Legacy/Off 라우팅, 설계 적격성 전파
- `src/compute/adapters/elasticProductionAdapter.js`: detailed/bounded 조합 저장 경로와 1차해석 P-Delta screening 동등성
- `src/core/analysisCriteria.js`, `src/dynamics/modal.js`: `rsa.applyBaseShearScaling` 기본값·override와 RSA 실행 경로
- `src/results/rsa/baseShearScale.js`: 방향별 scaling, null 처리, fail-closed 차단 및 provenance
- `src/results/phase6M4Trace.js`: 이미 적용된 scaling의 단일 소유권과 late override 충돌 처리
- `src/results/story/rsaResponse.js`, `drift.js`, `shear.js`, `overturning.js`: 층 응답 scaling과 파생값 provenance
- `tests/p10-m0-quick-corrections.mjs` 및 `reports/validation-evidence/phase10/p10-m0-quick-corrections.json`: 경계·통합·근거 artifact 결속
- Phase 3/7/8/9 runner, manifest, architecture 및 historical evidence baseline의 현재 코드 동기화

## 발견 및 보정사항

### 1. Legacy routing

발견: 호출자가 `options.pDeltaMethod='legacy'`를 명시해도 모델의 `analysisSettings.pDeltaMethod='direct'`가 후속 설계 요약에 섞이면 Legacy 비교 경로가 Direct로 해석되거나, `PDELTA_SECOND_ORDER_REQUIRED`가 일반 Legacy 차단 사유로 덮일 수 있었다.

보정:

- `analyzePDeltaCombinations()`는 명시적인 호출 옵션을 우선하고 모델 설정은 fallback으로만 사용한다.
- Legacy 결과의 설계 요약에는 `pDeltaMethod: 'legacy'`를 명시해 Direct 적격 경로로 승격되지 않게 했다.
- θ가 `REQUIRE-2ND`이면 구체 사유 `PDELTA_SECOND_ORDER_REQUIRED`를 보존하고, 그 외 Legacy 결과는 기존대로 comparison-only 및 설계 차단 상태를 유지한다.
- 테스트는 모델 설정이 Direct인 상태에서 명시적으로 Legacy를 요청해 실제 routed method와 차단 사유를 확인한다.

### 2. Bounded screening bypass

발견: 대규모 실행의 bounded 결과 저장 경로는 조합별 `disp`와 `memberResults`를 비운다. 이 축약본만 최종 P-Delta screening에 넘기면 상세 저장 경로에서 검출되는 `REQUIRE-2ND`를 우회할 수 있었다.

보정:

- 결과 slice와 별도로 screening 전용 `pDeltaScreeningByCombo`를 만든다.
- screening에 필요한 절점 변위와 부재 축력·최대력만 제한적으로 보존하고, 전체 station 결과는 계속 버린다.
- 최종화 시 이 bounded screening 입력을 사용하며 저장 계약에는 `p10-m0-bounded-pdelta-screening-v1`을 기록한다.
- 동일 모델의 detailed/bounded 경로에서 governing θ와 `PDELTA_SECOND_ORDER_REQUIRED` 차단이 일치함을 확인했다.

### 3. Phase 6 late override 및 config=false

발견: `analyzeDynamics()`에서 이미 적용·기록된 RSA scaling 뒤에 Phase 6 trace builder가 `directionMinima`를 다시 받으면 scaling을 이중 적용하거나 늦은 입력으로 교체할 여지가 있었다. 같은 문제로 `rsa.applyBaseShearScaling=false`가 후속 trace 단계에서 다시 켜질 수 있었다.

보정:

- RSA 결과에 embedded `baseShearScaling`이 있으면 이를 canonical 적용 기록으로 유지한다.
- embedded 기록과 late scaling 입력이 함께 오면 후자를 적용하지 않고 `RSA_SCALING_OVERRIDE_CONFLICT` 및 `override.applied=false`를 남긴다.
- 층 결과 전파는 계산값 `scaleFactor`가 아니라 실제 적용값 `appliedScaleFactor`를 우선한다.
- config가 `false`이면 계산 scale이 2 이상이어도 실제 적용값은 1이고, Phase 6 late override도 이를 변경하지 못한다.

### 4. 파생값 provenance

발견: 원시 RSA 변위·관성력·부재력에는 scaling provenance가 있었지만, 그 값들로 다시 계산한 층 magnitude와 alias에는 개별 `beforeValue`가 충분하지 않았다.

보정:

- 층전단의 `storyShearX/Y/Z`, `storyShear`, `storyTorsionMz`, `torsionMz`에 파생 전 값을 기록한다.
- 전도모멘트 magnitude `overturning`과 drift 한계비 `demandToLimit`에도 `{scaled, scaleFactor, beforeValue}`를 기록한다.
- 원시 modal contributor는 진단 원본으로 유지하고, 최종 combined/member/story 응답만 적용 배율을 갖게 했다.

### 5. Null 처리와 qualification

발견: 응답을 복구할 수 없는 경우의 `null`이 숫자 0으로 정규화되면 “실제 0 응답”과 “값 없음”을 구분할 수 없다. 또한 양의 `V_min`에 대해 RSA base shear가 0이면 무한 scaling 상황을 설계 적격으로 오해하면 안 된다.

보정:

- 값 없음은 `scaleFactor:null`, `appliedBaseShear:null`로 보존한다.
- 양의 최소전단력과 0 RSA 응답의 조합은 `ZERO_RSA_BASE_SHEAR_CANNOT_BE_SCALED_TO_POSITIVE_MINIMUM`으로 fail-closed 처리한다.
- scaling blocker를 RSA `designBlocked`, `designBlockers`, `designTransferQualification.eligible=false`까지 전파한다.
- 이 변경은 Phase 9의 기존 compute qualification을 상향하지 않으며, 자동 GPU routing이나 설계 전용 자격도 새로 부여하지 않는다.

### 6. Live evidence hash와 versioning

발견: 고정된 예시 해시·계산값만 가진 artifact는 현재 구현과 분리된 채 stale 상태로 남을 수 있다.

보정:

- focused test가 현재 fixture에서 `modelHash()`와 계산 결과를 다시 만들고 committed evidence의 각 record와 대조한다.
- record 집합을 정확히 고정해 누락·불명 case를 모두 차단한다. 현재 artifact는 θ 경계/Legacy/적격성, 실제 라우팅, bounded parity, RSA 전체 응답, 단일기둥 해석 기준, 무최소값 회귀, config-off의 9개 case를 포함한다.
- record별 solver version을 `p10-m0-pdelta-design-summary-v1`, `p10-m0-bounded-pdelta-screening-v1`, `p10-m0-rsa-base-shear-scale-application-v1`에 결속했다.
- 단일기둥 해석 기준은 base shear 10과 변위 0.13333333333333333에 대해 최대 상대오차 `1.7763568394002506e-16`을 기록한다.

### 7. Regression baseline sync

발견: additive Phase 9/10 변경 뒤 일부 이전 Phase 테스트가 현재 runtime version, 비동기 제품 실행 시점, 파일/runner inventory가 아니라 과거 snapshot을 기대했다. 이는 수치 회귀가 아니라 baseline metadata와 실행 계약의 drift였다.

보정:

- Phase 7 M11 UI 회귀는 현재 비동기 product analysis 완료를 기다린 뒤 화면·결과 상태를 판정한다.
- Phase 8 historical artifact가 기록한 당시 버전과 현재 runtime 버전을 구분한다. 예를 들어 P8-M4 artifact의 assembler v3 기록은 보존하고 현재 export v4를 별도로 확인한다.
- Phase 8 Agent manifest 기대값은 현재 Phase 9 M10 manifest v16 및 workflow v2와 맞췄다.
- Phase 9 architecture 검사는 additive 파일 수의 고정값 대신 현재 트리를 순회하면서 dependency direction과 facade ownership 불변조건을 검사한다.
- Phase 3 runner/feature catalog와 Phase 9 baseline의 기대 inventory·hash는 현재 소스에 맞게 동기화했다.
- 이 동기화 과정에서 P10-M0 수치 허용오차를 넓히거나 설계 차단 assertion을 제거하지 않았다.

## Focused verification

| 명령 | 결과 | 확인 범위 |
| --- | --- | --- |
| `node tests/p10-m0-quick-corrections.mjs` | PASS | θ 6경계, 라우팅·차단, bounded parity, RSA 전 응답·파생 provenance, null/qualification, live evidence |
| `npm run test:p10 -- M0` | PASS | Phase 10 runner의 P10-M0 검색·실행 계약 |
| `node tests/p9-m3-elastic-runtime.mjs` | PASS | 기존 elastic product runtime, bounded 결과 및 물리 결과 계약 |
| `node tests/p6-rsa-diaphragm-story.mjs` | PASS | 기존 RSA·층응답·다이어프램 trace 회귀 |
| `node tools/run-phase9-tests.mjs --from=M2` | PASS | P9-M2~M10 전체 runner |

추가로 Phase 7 M11의 analysis UI/result popup/setup workflow 관련 focused tests와 Phase 8 M0~M11 runner가 PASS한 것을 확인했다.

## 전체 회귀 상태

- `npm.cmd test`: **PASS — 종료 코드 0**
- repository-wide PASS: 확인
- P10-M0 milestone complete: 확인

## 잔여 위험과 비범위

- `analysisSettings.rsa.minimumBaseShear` 값은 기준·프로젝트 입력이다. P10-M0는 이를 자동 산정하거나 특정 KDS 정책으로 확정하지 않는다.
- focused 단일기둥과 bounded fixture는 적용 경로의 정확성을 검증하지만, 대규모 모델 성능·외부 상용해 비교·하드웨어 qualification을 대체하지 않는다.
- 전체 회귀에서 이전 Phase 소비자의 `statusLegacy` 및 신규 scaling provenance 호환성을 확인했다.
