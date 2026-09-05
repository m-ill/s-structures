# Phase 17 Model Equivalence and Reference Policy

```yaml
version: p17-model-reference-policy-v1
reference_precedence: primary-independent-reference-before-cross-solver
post_result_tuning_allowed: false
silent_defaults_allowed: false
```

## 1. 비교 대상의 역할

각 사례는 최소 세 가지 값을 구분한다.

| 값 | 역할 | PASS 판정에서의 지위 |
| --- | --- | --- |
| 독립 기준값 | 이론해, NAFEMS, CSI, ASME 또는 독립 적분·유도 | 가능한 경우 primary oracle |
| STRIX 값 | 공개 보고서 값 또는 실제 STRIX raw export | cross-solver comparison |
| S-Structures 값 | 자체 결정론적 해석엔진의 제품 경로 결과 | 검증 대상 |

MIDAS 값은 동일 모델의 실제 native model과 full-precision raw export가 확보된 뒤 별도 R4 비교열에 추가한다. MIDAS Verification Index 목차만으로는 결과 비교를 완료한 것으로 처리하지 않는다.

STRIX와 S-Structures가 같은 외부 기준값을 각각 잘 맞추는 것이 우선이다. 두 프로그램이 서로 일치하더라도 둘 다 외부 기준을 벗어나면 독립 자격 PASS가 아니다.

## 2. Reference 등급

| 등급 | 예 | 허용 주장 |
| --- | --- | --- |
| R1 | 폐형해·직접 유도·단순 독립 계산 | 절대 수치 verification |
| R2 | NAFEMS·CSI·ASME 등 공인 benchmark 표 | published benchmark qualification |
| R3 | 독립 구현의 full-precision 수치 적분·정련해 | independent numerical qualification |
| R4 | STRIX·MIDAS 등 별도 프로그램 실제 동일 모델 raw export | cross-solver comparison |
| R5 | S-Structures 자체 민감도·회귀·metamorphic test | internal qualification only |

R5는 R1~R4를 대체하지 않는다. 현재 STRIX PDF에 전사된 값은 실제 바이너리 재실행 raw export가 없으면 `published R2/R4-lite`로 표시하고, 실제 R4라고 단정하지 않는다.

## 3. Source lock

각 source manifest에는 다음을 기록한다.

- 문서명, 출전, 저자·기관, edition/revision, engine version
- case ID, page, table, figure, equation과 source URL 또는 로컬 경로
- retrievedAt, MIME, bytes, license/use note와 SHA-256
- 수동 전사, HTML parse, PDF text extraction, OCR 등 추출 방식
- 원문 표기값, 유효숫자, full-precision 여부와 반올림 구간
- 단위변환 원식과 변환 후 값
- 추출자, 독립 검토자, 승인 hash

통합 manual·개별 PDF v1.0.2와 개별 HTML·catalog v1.0.4는 섞어 쓰지 않는다. case별 precedence를 source lock에 명시하고 차이가 있으면 각 판본을 모두 보존한 뒤 용도별 authoritative 판본을 승인한다.

## 4. Model equivalence 표

모든 사례는 다음 항목을 S-Structures, STRIX specification, MIDAS 모델의 열로 비교한다.

1. 단위계와 좌표축
2. node 좌표와 element connectivity
3. element 종류와 정식화
4. 재료와 단면 상수
5. local axis와 강축·약축 routing
6. 지점, release, rigid link, diaphragm, constraint
7. 하중 크기·방향·분포·합력·도심과 자중 기본값
8. 질량 source, 회전관성, lumped/consistent mass
9. 감쇠, spectrum interpolation과 modal combination
10. mesh, integration rule, stabilization과 shear correction
11. P-Delta stage, load step, convergence, hinge regularization
12. output probe, 위치, 성분, 단위와 부호

각 항목은 다음 중 하나로 판정한다.

