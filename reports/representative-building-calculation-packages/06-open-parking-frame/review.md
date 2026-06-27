# Open parking frame

## Model

- Type: parking
- Description: Five-story open parking structure with repetitive long bays.
- Nodes/members/loads: 72 / 145 / 410
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.013552
- Max utilization: 1.04496
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.00254 | 0.234884 | 3.729e-15 |
| KDS-ST-02 | OK | 0.003445 | 0.337138 | 5.028e-16 |
| KDS-ST-04-WX-P | OK | 0.003545 | 0.329501 | 5.984e-16 |
| KDS-ST-04-WX-N | OK | 0.003545 | 0.329501 | 5.923e-16 |
| KDS-ST-04-WY-P | OK | 0.004395 | 0.356407 | 3.948e-16 |
| KDS-ST-04-WY-N | OK | 0.004395 | 0.356407 | 3.948e-16 |
| KDS-ST-05-EX-P | OK | 0.012531 | 0.505132 | 3.837e-15 |
| KDS-ST-05-EX-N | OK | 0.012531 | 0.505132 | 3.837e-15 |
| KDS-ST-05-EY-P | OK | 0.013552 | 0.517931 | 1.098e-15 |
| KDS-ST-05-EY-N | OK | 0.013552 | 0.517931 | 1.086e-15 |
| KDS-ST-06-WX-P | OK | 0.002627 | 0.194928 | 1.497e-15 |
| KDS-ST-06-WX-N | OK | 0.002627 | 0.194928 | 1.497e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M55 | NG | 1.04496 | steel-deflection | KDS-ST-05-EY-N |
| 2 | M54 | NG | 1.04496 | steel-deflection | KDS-ST-05-EY-P |
| 3 | M59 | NG | 1.041896 | steel-deflection | KDS-ST-05-EX-N |
| 4 | M51 | NG | 1.041896 | steel-deflection | KDS-ST-05-EX-N |
| 5 | M58 | NG | 1.041896 | steel-deflection | KDS-ST-05-EX-P |
| 6 | M50 | NG | 1.041896 | steel-deflection | KDS-ST-05-EX-P |
| 7 | M56 | NG | 1.039532 | steel-deflection | KDS-ST-05-EY-N |
| 8 | M53 | NG | 1.039532 | steel-deflection | KDS-ST-05-EY-N |
| 9 | M60 | NG | 1.038463 | steel-deflection | KDS-ST-05-EY-P |
| 10 | M52 | NG | 1.038463 | steel-deflection | KDS-ST-05-EY-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
