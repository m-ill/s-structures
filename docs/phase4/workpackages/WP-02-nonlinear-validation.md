# WP-02 비선형해석 실증

stage: V / milestone: P4-M2 / tickets: P4-T07~T11 / 크기: L
status: not-started

## Objective

P3-M14~M16(기하비선형/힌지·control/fiber·NLTH)을 proven으로 승격한다. 비선형은 사무소 신뢰의 최전선이므로 **원전 서지 명기**와 **수계산 메커니즘 대조**를 요구한다.

## Scope

**In**: B1~B8 출처 감사, 다힌지 수계산, NLTH 실증, pushover 외부 대조, 승격.
**Out**: distributed plasticity, 신규 힌지 모델, 감쇠 모델 확장 (요구 발생 시 out-of-scope 기록).

## Preconditions

WP-01과 독립 — 병렬 착수 가능. full suite green.

## Work Breakdown

### Step 1. 벤치마크 출처 감사 (T07)
1. `docs/verification/NONLINEAR_BENCHMARK_SOURCES.md` 생성.
2. B1~B8 각각: 서지(저자/연도/표·식 번호), 프로그램 입력, 기준값, 현재 tolerance, 실제 측정 오차를 표로.
3. `src/verification/benchmarkGate*.js`에서 기준값이 문헌과 일치하는지 재확인 — 불일치 발견 시 기준 수정 커밋 분리.
4. elastica(B2)는 Mattiasson 표 원값 인용, snap-through(B3)는 해석해 유도 과정 수록.

### Step 2. 다힌지 메커니즘 실증 (T08)
1. 2층 1경간 포탈 케이스 설계: 소성모멘트 Mp 지정, 횡하중 증분.
2. 수계산: 힌지 발생 순서와 각 단계 λ(상계정리/단계별 탄성해석) 손계산 → 문서 수록.
3. 프로그램 pushover의 hinge events 순서·λ와 대조 (`tests/p4-nonlinear-mechanism.mjs`).
4. 순서 불일치 시 힌지 응축/재분배 로직 조사 — 버그면 수정, 모델 차이면 문서화.

### Step 3. NLTH 실증 (T09)
1. 탄성 교차검증: 동일 모델·기록으로 Newmark 직접적분 ↔ modal superposition(T81 구현) 최대응답 ±1%.
2. 탄소성 1자유도: Chopra 교재 예제(구간 해석해 존재) 대조 ±3%.
3. 발산 감지·스텝 분할 동작 테스트 (의도적 대형 스텝).
4. 지진파 scaling trace가 계산서에 표기되는지 재확인.

### Step 4. Pushover 외부 대조 (T10)
1. 문헌의 프레임 pushover 곡선(보편 벤치마크) 1건 재현 — 초기강성/항복점/최대내력 3점 비교.
2. 대표건물 회귀 기준 재고정 (기준 변경 시 사유 문서화).

### Step 5. 승격 (T11)
M14~M16 proven 전환 (마일스톤당 1커밋), evidence register 등록, ROADMAP 갱신.

## Deliverables

`docs/verification/NONLINEAR_BENCHMARK_SOURCES.md` / `tests/p4-nonlinear-mechanism.mjs`, `tests/p4-nlth-validation.mjs` / 승격 커밋 3건.

## Acceptance Criteria

1. B1~B8 전부 원전 서지 보유, gate green.
2. 메커니즘 순서·λ 수계산 일치.
3. NLTH 탄성 ±1%, 탄소성 문헌 ±3%.
4. 완성도 감사 M14~M16 = proven.

## Verification Procedure

`npm test` + 신규 테스트. 문서 리뷰: B3 유도 과정과 T08 수계산의 재현성 확인.

## Risks & Rollback

수계산 자체의 오류 위험 — 유도 과정을 문서에 전개해 검산 가능하게 한다. 프로그램 결함 발견 시 수정 커밋 분리, 기존 B5 회귀 기준은 수정 전후 비교 리포트 필수.

## Result

(완료 시 기입)
