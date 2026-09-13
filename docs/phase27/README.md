# Phase27 — RC 미구현 기능 완결 (계획 골격)

2026-09-13 · 골격 v1 · **착수 전 · [Phase26](../phase26/README.md) M5 완료가 선행 조건**

Phase25에서 남은 RC 기능 11건을 다룬다. Phase26에서 `DEFERRED`로 등록하고 게이트에서 제외한 항목이 그대로 이 페이즈의 범위다. **부채 정리가 아니라 신규 구현이며, 구조설계 판단이 필요하다.**

## 범위 — 4개 묶음 11건

### P27-M1 · 비틀림 종방향 분배 (2건)
`rc-torsion`이 `TORSION_LONGITUDINAL_DISTRIBUTION_NOT_SATISFIED`로 NG가 되고 `strengthStatus`가 기대 계약을 만족하지 않는다. 비틀림 종방향 철근 소요와 휨 철근의 면적 배분 규칙이 필요하다. `rc-section-strength`의 `torsionReservedArea`·`torsionAllocationFraction`과 한 쌍으로 정의해야 한다.

- 대상: `p25-m3-webmcp-torsion-extension`, `p25-m3-webmcp-torsion-hooks`
- 선행 판단: 적용 기준 조항, 배분 비율의 근거, 폐쇄 스터럽 갈고리 요구

### P27-M2 · 이음 바 매핑 전략 (3건)
후보 탐색이 `SPLICE_BAR_MAPPING_STRATEGY_REQUIRED`로 전부 거부되어 `NO_FEASIBLE_DESIGN`이 된다. 단면·배근이 바뀔 때 **기존 철근과 새 철근을 어떻게 대응시킬지**가 정의되어 있지 않다. 이게 없으면 자동 보완 경로 전체가 결과를 못 낸다.

- 대상: `p25-m4-splice-objects`, `p25-m4-webmcp-rc-splice-solve`, `p25-m6-splice-direct-workflow`
- 선행 판단: 매핑 규칙(위치 기준/면적 기준/층 기준), 이음 위치 제약, 기존 이음 객체 보존 범위
- **가장 파급이 크다.** 이 묶음이 열리면 후보·적용·재해석 경로가 함께 살아난다.

### P27-M3 · 접합 자동 상세와 입력 폐합 (4건)
자동 접합 생성, 기둥 위치 처리, 최소 보수 적용이 필요한 입력을 닫지 못한다.

- 대상: `p25-m5-webmcp-column-position`, `p25-m6-auto-connected-webmcp`, `p25-m6-joint-auto-webmcp`, `p25-m6-rc-closure-inputs`
- 선행 판단: 자동 생성의 허용 범위, 사용자 입력과 자동값의 우선순위

### P27-M4 · 후프 폐합과 경로 간섭 (2건)
- 대상: `p25-m8-hoop-path-collision`, `p25-m8-webmcp-hoop-closure`
- 선행 판단: 폐합 상세 형식, 갈고리 간섭 판정 기준

## 착수 조건

1. Phase26 M5 완료 — 게이트가 phase 16~25를 실행하고, 이 11건이 사유와 함께 제외된 상태.
2. 묶음별 **선행 판단 항목에 오너 결정**이 있어야 한다. 기준 조항과 허용 범위가 정해지지 않은 상태에서 구현하면 다시 재작업이 된다.
3. P27-M2를 먼저 한다. 나머지 묶음이 자동 보완 경로를 공유한다.

## 진행 방식

- 묶음 하나가 끝날 때마다 해당 항목을 Phase26 대장에서 `DEFERRED` → `DONE`으로 옮기고 게이트 제외 목록에서 뺀다.
- 제외 목록이 줄어드는 것이 이 페이즈의 진척도다.
- 구현 전 각 묶음의 기준 조항·적용 범위를 문서로 먼저 고정한다. Phase25가 남긴 교훈이다.

## 경계

이 페이즈가 끝나도 **외부 독립 검증과 설계 적합성은 별개다.** 검사 통과는 계약 충족이지 구조설계 승인이 아니다.
