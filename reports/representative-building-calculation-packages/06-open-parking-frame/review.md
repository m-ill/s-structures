# Open parking frame

## Model

- Type: parking
- Description: Five-story open parking structure with repetitive long bays.
- Nodes/members/loads: 72 / 145 / 410
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.013995
- Max utilization: 1.078866
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.0026 | 0.23538 | 4.311e-12 |
| KDS-ST-02 | OK | 0.003519 | 0.337861 | 4.712e-12 |
| KDS-ST-04-WX-P | OK | 0.00364 | 0.329981 | 4.594e-12 |
| KDS-ST-04-WX-N | OK | 0.00364 | 0.329981 | 5.583e-12 |
| KDS-ST-04-WY-P | OK | 0.004521 | 0.35688 | 5.781e-12 |
| KDS-ST-04-WY-N | OK | 0.004521 | 0.35688 | 6.167e-12 |
| KDS-ST-05-EX-P | OK | 0.012958 | 0.505663 | 6.106e-12 |
| KDS-ST-05-EX-N | OK | 0.012958 | 0.505663 | 6.319e-12 |
| KDS-ST-05-EY-P | OK | 0.013995 | 0.51814 | 6.101e-12 |
| KDS-ST-05-EY-N | OK | 0.013995 | 0.51814 | 5.808e-12 |
| KDS-ST-06-WX-P | OK | 0.002708 | 0.195179 | 5.443e-12 |
| KDS-ST-06-WX-N | OK | 0.002708 | 0.195179 | 9.623e-12 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M54 | NG | 1.078866 | steel-deflection | KDS-ST-05-EY-P |
| 2 | M55 | NG | 1.078866 | steel-deflection | KDS-ST-05-EY-N |
| 3 | M58 | NG | 1.075922 | steel-deflection | KDS-ST-05-EX-P |
| 4 | M50 | NG | 1.075922 | steel-deflection | KDS-ST-05-EX-P |
| 5 | M51 | NG | 1.075922 | steel-deflection | KDS-ST-05-EX-N |
| 6 | M59 | NG | 1.075922 | steel-deflection | KDS-ST-05-EX-N |
| 7 | M56 | NG | 1.07358 | steel-deflection | KDS-ST-05-EY-N |
| 8 | M53 | NG | 1.07358 | steel-deflection | KDS-ST-05-EY-N |
| 9 | M52 | NG | 1.072587 | steel-deflection | KDS-ST-05-EY-N |
| 10 | M57 | NG | 1.072587 | steel-deflection | KDS-ST-05-EY-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
