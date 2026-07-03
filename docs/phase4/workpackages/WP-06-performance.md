# WP-06 성능/규모 실증

stage: H / milestone: P4-M6 / tickets: P4-T29~T32 / 크기: M
status: not-started

## Objective

성능 예산 6종을 실측·게이트화하고, 확인된 I/O 낭비(TD-08, TD-15)를 해소하며, 대형 모델 한계를 정직하게 문서화한다.

## Scope

**In**: 계측 인프라, 예산 게이트, 서버 I/O 정리, 대형 모델 실측.
**Out**: 알고리즘 차원의 최적화(솔버 교체 등 — 미달 시 별도 결정), UI 렌더 최적화(WP-07 결과에 따라).

## Work Breakdown

### Step 1. 계측 인프라 (T31 착수)
1. `tools/measure-perf.mjs` 신규: 예산 6종(점군 1e7 로드 / 뷰어 2e6 프레임타임 / 대표건물 탄성 조합군 / pushover 방향당 / NLTH 20초 기록 / 일람표 생성)을 각각 3회 실행, 중앙값을 `reports/validation-evidence/perf-budget.json`에 기록 (머신 사양 병기).
2. 뷰어 fps는 node 측정 불가 — 브라우저 프리뷰에서 frame time 로그로 수집하는 절차 문서화 + 수동 증빙.
3. `tests/p4-perf-budget.mjs`: perf-budget.json을 읽어 예산 대비 판정 (CI 여유 2배 규칙).

### Step 2. 서버 I/O 정리 (T29, T30)
1. TD-08: handleApi의 auth 단계(WP-05 Step 1 이후)에서 로드한 project meta를 `req.project`로 핸들러에 전달 — store 변이 메서드는 meta 전달 오버로드 추가(재읽기 생략). 요청당 project.json 읽기 1회를 계측 테스트로 확인 (readJson 호출 카운터 주입).
2. TD-15: 독립 await 지점 3곳(member PUT의 user 조회, approval의 listRevisions, saveRevision의 get+listRevisions) Promise.all 전환.
3. 회귀: p3-server-api / p3-auth 무수정 green.

### Step 3. 대형 모델 실측 (T32)
1. 생성기: 대표건물 파라메트릭 확장으로 부재 500/1,000/2,000/4,000 모델 4종 생성.
2. 각: 탄성 조합군 해석 시간, 조립·분해 구간 분리 계측, 메모리 피크 → 스케일링 곡선 기록.
3. 실용 한계(권장 최대 규모)를 산정해 `docs/user-manual/STATUS_AND_LIMITS.md` 초안 문구 작성 (반영은 WP-09).
4. 병목이 명백하고 저비용 개선(예: 밴드 최소화, TypedArray 전환 일부)이면 TD 등재 후 오너 승인 하에 수행 — 대개는 기록만.

### Step 4. 마감
perf-budget 게이트를 launch gate 목록에 연결 (L4). TD-08/15 fixed 처리.

## Deliverables

`tools/measure-perf.mjs` / `reports/validation-evidence/perf-budget.json` / `tests/p4-perf-budget.mjs` / 스케일링 리포트 / TD 2건 fixed.

## Acceptance Criteria

1. 예산 6종 실측값 기록 + 게이트 테스트 green (미달 항목은 오너 결정 기록 없이는 완료 불가).
2. 요청당 project.json 1회 읽기 계측 통과.
3. 4,000부재 실측 기록과 권장 한계 문구 존재.

## Verification Procedure

`node tools/measure-perf.mjs && npm test`. 뷰어 fps는 프리뷰 세션 스크린샷 증빙.

## Risks & Rollback

예산 미달 발견 시: 이 WP에서 무리하게 최적화하지 않고 (범위 밖) 미달 사실·원인 추정·선택지를 오너에게 보고 — 예산 조정 또는 최적화 티켓 신설은 오너 결정.

## Result

(완료 시 기입)
