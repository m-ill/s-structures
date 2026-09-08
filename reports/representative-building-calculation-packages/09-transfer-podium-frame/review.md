# Transfer podium frame

## Model

- Type: transfer
- Description: Six-story frame with a two-story podium and narrower upper block.
- Nodes/members/loads: 81 / 158 / 448
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.037282
- Max utilization: 2.651782
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.00528 | 0.410346 | 2.275e-15 |
| KDS-ST-02 | OK | 0.006779 | 0.562732 | 2.471e-15 |
| KDS-ST-04-WX-P | OK | 0.00709 | 0.528824 | 1.646e-15 |
| KDS-ST-04-WX-N | OK | 0.00709 | 0.528824 | 1.783e-15 |
| KDS-ST-04-WY-P | OK | 0.010969 | 0.614383 | 1.509e-15 |
| KDS-ST-04-WY-N | OK | 0.010969 | 0.614383 | 1.234e-15 |
| KDS-ST-05-EX-P | OK | 0.031673 | 0.76776 | 8.076e-15 |
| KDS-ST-05-EX-N | OK | 0.031673 | 0.76776 | 8.093e-15 |
| KDS-ST-05-EY-P | OK | 0.037282 | 0.921051 | 2.520e-15 |
| KDS-ST-05-EY-N | OK | 0.037282 | 0.921051 | 2.538e-15 |
| KDS-ST-06-WX-P | OK | 0.005153 | 0.309013 | 2.275e-15 |
| KDS-ST-06-WX-N | OK | 0.005153 | 0.309013 | 2.148e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M62 | NG | 2.651782 | steel-deflection | KDS-ST-05-EX-N |
| 2 | M59 | NG | 2.643164 | steel-deflection | KDS-ST-05-EX-P |
| 3 | M65 | NG | 2.643164 | steel-deflection | KDS-ST-05-EX-P |
| 4 | M63 | NG | 2.638167 | steel-deflection | KDS-ST-05-EY-N |
| 5 | M61 | NG | 2.638167 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M60 | NG | 2.633177 | steel-deflection | KDS-ST-05-EY-N |
| 7 | M66 | NG | 2.633177 | steel-deflection | KDS-ST-05-EY-P |
| 8 | M58 | NG | 2.633177 | steel-deflection | KDS-ST-05-EY-N |
| 9 | M64 | NG | 2.633177 | steel-deflection | KDS-ST-05-EY-P |
| 10 | M53 | NG | 2.419847 | steel-deflection | KDS-ST-05-EX-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
