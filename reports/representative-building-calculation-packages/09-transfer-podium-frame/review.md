# Transfer podium frame

## Model

- Type: transfer
- Description: Six-story frame with a two-story podium and narrower upper block.
- Nodes/members/loads: 81 / 158 / 448
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.038426
- Max utilization: 2.732655
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.005376 | 0.411194 | 5.087e-12 |
| KDS-ST-02 | OK | 0.006892 | 0.563886 | 3.279e-12 |
| KDS-ST-04-WX-P | OK | 0.007245 | 0.529808 | 4.345e-12 |
| KDS-ST-04-WX-N | OK | 0.007245 | 0.529808 | 4.481e-12 |
| KDS-ST-04-WY-P | OK | 0.011267 | 0.614997 | 4.650e-12 |
| KDS-ST-04-WY-N | OK | 0.011267 | 0.614997 | 5.034e-12 |
| KDS-ST-05-EX-P | OK | 0.03269 | 0.768637 | 5.707e-12 |
| KDS-ST-05-EX-N | OK | 0.03269 | 0.768637 | 7.742e-12 |
| KDS-ST-05-EY-P | OK | 0.038426 | 0.920712 | 6.811e-12 |
| KDS-ST-05-EY-N | OK | 0.038426 | 0.920712 | 5.750e-12 |
| KDS-ST-06-WX-P | OK | 0.005292 | 0.309549 | 7.260e-12 |
| KDS-ST-06-WX-N | OK | 0.005292 | 0.309549 | 9.229e-12 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M62 | NG | 2.732655 | steel-deflection | KDS-ST-05-EX-P |
| 2 | M59 | NG | 2.724284 | steel-deflection | KDS-ST-05-EX-P |
| 3 | M65 | NG | 2.724284 | steel-deflection | KDS-ST-05-EX-N |
| 4 | M63 | NG | 2.719214 | steel-deflection | KDS-ST-05-EY-N |
| 5 | M61 | NG | 2.719214 | steel-deflection | KDS-ST-05-EY-P |
| 6 | M60 | NG | 2.714407 | steel-deflection | KDS-ST-05-EY-N |
| 7 | M64 | NG | 2.714407 | steel-deflection | KDS-ST-05-EY-P |
| 8 | M66 | NG | 2.714407 | steel-deflection | KDS-ST-05-EY-P |
| 9 | M58 | NG | 2.714407 | steel-deflection | KDS-ST-05-EY-N |
| 10 | M53 | NG | 2.493741 | steel-deflection | KDS-ST-05-EX-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
