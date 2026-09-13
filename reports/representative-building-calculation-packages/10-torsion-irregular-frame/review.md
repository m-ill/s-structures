# Torsion irregular corner frame

## Model

- Type: irregular
- Description: Five-story frame with a missing corner and offset stiffness distribution.
- Nodes/members/loads: 88 / 179 / 504
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.007062
- Max utilization: 0.517969
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.001176 | 0.127675 | 1.840e-11 |
| KDS-ST-02 | OK | 0.001521 | 0.172679 | 1.002e-11 |
| KDS-ST-04-WX-P | OK | 0.002172 | 0.186885 | 2.006e-11 |
| KDS-ST-04-WX-N | OK | 0.002202 | 0.18655 | 1.410e-11 |
| KDS-ST-04-WY-P | OK | 0.002109 | 0.186778 | 8.075e-12 |
| KDS-ST-04-WY-N | OK | 0.002289 | 0.186288 | 8.872e-12 |
| KDS-ST-05-EX-P | OK | 0.006764 | 0.268719 | 1.217e-11 |
| KDS-ST-05-EX-N | OK | 0.00679 | 0.269147 | 9.546e-12 |
| KDS-ST-05-EY-P | OK | 0.006922 | 0.2701 | 1.720e-11 |
| KDS-ST-05-EY-N | OK | 0.007062 | 0.267797 | 1.454e-11 |
| KDS-ST-06-WX-P | OK | 0.001886 | 0.120075 | 5.257e-11 |
| KDS-ST-06-WX-N | OK | 0.001901 | 0.119966 | 1.133e-11 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M67 | OK | 0.517969 | steel-deflection | KDS-ST-05-EY-N |
| 2 | M63 | OK | 0.516427 | steel-deflection | KDS-ST-05-EY-N |
| 3 | M71 | OK | 0.516129 | steel-deflection | KDS-ST-05-EX-P |
| 4 | M70 | OK | 0.507842 | steel-deflection | KDS-ST-05-EX-P |
| 5 | M66 | OK | 0.507337 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M62 | OK | 0.505243 | steel-deflection | KDS-ST-05-EX-P |
| 7 | M73 | OK | 0.503567 | steel-deflection | KDS-ST-05-EX-P |
| 8 | M61 | OK | 0.496764 | steel-deflection | KDS-ST-05-EX-N |
| 9 | M60 | OK | 0.494838 | steel-deflection | KDS-ST-05-EY-N |
| 10 | M65 | OK | 0.494263 | steel-deflection | KDS-ST-05-EY-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