| 등급 | 의미 |
| --- | --- |
| `IDENTICAL_SPECIFICATION` | 명시된 입력과 정식화가 동일 |
| `ENGINEERING_EQUIVALENT` | 다른 내부 표현이지만 이 사례의 응답에 대해 동등함을 입증 |
| `ANALOGOUS_ONLY` | 유사 시험이나 동일 formulation 주장은 불가 |
| `UNSUPPORTED` | 필수 capability가 없어 동등 모델 실행 불가 |

하나라도 `ANALOGOUS_ONLY`면 공식 동일 사례 PASS가 아니라 `CROSS_CHECK_ONLY`다. 필수 항목이 `UNSUPPORTED`면 `BLOCKED_ENGINE`이다.

## 5. Silent default 금지

다음 기본값은 명시되지 않으면 모델 lock을 허용하지 않는다.

- self-weight on/off
- shear deformation on/off와 shear area/correction
- member offset, rigid end, panel zone
- release와 spring local axis
- diaphragm/constraint 방식
- mass source, rotational mass, consistent/lumped mass
- modal normalization, mode count, rigid-mode 제거
- damping ratio와 Rayleigh/modal damping 정의
- P-Delta sign, stage carry-over와 first-order seed
- hinge regularization, tangent, unloading과 rollback
- shell drilling/stabilization parameter
- spectrum extrapolation/interpolation과 directional rule

## 6. Reference·probe·tolerance 사전동결

다음 순서를 바꾸지 않는다.

```text
source approval
  -> reference extraction approval
  -> probe and sign approval
  -> tolerance approval
  -> model mapping approval
  -> hash freeze
  -> S-Structures run
```

결과를 본 뒤 reference, probe, tolerance, mesh 또는 모델 옵션을 바꾸면 이전 run은 자동 `INVALIDATED`다. 수정 이유와 이전/신규 hash를 discrepancy에 기록하고 새 run ID를 발급한다.

허용오차는 다음을 넘어서 엄격한 척하지 않는다.

- source가 제공하는 유효숫자와 반올림 구간
- benchmark 원문의 tolerance
- discretization·integration·iterative solve의 승인된 numerical floor

반대로 느슨한 source tolerance 안에 들어왔다는 이유만으로 평형, 에너지, 모드 residual 또는 수렴 gate를 생략하지 않는다.

## 7. 가족별 필수 동등성 확인

| 계열 | 추가 확인 |
| --- | --- |
| 보·골조·트러스 | 강축/약축, release, axial/shear 포함 여부, consistent load, 부호 |
| 막·판·셸 | plane stress, 두께, integration, mesh lineage, hard/soft support, drilling/stabilization |
| Winkler | 지반계수 단위, 폭 적용, consistent foundation matrix, end/station recovery |
| 모달 | mass matrix, rotational inertia, constraint condensation, normalization, mode matching |
| 응답스펙트럼 | spectrum curve hash, damping, interpolation, modal/directional combination, force recovery |
| P-Delta | axial-force sign, stage state, tangent, work balance, load-step 수렴 |
| 푸시오버·힌지 | backbone, state variables, tangent, unload/reload, control method, regularization |
| 시간이력 | ground motion sample hash, dt, interpolation, damping, initial state와 integrator parameters |

## 8. 성능 비교 동등성

성능은 정확도와 별도다. 다음이 모두 같을 때만 프로그램 간 속도를 비교한다.

- hardware, OS, power profile, thread/core 정책
- 모델, mesh, DOF, 정식화, precision
- solver tolerance, convergence, mode count, output request
- 파일 import·UI 시작 포함 여부
- cold/warm 정의와 warm-up 제외 규칙

정확도 gate를 먼저 통과한 사례만 10회 이상 측정해 median, p95와 peak RSS를 기록한다. 동일 조건이 아니면 S-Structures 내부 측정값만 보고하고 STRIX·MIDAS보다 빠르다는 주장을 하지 않는다.
