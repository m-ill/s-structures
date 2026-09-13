# WP-09 — PILOT-OFFICE-01 Acceptance · Release Gate

```yaml
wp: WP-09
milestone: P11-M9
status: qualification-complete
contracts: [office E2E, release manifest, artifact retention]
depends: [WP-08]
```

## 배경

단위·계약 테스트만으로는 실제 모델 생성부터 두 PDF 전달까지의 제품 흐름을 증명할 수 없다.

## 작업

1. clean `PILOT-OFFICE-01` 모델을 제품 경로로 생성.
2. design-basis loads와 28개 조합 생성, 해석·audit 실행.
3. 필수 7 scene capture와 manifest 작성.
4. ko/en HTML·PDF pair와 artifact manifest 생성.
5. 같은 source/profile에서 전체 흐름 3회 반복.
6. numeric·scene selection·snapshot/evidence/artifact hash 비교.
7. 실제 UI와 Agent 경로의 artifact 동일성 검증.
8. full regression, package/install smoke, final code review 수행.
9. risk/debt/manual/API/status 갱신.
10. fail-closed release manifest로 최종 판정.

## 제품 표면

qualification 통과 시 production dual-report action을 기본 경로로 승격한다.

## 게이트

- `P11-E2E-01~12`, `P11-REL-02~14`, 전 Phase 11 필수 verification
- `tests/p11-m9-release-gate.mjs`
- 3회 numeric/scene parity 100%
- required section/figure/verdict/limitation coverage 100%
- 실제 artifact hash 재검증 PASS
- Critical/High 0, owner 없는 debt 0
- 독립 정답 모델 없음→`CONDITIONAL_PASS`

## Evidence

`verification/evidence/validation/phase11/p11-m9-release-gate.json`

## Review Log

2026-07-23 구현 완료:

- clean office model의 45 nodes, 84 members, 240 loads, 6 load cases, 28 combinations를 세 번 독립 해석했다.
- 세 run의 model domain, report snapshot, numeric payload, scene selection, figure manifest와 export plan parity가 100%다.
- 각 run의 ko/en 14쪽 PDF와 artifact manifest를 실제 SHA-256으로 다시 검증했다.
- 선택 release run은 `P11-M9-R03`이며 UI·Agent artifact 계약, package/install smoke, 전체 회귀를 통과했다.
- 보고서 기능은 release-qualified지만 독립 정답 부재 때문에 engineering verdict는 `CONDITIONAL_PASS`다.
