# Phase 6 — 검증 테스트 매트릭스

```yaml
doc: verification-matrix
phase: 6
date: 2026-07-09
principle: 구현량보다 검증표가 중요하다. 아래 테스트는 tests/에 자동화한다.
```

각 케이스는 아래 회귀표 스키마로 결과를 저장한다. tolerance 초과 시 CI fail.

```text
record = {
  caseId, reference, computed, relError, tolerance, modelHash, solverVersion, status
}
```

기존 자산: `src/verification/benchmarkGate*.js`가 B01–B10(요소·조립 일부)을 이미 커버한다. **아래 매트릭스는 그 위에 얹으며, 이미 있는 케이스는 재사용/이관한다.**

## 1. Element-level

| ID | 케이스 | 기존 | 담당 WP |
| --- | --- | --- | --- |
| E01 | cantilever axial | — | WP-03 |
| E02 | cantilever shear | 부분(B03) | WP-03 |
| E03 | cantilever bending | 부분(B03/B04) | WP-03 |
| E04 | cantilever torsion | — | WP-03 |
| E05 | simply supported beam UDL | B02 | WP-02/03 |
| E06 | **fixed-fixed beam UDL** | — | **WP-02** |
| E07 | point load at arbitrary location | B01 | WP-02/03 |
| E08 | **trapezoidal load** | 근사(분할) | **WP-02** |
| E09 | temperature load | — | WP-02 |
| E10 | support settlement | — | WP-02 |
| E11 | member local axis rotation | — | WP-03 |

## 2. Assembly-level

| ID | 케이스 | 기존 | 담당 WP |
| --- | --- | --- | --- |
| A01 | 2D portal frame | — | WP-03 |
| A02 | 3D skew frame | — | WP-03 |
| A03 | rigid diaphragm 1층 모델 | `rigidDiaphragmBenchmark*.js` | WP-03/04 |
| A04 | rigid diaphragm 2층 모델 | 부분 | WP-04 |
| A05 | end release mechanism check | `memberReleaseBenchmark*.js`(B10) | WP-03 |
| A06 | spring support reaction | 부분 | WP-03 |

## 3. Dynamic

| ID | 케이스 | 기존 | 담당 WP |
| --- | --- | --- | --- |
| D01 | 1DOF oscillator | — | WP-04 |
| D02 | 2DOF shear building | — | WP-04 |
| D03 | modal orthogonality | 부분(`modal.js`) | WP-04 |
| D04 | mass participation sum | `elasticCompleteness.js` | WP-04 |
| D05 | RSA one-mode exact match | — | WP-04 |
| D06 | CQC close-mode test | — | WP-04 |
| D07 | (THA 부록) SDOF closed-form | — | 부록 |
| D08 | (THA 부록) harmonic resonance | — | 부록 |

## 4. Stability

| ID | 케이스 | 기존 | 담당 WP |
| --- | --- | --- | --- |
| S01 | Euler pinned-pinned column | `nonlinearBenchmarks.js` 부분 | WP-05 |
| S02 | fixed-free column | — | WP-05 |
| S03 | sway frame buckling | — | WP-05 |
| S04 | P-Delta cantilever column | — | WP-05 |
| S05 | 좌굴 λcr ↔ P-Delta 일관성 | — | WP-05 |

## 5. Shell — 등가모델 검증 (WP-06 옵션 B 확정)

실 shell FEM 미개발이 확정되어 **SH01–SH05(patch/twisted/Scordelis-Lo/pinched)는 비활성(실 FEM 이연)**. 대신 등가모델 신뢰범위 회귀만 자동화한다([FORMULAS §6B](FORMULAS_AND_CRITERIA.md#6-shell--등가모델-scope-wp-06-옵션-b-확정)).

| ID | 케이스 | reference 대비 tolerance | 담당 WP |
| --- | --- | --- | --- |
| EQ01 | 등가모델 global drift | <5~10% | WP-06 |
| EQ02 | 등가모델 층전단 | <5% | WP-06 |
| EQ03 | 등가모델 벽체 base moment | <10% | WP-06 |
| EQ04 | 비허용 결과(slab local stress 등) 미출력 | 존재 시 fail | WP-06 |
| ~~SH01–SH05~~ | ~~실 shell patch/convergence~~ | (실 FEM 이연) | — |

## THA 검증 부록 (preliminary → 승격 시)

`nonlinear/dynamics/newmark.js`·`rayleigh.js`·`groundMotion.js` 기반. 승격 시 필수: SDOF closed-form, free vibration decay, harmonic resonance, 지반가속도 relative/absolute 구분, modal/Rayleigh damping, time step 안정/정확 경고, baseline correction, 단위(g·m/s²·gal) 체크, THA→응답스펙트럼 vs RSA 비교.

## 운영 규칙
- 신규 기능은 매트릭스의 대응 케이스를 **동일 PR에서** 추가한다(구현-only PR 금지).
- reference 값은 폐형해/교과서/공인 벤치마크 출처를 케이스 주석에 명기한다.
- `modelHash`·`solverVersion` 변경 시 회귀 diff를 리뷰에 첨부한다.
- **tolerance는 케이스에 하드코딩하지 않고** config `criteria.tolerance.<계층>`([FORMULAS §3](FORMULAS_AND_CRITERIA.md#3-regression-suite--오차식--tolerance-wp-03))에서 읽는다. 계층별 권장값은 element 1e-9~1e-7 · small frame 1e-7~1e-5 · large frame 1e-5~1e-3 · modal 1e-6~1e-4 · RSA 1e-4~1e-2 · P-Delta 1e-5~1e-3 · 등가모델 5e-2.
