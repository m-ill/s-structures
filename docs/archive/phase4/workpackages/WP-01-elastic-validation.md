# WP-01 탄성해석 실증

stage: V / milestone: P4-M1 / tickets: P4-T01~T06 / 크기: L
status: not-started

## Objective

P3-M10~M13(재료/탄성 확장/벽체/하중 v2·동적)을 preliminary에서 proven으로 승격한다. 방법은 코드 수정이 아니라 **독립 출처 기준값과의 대조 증빙**이다 (`../VALIDATION_PLAN.md`의 E1/E3).

## Scope

**In**: 기준값 문서 작성, 대조 테스트 추가, 오차 초과 시 원인 규명(버그면 수정), 완성도 감사 승격.
**Out**: 신규 해석 기능, 쉘 요소 고도화(발견 결함은 TD 등재만), UI 변경.

## Preconditions

1. full suite green 상태에서 시작.
2. 상용 대조(E3)용 오너 입력물 요청 발송 완료 (`VALIDATION_PLAN.md` Owner Inputs) — 미도착 시 문헌 예제로 선진행.

## Work Breakdown

### Step 1. 검증 케이스 목록 확정 (T01 착수)
1. `verification/specs/ELASTIC_EXPANSION_VALIDATION.md` 생성 — VALIDATION_PLAN의 케이스 그룹 표를 케이스 ID(EV-01…)로 전개.
2. 케이스별 열: ID / 대상 기능 / 기준 출처(서지) / 입력 / 기준값 / tolerance / 테스트 파일·케이스명.
3. 기존 관련 테스트(`tests/p3-m11-elastic-expansion.mjs` 등)의 기준값 출처를 역추적 — 자체 생성값이면 케이스를 독립 출처로 교체.

### Step 2. 요소/경계/하중 실증 (T01)
1. 스프링 지지보 3케이스: 교과서 해석해 (처짐·반력) — 수계산 과정을 문서에 전개.
2. 지점 침하: 부정정보 침하 반력 해석해 1케이스.
3. X-brace 인장전담: 활성/비활성 상태별 손계산 평형 3케이스 + 경계(영강성 근접, 부호 반전, 반복 진동) 5케이스 → `tests/p4-elastic-active-state.mjs` (T05).
4. offset/강역: clear span 모멘트 수계산, offset 0↔0.3m 비교 2케이스.
5. 부분/사다리꼴/부재모멘트/온도: FEF 공식 4케이스 (Roark 또는 구조역학 교재 인용).

### Step 3. 벽체/슬래브 실증 (T02)
1. 캔틸레버 전단벽 횡변위: 휨+전단 변형 해석해 대조.
2. coupled wall: 문헌 예제 1건 (연결보 강성비에 따른 분담) — mid-pier 모델 한계를 오차와 함께 정직하게 기록.
3. 쉘: patch test 통과 재확인 + Timoshenko 단순지지 판 처짐 계수 대조. 미달 항목은 TD 등재 후 limitation 유지 여부를 오너와 결정.

### Step 4. 동적/좌굴/THA 실증 (T03)
1. CQC: 근접 모드 문헌 예제 (SRSS 대비 차이가 유의한 케이스) 1건.
2. 좌굴: Euler ±2% 재확인 + portal sway 모드 형상 검증.
3. 선형 THA: 1자유도 정해 + El Centro 응답스펙트럼 재현 오차 기록.
4. 질량 소스: 층질량 집계가 story mass 계약과 단일 소스임을 교차 검증.

### Step 5. 상용 SW 대조 (T04)
1. 대표 3모델(라멘/벽식/철골) 정의 — 기존 대표건물에서 선정, 모델링 가정 대조표(경계/강역/질량/조합) 먼저 작성.
2. 오너 제공 상용 결과 도착 시: 절점변위/반력/부재력 CSV 대조 스크립트(`tools/compare-crosscheck.mjs` 신규) → `verification/evidence/validation/elastic-crosscheck/`.
3. ±3% 초과 항목은 가정 차이 규명 문서화 → 해소 불가 시 버그로 TD 등재.
4. 미도착 시: 문헌의 완전 풀이 예제(프레임 해석 교재)로 대체하고 대체 사실 명기.

### Step 6. 승격 (T06)
1. `src/platform/phase3CompletionAuditReview.js` M10~M13 proven 전환 — 마일스톤당 1커밋.
2. 해당 review 계약의 한계 문구 갱신, evidence register에 증빙 경로 등록.
3. ROADMAP Progress 갱신.

## Deliverables

| 산출물 | 위치 |
| --- | --- |
| 검증 문서 (케이스 전개+수계산) | `verification/specs/ELASTIC_EXPANSION_VALIDATION.md` |
| 신규 테스트 | `tests/p4-elastic-validation.mjs`, `tests/p4-elastic-active-state.mjs` |
| 상용 대조 산출물 | `verification/evidence/validation/elastic-crosscheck/` |
| 승격 커밋 4건 | git |

## Acceptance Criteria

1. 검증 문서의 모든 케이스가 출처를 가진다 (자체 생성값 0).
2. 신규 테스트 green + full suite green.
3. 완성도 감사에서 M10~M13 = proven.
4. E3 대조 3모델 완료 또는 대체 사유 명기.

## Verification Procedure

`npm test` + `node tests/p4-elastic-validation.mjs` + 완성도 감사 테스트. 문서 리뷰: 케이스 표에서 무작위 2건을 골라 수계산 재현 가능한지 확인.

## Risks & Rollback

R2(상용 대조 오차 규명 난항) — 가정 대조표 선행으로 완화. 버그 발견 시 수정은 별도 커밋으로 분리, 기준값 변경 커밋과 섞지 않는다.

## Result

(완료 시 기입: 완료일 / 케이스 수 / 발견 버그 / 증빙 링크)
