# WP-08 — Warping torsion · LTB

```yaml
wp: WP-08
milestone: P10-M8
formulas: FORMULAS_AND_CRITERIA.md §8
depends: [WP-02, ADR-001]
gate: ADR-001 확정 전 착수 금지
```

## 배경 (기존 자산)

- Cw는 단면 스냅샷(`sectionSnapshot`)에 이미 저장·전파된다 — 소비자만 없다.
- ADR-001이 옵션 A(7DOF Vlasov 요소) vs 옵션 B(설계식 M_cr 검토)를 결정한다. 권고안: **B 선행, A 후속**.

## 작업 (옵션 B 기준 — ADR 확정 시 갱신)

1. LTB 검토 모듈: `design/` 계층에 M_cr 산정(§8 식, C1 config `ltb.c1Default`) + 횡지지 길이 입력 스키마.
2. **검토(check) 계층임을 명시** — 해석 결과가 아니라 설계 검토값. UI·보고서에 구분 표기, 해석 DOF 불변.
3. 결과 계약: 부재별 {M_cr, C1, Lb, 지배조합 M_max, ratio} + limitations 문구.
4. (옵션 A 채택 시) 14×14 요소·7DOF 확장은 별도 하위 마일스톤으로 분리하고 domain·compute 계약 영향 재평가.

## 게이트

- EL-W01: 단순보 균일모멘트 M_cr 폐형해 <1e-6, C1 케이스 검증.
- 해석 경로 무영향(전 스위트 green). 테스트: `tests/p10-m8-warping-ltb.mjs`.

## Review Log

| 날짜 | 지적 | 조치 | 상태 |
| --- | --- | --- | --- |
