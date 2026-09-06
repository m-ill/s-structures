# WP-10 베타 파일럿·출시

stage: R / milestone: P4-M10~M11 / tickets: P4-T50~T52 / 크기: M
status: not-started
선행: WP-01~09 전부 (마지막 WP)

## Objective

`../BETA_PROGRAM_PLAN.md`의 10 시나리오를 실행해 blocker를 소진하고, `../RELEASE_PLAN.md` L1~L11 게이트로 1.0.0을 출시한다.

## Work Breakdown

### Step 1. 파일럿 준비
1. 참가자 확보 (BETA_PROGRAM_PLAN §Participants — 미확보 시 R6 대응: 오너 대행 + 시나리오 1만 외부 1인).
2. 환경: 데스크톱 인스톨러(WP-08 산출물) + 웹 1식. 리포트 템플릿 배치.

### Step 2. 시나리오 실행 (T50)
1. 10 시나리오 실행 — 프로토콜(관찰만, 15분 룰) 준수.
2. 세션당 `reports/launch-readiness/pilot-##.md` 즉시 작성.
3. blocker 발생 → TD 등재 → 수정 → **해당 시나리오 재실행**. major/minor는 backlog 등재.
4. 종합: `pilot-summary.md` (통계/반영 내역/잔여 판단).

### Step 3. 출시 게이트 (T51)
1. `tests/p4-debt-gate.mjs` 신규: TECH_DEBT_REGISTER 파싱 — P0/P1 open 존재 시 실패.
2. L1~L11 전수 실행: auto는 테스트, manual은 증빙 경로 확인 표 작성 (`reports/launch-readiness/ga-checklist.md`).
3. 완성도 감사 preliminary 0 확인 (미달 시 출시 불가 — 해당 WP로 회귀).

### Step 4. GA (T52)
1. owner 서명 증빙 등록 (P3-M20 evidence register 종결).
2. CHANGELOG 1.0.0 확정, `git tag v1.0.0`, 배포 산출물 재빌드 + SHA256 기록.
3. 출시 후 즉시 항목: 지원 연락 채널 명기, 백업 주기 안내 발송, `RISK_REGISTER` 종결 재평가.

## Deliverables

pilot 리포트 10+summary / ga-checklist / debt-gate 테스트 / v1.0.0 태그 + 산출물.

## Acceptance Criteria

1. 10 시나리오 blocker 0 종료.
2. L1~L11 전 게이트 통과 (증빙 링크 포함).
3. v1.0.0 태그 + 클린 빌드 재현 확인.

## Verification Procedure

`npm test` + ga-checklist 전 행 증빙 존재 확인.

## Risks & Rollback

출시 후 중대 결함 → RELEASE_PLAN rollback 절차 (직전 태그 재배포, 데이터 하위호환 확인). 파일럿 중 대형 결함으로 Stage V/H 회귀 시 ROADMAP Progress에 회귀 기록을 남기고 재게이트.

## Result

(완료 시 기입)
