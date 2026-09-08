# Regular office frame

## Model

- Type: office
- Description: Four-story regular moment frame used as a baseline office building.
- Nodes/members/loads: 45 / 84 / 240
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.005546
- Max utilization: 0.38062
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.001135 | 0.123785 | 1.611e-16 |
| KDS-ST-02 | OK | 0.001399 | 0.164914 | 3.625e-16 |
| KDS-ST-04-WX-P | OK | 0.002049 | 0.181951 | 4.796e-16 |
| KDS-ST-04-WX-N | OK | 0.002049 | 0.181951 | 6.976e-16 |
| KDS-ST-04-WY-P | OK | 0.002169 | 0.188472 | 4.186e-16 |
| KDS-ST-04-WY-N | OK | 0.002169 | 0.188472 | 4.186e-16 |
| KDS-ST-05-EX-P | OK | 0.005546 | 0.252196 | 1.666e-15 |
| KDS-ST-05-EX-N | OK | 0.005546 | 0.252196 | 1.631e-15 |
| KDS-ST-05-EY-P | OK | 0.005071 | 0.248888 | 4.186e-16 |
| KDS-ST-05-EY-N | OK | 0.005071 | 0.248888 | 5.581e-16 |
| KDS-ST-06-WX-P | OK | 0.001786 | 0.118668 | 8.694e-16 |
| KDS-ST-06-WX-N | OK | 0.001786 | 0.118668 | 8.459e-16 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M32 | OK | 0.38062 | steel-deflection | KDS-ST-05-EX-P |
| 2 | M5 | OK | 0.38028 | steel-interaction | KDS-ST-05-EX-P |
| 3 | M33 | OK | 0.378453 | steel-deflection | KDS-ST-05-EY-N |
| 4 | M31 | OK | 0.378453 | steel-deflection | KDS-ST-05-EY-P |
| 5 | M35 | OK | 0.378256 | steel-deflection | KDS-ST-05-EX-P |
| 6 | M29 | OK | 0.378256 | steel-deflection | KDS-ST-05-EX-N |
| 7 | M34 | OK | 0.377013 | steel-deflection | KDS-ST-05-EX-N |
| 8 | M36 | OK | 0.377013 | steel-deflection | KDS-ST-05-EX-P |
| 9 | M28 | OK | 0.377013 | steel-deflection | KDS-ST-05-EX-N |
| 10 | M30 | OK | 0.377013 | steel-deflection | KDS-ST-05-EX-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
