# WP-05 — 일반 MPC · rigid link · master-slave

```yaml
wp: WP-05
milestone: P10-M5
formulas: FORMULAS_AND_CRITERIA.md §5
depends: [WP-00, WP-01]
```

## 배경 (기존 자산)

- **신규 구속 엔진 금지.** P8-M1 `u = Tq + u_bar` 계약(`solver/domain/constraintSystem.js`·`supportConstraints.js`)과
  다이어프램 축약(`diaphragm*`)이 이미 T-변환 인프라다. MPC는 이 T에 **행을 추가**하는 작업이다.
- 모달 다이어프램 변환(`dynamics/modalDiaphragm.js`)이 M·K 동시 축약 전례 — MPC도 동일하게 M·KG까지 변환.

## 작업

1. 스키마: `model.constraints[] = { type:'mpc'|'rigidLink'|'masterSlave', slave:{node,dof}, terms:[{node,dof,c}], d, … }` additive.
2. T-행 결합: MPC/rigidLink/masterSlave → 통합 T 조립. 다이어프램도 내부적으로 동일 표현으로 정규화(외부 API 불변).
3. 충돌 검출: SLAVE_REDEFINED / CYCLE / SUPPORT_CONFLICT 에러코드 + 위치.
4. K·F·M·KG 일관 변환: 정적·모달·P-Delta·좌굴 전 경로. 반력 복원 시 구속력 회수.
5. compute: reduced 패턴이 T 반영 — domainBinary·sparse 패턴 갱신, CPU↔backend 일치.

## 게이트

- CN-M01(rigid link 등가 <1e-10) · CN-M02(평형감사) · CN-M03(**다이어프램 회귀 <1e-10** — 내부 통일 검증) · CN-M04(충돌 3코드).
- 기존 다이어프램 전체 스위트 green. 테스트: `tests/p10-m5-mpc-rigidlink.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
