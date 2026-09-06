# Phase 4 Validation Plan — preliminary → proven 실증 방법론

status: active
scope: Stage V (P4-M1~M4), WP-01~WP-04

## Principle

Phase 3 테스트의 공통 한계는 "자체 생성 데이터에 대한 자기 일관성 검증"이다. Phase 4 실증은 **독립 출처 기준값**과의 대조로 정의한다. 기준값 없는 실증은 실증이 아니다.

## Evidence Levels

각 기능은 아래 3레벨 중 요구 레벨 이상의 증빙을 확보해야 proven이 된다.

| Level | 정의 | 예 |
| --- | --- | --- |
| E1 해석해/문헌 | 닫힌형 해, 교과서/논문 표 값과 tolerance 비교 (자동 테스트) | Euler Pcr, elastica 표, 판 처짐 계수 |
| E2 수계산 검증서 | 케이스별 손계산 과정을 문서화하고 그 결과값을 테스트가 참조 | RC 보 휨 As, 기초 접지압 |
| E3 외부 대조 | 상용 SW 결과, 실측 데이터, 실무 도면 등 외부 산출물과 비교 | MIDAS 대조표, 실측 점군, 실제 DWG |

요구 레벨: 해석 코어 = E1+E3(대표 3모델), 설계모듈 = E2(케이스당), import = E3(실데이터), 성능 = 실측 기록.

## Evidence Storage Contract

```text
verification/specs/           # 방법·수계산·출처 (사람이 읽는 근거, git 추적)
  ELASTIC_EXPANSION_VALIDATION.md
  NONLINEAR_BENCHMARK_SOURCES.md
  DESIGN_MODULE_VERIFICATION.md
  IMPORT_FIELD_VALIDATION.md
verification/evidence/validation/ # 생성 산출물 (재생성 가능, 스크립트로 생산)
  elastic-crosscheck/        # 상용 대조 CSV·오차표
  pointcloud-field/          # 실측 점군 리포트
  pointcloud-perf.json       # 성능 실측
  perf-budget.json
```

규칙: (1) verification 문서의 모든 수치는 출처(문헌 서지 또는 계산 과정)를 가진다. (2) 테스트는 verification 문서의 값을 하드코딩 복사하되 주석으로 문서 경로·케이스 ID를 참조한다. (3) evidence register(`getPhase3EvidenceRegister` 계열 계약)에 증빙 경로를 등록해 완성도 감사가 읽게 한다.

## Tolerance Policy

| 대상 | 기본 허용오차 | 비고 |
| --- | --- | --- |
| 정적 변위/반력 (E1) | ±1% | 이산화 무관 항목은 ±0.1% |
| 부재력 (E3 상용 대조) | ±3% | 모델링 가정 차이 문서화 조건 |
| 고유주기 | ±2% | 질량 모델 차이 명기 |
| 비선형 한계점/λ | ±3% | B1~B8 기존 값 유지 |
| 설계 검토값 (E2) | ±1% | 반올림 규칙 명기 |
| 점군 검출 | recall/precision ≥ 0.9 (기둥), 층 elevation ±30mm | 실측은 결측 조건 병기 |

케이스별로 이보다 넓은 오차가 필요하면 사유를 verification 문서에 명기하고 리뷰(오너 확인) 후 적용한다.

## Per-Workstream Case Plan

### WP-01 탄성 (E1 + E3)

| 케이스 그룹 | 기준 출처 | 최소 케이스 |
| --- | --- | --- |
| 스프링 지지/침하 | 구조역학 교과서 (스프링 지지보 처짐/반력) | 3 |
| 트러스/인장전담 | X-brace 수계산 (활성/비활성 상태별 평형) | 3 + 경계 5 |
| offset/강역 | clear span 보 모멘트 수계산, offset 유/무 비교 | 2 |
| 부분/사다리꼴/온도 | FEF 공식 (Roark/구조역학), 구속 축력 | 4 |
| 벽체 mid-pier | 캔틸레버 벽 횡변위 해석해, coupled wall 문헌 | 2 |
| 쉘 | patch test, Timoshenko 판 처짐 계수 | 3 |
| CQC/좌굴/THA | 근접모드 문헌 예제, Euler, El Centro 스펙트럼 | 3 |
| **상용 대조 (E3)** | 라멘/벽식/철골 대표 3모델 — 오너 제공 상용 결과 필요 | 3 |

### WP-02 비선형 (E1 + 문헌)

B1~B8에 원전 서지 추가. 신규: 다힌지 메커니즘(E2), NLTH 탄소성 1자유도(E1, Chopra 예제), 탄성 THA 상호 일치(내부 교차검증 ±1%).

### WP-03 설계 (E2 중심)

케이스 소스: KDS 해설서 예제, 콘크리트구조/강구조 학회 예제집, 대학 교재 풀이. 각 케이스는 (입력 → 조항 → 손계산 → 프로그램 값 → 오차) 5열 표로 기록. **조항 번호가 없는 검토식은 proven 불가.**

### WP-04 Import (E3 중심)

| 항목 | 데이터 확보 계획 |
| --- | --- |
| 실제 DWG | 오너 제공 실무 구조평면 1건 (민감정보 제거본). 부재 시 공개 CAD 샘플로 대체하되 한계 명기 |
| 실측 점군 | 공개 데이터셋 (예: 건물 실내 스캔 공개셋) 1건 + 가능 시 오너 스캔 1건 |
| 성능 | 합성 1e7점 생성기로 실측, CI 2배 여유 규칙 유지 |

## Owner Inputs Required (오너 제공 필요 목록)

실증 중 아래는 개발자가 만들 수 없다. 확보 전까지 해당 케이스는 대체 출처(문헌)로 진행하고 한계를 명기한다.

1. 상용 SW(MIDAS 등) 대조용 결과 파일 3모델 (P4-T04).
2. 실무 DWG 도면 1건 (P4-T17).
3. (선택) 실측 점군 스캔 1건 (P4-T18 — 공개셋으로 대체 가능).
4. 설계 예제집 선택 확정 (P4-T12/13 — 제안 목록을 검토 후 승인).

## Promotion Procedure (proven 전환 절차)

1. 케이스 증빙 완비 → verification 문서 + evidence 산출물 커밋.
2. 해당 review 계약(예: `getPhase3ElasticMilestoneReview`)의 한계 문구 제거/갱신.
3. `phase3CompletionAuditReview.js`의 상태를 proven으로 변경 — **한 마일스톤씩 별도 커밋** (`feat: promote P3-M## to proven`).
4. full suite green 확인. ROADMAP Progress 표 갱신.
