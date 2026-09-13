# Phase 11 Risk Register

```yaml
version: p11-risk-register-v1
status: qualified-with-declared-engineering-limitation
reviewed_at: 2026-07-23
```

## 1. 평가 규칙

- 영향: `Critical`, `High`, `Medium`, `Low`
- 가능성: `High`, `Medium`, `Low`
- Critical 또는 High risk의 완화 gate가 없으면 해당 release를 차단한다.

## 2. 위험 목록

| ID | 영향 | 가능성 | 위험 | 완화 | Gate |
| --- | --- | --- | --- | --- | --- |
| P11-R01 | Critical | Medium | 보고서 PASS가 공학적 검증 완료로 오인 | 4축 verdict, 독립검증 없음→최대 CONDITIONAL_PASS | M1, M5, M9 |
| P11-R02 | High | Medium | ko/en이 서로 다른 데이터 또는 조합 사용 | 불변 snapshot, numeric/hash parity | M1~M2 |
| P11-R03 | High | Medium | screenshot이 stale model/result를 표시 | CaptureSpec과 model/result hash 결속 | M3~M4 |
| P11-R04 | High | Medium | animation·camera·viewport로 capture 비결정 | capture profile, frame/font readiness, visual diff | M3, M8 |
| P11-R05 | High | Medium | 빈 canvas 또는 overlay 누락을 정상 이미지로 발행 | blank/content/layer 검사, required scene fail-closed | M3~M4 |
| P11-R06 | High | Medium | Korean font tofu·검색 불가 | font probe, PDF text extraction, full-page raster | M2, M6, M8 |
| P11-R07 | High | Medium | local path·사용자명·token이 PDF에 노출 | static sanitize, secret/path scan, no browser header | M6, M8 |
| P11-R08 | High | Low | Electron IPC가 임의 경로/콘텐츠 실행면 제공 | isolated preload, allowlist IPC, canonical path | M6 |
| P11-R09 | Medium | High | 7개 PNG로 PDF 크기·메모리 급증 | profile별 해상도/압축 budget, resource cleanup | M6, M8 |
| P11-R10 | High | Medium | 한 locale 실패 후 partial pair를 성공 표시 | temp output, atomic pair publish, manifest state | M6 |
| P11-R11 | Medium | Medium | report refactor가 기존 계산 수치를 변경 | language-neutral snapshot adapter, full numeric regression | M1~M9 |
| P11-R12 | Medium | Medium | UI·Agent·CLI가 다른 renderer/export 경로 사용 | 단일 service와 plan/artifact hash parity | M6~M7 |
| P11-R13 | Medium | Medium | visual golden이 환경 차이로 과민 | pinned profile, semantic + pixel gate 분리 | M8 |
| P11-R14 | High | Low | disk full/permission/cancel에서 orphan window/temp 남음 | failure injection, resource ledger, cleanup gate | M6, M8 |
| P11-R15 | Medium | Medium | raw PNG/PDF가 저장소를 비대화 | retention policy, tracked summary/hash 분리 | M0, M9 |
| P11-R16 | High | Medium | Phase 10 blocker가 보고서에서 숨겨짐 | eligibility snapshot, 표지/본문 limitation consistency | M1, M5, M9 |

## 3. Critical stop conditions

- 독립검증 없음인데 overall `PASS`
- snapshot/evidence hash 불일치인데 PDF 발행
- 필수 scene 누락을 숨기고 pair complete
- secret/local path leak
- Electron renderer에 Node/shell 권한 노출
- 한쪽 PDF만 존재하는데 manifest `complete`
- open Critical/High review finding

발생 시 다음 기능 마일스톤을 진행하지 않고 원인·회귀·evidence를 먼저 수정한다.

## 4. Architecture decision trigger

다음 변경은 ADR와 사용자 승인이 필요하다.

- 별도 데이터 builder로 locale별 보고서 구현
- runtime Playwright 또는 외부 screenshot service 도입
- 신규 PDF engine/font package/runtime dependency
- PDF/A, 전자서명, cloud upload
- verdict 우선순위 또는 독립검증 gate 완화
- 필수 7개 scene 축소
- 성능·메모리·파일크기 budget 완화

## 5. 최종 수용기준

- Critical/High open risk 0
- Medium risk에 owner·monitor·fallback 존재
- final release manifest가 risk gate 결과 hash를 포함
- 알려진 잔여 위험이 한국어·영어 보고서에 동일하게 노출

M9 결과: 보고서 기능의 Critical/High open risk는 0이며 위 수용기준을 통과했다. 독립 정답
부재와 Phase 10 외부 교차검증은 숨기지 않고 양 언어 보고서의 `CONDITIONAL_PASS` 제한으로
유지한다.
