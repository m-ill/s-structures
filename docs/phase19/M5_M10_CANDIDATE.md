# M5~M10 개발 후보와 검토 인계

2026-09-07 · 생산 자격 미취득 · 독립 검토 담당: 사용자(m-ill), 검토 완료/서명 미수령.

## 구현된 제품 경로

WebMCP 36개 도구가 기존 탄성설계 서비스와 production Pushover/NLTH 서비스를 호출한다. 신규 도구는 케이스 preview/apply, 힌지 preview/apply와 페이지 조회, 이력 조회, 실패 설명, pause/resume 9개다. 기존 validate/plan/start/status/result/cancel을 함께 사용한다.

1. `get_project_context`에서 modelHash와 기존 case ID를 얻는다.
2. `preview_nonlinear_case` → `apply_nonlinear_case`로 명시적으로 케이스를 만든다. 조회·preview는 모델을 변경하거나 해석하지 않는다.
3. `preview_nonlinear_assignments` → `get_nonlinear_preview`의 assignments/properties/warnings를 페이지별 검토 → `apply_nonlinear_assignments`로 적용한다. 자동 가정값은 assumed를 유지한다.
4. 새 modelHash로 `validate_analysis` → `plan_analysis` → `start_analysis`를 호출한다. requestId 중복은 재실행하지 않는다.
5. jobId로 상태·이력·실패 원인을 조회한다. 취소 또는 실패한 결과는 성공으로 대체하지 않는다.
6. retry는 원점에서 새 job으로 실행한다. checkpoint는 동일 모델·build의 paused NLTH에 한하며, build 미결속 브라우저는 checkpoint 재개를 차단한다.

임의 코드, 파일 경로, 외부 전송, reviewer 서명 또는 자격 승격 입력은 받지 않는다. 성공도 candidate이며 최종설계 전달은 차단한다. 도구 요청/응답은 64,000/48,000 문자 제한이며 페이지별 조회를 사용한다.

## 수치 변경과 지원 경계

- SH1을 canonical domain → sparse 요소 registry → 실제 WASM Newton 경로에 연결했다. 축방향 탄성 anchor의 해·상태 commit·입력 보존을 시험한다. 임의 local orientation과 SH1 동적 에너지 경로는 지원하지 않는다. NLTH SH1은 전처리와 엔진 양쪽에서 차단한다.
- 실제 8부재/32힌지 모델에서 중력 후 Pushover의 모멘트 평형 실패를 재현했다. 단부 모멘트에서 전단력을 복원할 때 현재 chord 길이를 사용하도록 수정하고 AD 접선에도 반영했다. 평형 허용오차를 완화하지 않았다. 재현 입력과 실행 harness를 공개한다.
- 제품 Pushover는 displacement/arcLength를 지원한다. kernel의 load control을 제품 지원으로 표시하지 않으며 충돌한 설정과 legacy engine을 명시적으로 거부한다.
- Worker WASM 초기화 중 첫 요청 유실을 방지하고, 실행 시간 제한·협력 취소 실패 시 Worker 종료·dispose 후 결과 미발행·동시 실행 제한을 추가했다.

## 마일스톤 판정

| 범위 | 이번 산출물 | 생산 완료까지 남은 조건 |
|---|---|---|
| M5 | 공통 비선형 도구, 엄격한 preflight, SH1 sparse 연결, 자격 resolver | 전체 지원 모델 범위 감사·입력 변경 Undo 동등성 확대 |
| M6 | Pushover/힌지/fiber/PMM 회귀와 8부재 평형 수정 | 외부 전체 응답 경로 비교와 독립 검토 |
| M7 | 실제 Worker MDOF NLTH 호출·이력·에너지 확인, 기존 Newmark/fiber 회귀 | 대표 강재/RC 전체경로 dt/2·dt/4 및 독립 검토 matrix |
| M8 | 취소 강제 종료·시간 제한·재시도·build 차단 | 새로고침 후 job/input/result 복원, 탄성/설계/보고서 공통 자원 제한, M-tier 고정 장비 성능 |
| M9 | 고정 후보 회귀 목록·원본 실패 보존·브라우저 스모크·검토 양식 | 외부 비교 2건·pilot 5건, 전체 필수 matrix·미해결 High 감사 |
| M10 | clean source/runtime preview 패키지와 Windows/Ubuntu CI 구성 | 실제 CI·지원 브라우저·HTTPS 배포 산출물 일치·rollback 검증 |

19A/B/C 모두 이 문서만으로 생산 승인하지 않는다. 기존 21개 비교의 범위와 이번 계약/회귀/스모크를 합산하지 않는다. [검토 자료 접수표](REVIEW_INTAKE.md), [검증 계획](VALIDATION_PLAN.md), [고정 회귀 목록](../../verification/specs/phase19/m5-m10-tests.json)을 함께 사용한다.

## 재현과 배포

추적 파일을 커밋한 뒤 새 출력 디렉터리로 실행한다.

```sh
node tools/run-p19-validation.mjs output/phase19/new-candidate --manifest=verification/specs/phase19/m5-m10-tests.json
```

runner는 해당 커밋을 별도 checkout으로 추출해 실행하고 source ZIP SHA-256, Node/OS, 시험별 원문 로그와 해시를 보존한다. 느린 corotational 전역 시험의 실행 예산은 180초에서 900초로 늘렸다. 이는 수치 허용오차 변경이나 성능 합격이 아니다.

공개는 개발 브랜치/프리뷰로 진행하며 생산 Pages를 자동 승격하지 않는다. 생산 배포 전에 같은 runtime manifest를 CI·HTTPS에서 대조하고, 이전 공개 tag의 산출물 복원 후 smoke를 기록해야 한다. 프리뷰 패키지를 기존 운영 데이터 위에 덮어쓰지 않는다.
