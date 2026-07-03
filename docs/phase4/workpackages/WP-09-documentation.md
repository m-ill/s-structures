# WP-09 사용자 문서/온보딩

stage: R / milestone: P4-M9 / tickets: P4-T46~T49 / 크기: M~L
status: not-started
선행: WP-07 완료 (최종 UI 기준 작성). 구조 설계·목차·한계 문구는 조기 착수 가능.

## Objective

`../DOCUMENTATION_PLAN.md`의 목표 구조를 실현한다 — 문서만 보고 신규 사용자가 30분 내 도면→계산서에 도달.

## Work Breakdown

### Step 1. 커버리지 맵 (T46 착수)
1. `docs/phase4/DOCUMENTATION_COVERAGE.md` 작업표: 행 = 리본 메뉴 전 항목 + agent 44 액션, 열 = 담당 문서/섹션. 빈칸이 작업 목록이 된다.
2. STATUS_AND_LIMITS를 완성도 감사 출력과 대조해 초안 갱신 (Stage V 결과 반영).

### Step 2. 본문 집필 (T46)
DOCUMENTATION_PLAN의 12문서 구조대로. 규칙: 실제 화면으로 절차를 실행하며 작성, 스크린샷은 `docs/user-manual/img/` (프리뷰로 캡처), 결과 신뢰 근거는 verification 문서 링크.

작성 순서 (사용 빈도순): 01 시작하기 → 02 모델링/해석 → 03 하중/설계/계산서 → 04 도면 import → 08 협업 → 06 재료 → 05 점군 → 07 비선형 → 00 설치(WP-08 산출물 기준).

### Step 3. 튜토리얼 (T47)
T1 도면→계산서 / T2 점군→현황모델 / T3 pushover. 각각 샘플 파일 내장 + 단계별 캡처. **신규 사용자 검증**: 제3자(또는 오너) 1인이 문서만으로 완주 — 관찰 기록을 문서 결함 목록으로 환류, 수정 후 재검증.

### Step 4. 온보딩 샘플 (T48)
라멘/벽식/철골 샘플 3종을 앱 시작 화면 원클릭 로드로. 튜토리얼과 1:1. `tests/p4-onboarding-samples.mjs` (로드→validation→해석 ok).

### Step 5. agent 계약 동기 (T49)
`tools/check-agent-contract.mjs`: capability manifest ↔ agent-contract.json diff 0 검사 → 테스트化. AI_AGENT_GUIDE 개정.

## Deliverables

user-manual 12문서 + img/ / 튜토리얼 3편 + 샘플 3종 / 커버리지 맵 100% / contract diff 테스트.

## Acceptance Criteria

1. 커버리지 맵 빈칸 0.
2. 신규 사용자 30분 시나리오 통과 기록 (T1 기준).
3. `tests/p4-onboarding-samples.mjs`·contract diff 테스트 green.
4. STATUS_AND_LIMITS가 최종 감사 상태와 일치 (문구 대조 테스트 권장).

## Verification Procedure

`npm test` + 30분 시나리오 기록 + 커버리지 맵 리뷰.

## Risks & Rollback

UI가 이후 변경되면 캡처 재작업 — WP-07 완료 후 착수 원칙으로 완화. 신규 사용자 미확보 시 오너 검증으로 대체 명기.

## Result

(완료 시 기입)
