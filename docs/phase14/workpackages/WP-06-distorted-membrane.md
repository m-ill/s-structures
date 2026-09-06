# WP-06 — Distorted Membrane Robustness

## 목적

왜곡된 quad에서 membrane bending/shear가 안정적으로 수렴하고 drilling energy가 응답을 지배하지 않게 한다.

## 작업

1. Cook-type skew mesh family와 midpoint probe
2. distortion metrics·qualification envelope
3. enhanced mode·drilling energy trace
4. reflected/rotated/reversed mesh generator
5. normalized response와 convergence report
6. warning/block/failure reason codes

## 내부 시험

- distortion sweep·positive Jacobian
- regular patch 무회귀
- orientation/reflection/member ordering invariance
- finite-but-wrong/NaN false green 0
- energy/residual/refinement trend

## 후속 qualification

SB3 literature reference. Production code에 normalized expected value를 저장하지 않는다.
