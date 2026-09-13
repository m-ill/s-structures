# WP-08 — Warping torsion · LTB

```yaml
wp: WP-08
milestone: P10-M8
formulas: FORMULAS_AND_CRITERIA.md §8
depends: [WP-02, ADR-001]
gate: ADR-001 accepted — 옵션 B 설계 검토 계층
```

## 배경 (기존 자산)

- Cw는 단면 스냅샷(`sectionSnapshot`)에 이미 저장·전파된다 — 소비자만 없다.
- ADR-001은 옵션 B(설계식 M_cr 검토)를 accepted로 결정했다. **B는 M8 완료, A는 별도 승인 후속 범위**다.

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
| 2026-07-22 | ADR-001 결정 필요 | 오너의 M8 진행 요청으로 권고 옵션 B 승인 기록, 7DOF 확장 제외 | closed |
| 2026-07-22 | Cw 소비자와 LTB 검토값 부재 | 폐형식 M_cr·C1·Lb·지배모멘트·ratio를 steel design/report에 연결 | closed |
| 2026-07-22 | 검토값과 해석결과 혼동 위험 | `design-check-not-analysis-result`, 6DOF 불변 및 limitations 계약 추가 | closed |
| 2026-07-22 | 폐형식·회귀 증거 필요 | EL-W01~03과 evidence contract 및 전체 회귀 수행 | closed |
