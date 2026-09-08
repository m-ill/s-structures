# Torsion irregular corner frame

## Model

- Type: irregular
- Description: Five-story frame with a missing corner and offset stiffness distribution.
- Nodes/members/loads: 88 / 179 / 504
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.006754
- Max utilization: 0.49548
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.001155 | 0.127462 | 2.100e-15 |
| KDS-ST-02 | OK | 0.001497 | 0.17239 | 6.453e-16 |
| KDS-ST-04-WX-P | OK | 0.002097 | 0.186568 | 2.395e-15 |
| KDS-ST-04-WX-N | OK | 0.002126 | 0.186196 | 2.545e-15 |
| KDS-ST-04-WY-P | OK | 0.002034 | 0.186445 | 2.246e-15 |
| KDS-ST-04-WY-N | OK | 0.002211 | 0.185978 | 2.395e-15 |
| KDS-ST-05-EX-P | OK | 0.006461 | 0.268158 | 7.298e-15 |
| KDS-ST-05-EX-N | OK | 0.006489 | 0.268554 | 7.252e-15 |
| KDS-ST-05-EY-P | OK | 0.006614 | 0.269573 | 2.395e-15 |
| KDS-ST-05-EY-N | OK | 0.006754 | 0.267421 | 2.096e-15 |
| KDS-ST-06-WX-P | OK | 0.001809 | 0.119862 | 3.585e-15 |
| KDS-ST-06-WX-N | OK | 0.001823 | 0.119732 | 3.619e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M67 | OK | 0.49548 | steel-deflection | KDS-ST-05-EY-N |
| 2 | M63 | OK | 0.49388 | steel-deflection | KDS-ST-05-EY-N |
| 3 | M71 | OK | 0.493557 | steel-deflection | KDS-ST-05-EX-P |
| 4 | M70 | OK | 0.485976 | steel-deflection | KDS-ST-05-EX-P |
| 5 | M66 | OK | 0.485491 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M62 | OK | 0.483312 | steel-deflection | KDS-ST-05-EX-P |
| 7 | M73 | OK | 0.48152 | steel-deflection | KDS-ST-05-EX-P |
| 8 | M61 | OK | 0.474588 | steel-deflection | KDS-ST-05-EX-N |
| 9 | M60 | OK | 0.472586 | steel-deflection | KDS-ST-05-EY-N |
| 10 | M65 | OK | 0.472559 | steel-deflection | KDS-ST-05-EY-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
