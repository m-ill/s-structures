# Courtyard hospital frame

## Model

- Type: hospital
- Description: Four-story public facility frame with a central courtyard opening.
- Nodes/members/loads: 120 / 240 / 672
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.009646
- Max utilization: 0.6278
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.001648 | 0.176778 | 1.829e-15 |
| KDS-ST-02 | OK | 0.002118 | 0.2476 | 6.107e-15 |
| KDS-ST-04-WX-P | OK | 0.002497 | 0.246691 | 4.336e-15 |
| KDS-ST-04-WX-N | OK | 0.002497 | 0.246691 | 4.464e-15 |
| KDS-ST-04-WY-P | OK | 0.002497 | 0.246691 | 4.592e-15 |
| KDS-ST-04-WY-N | OK | 0.002497 | 0.246691 | 4.209e-15 |
| KDS-ST-05-EX-P | OK | 0.009646 | 0.38501 | 4.847e-15 |
| KDS-ST-05-EX-N | OK | 0.009646 | 0.38501 | 4.855e-15 |
| KDS-ST-05-EY-P | OK | 0.009646 | 0.38501 | 4.464e-15 |
| KDS-ST-05-EY-N | OK | 0.009646 | 0.38501 | 4.209e-15 |
| KDS-ST-06-WX-P | OK | 0.002001 | 0.149779 | 1.648e-15 |
| KDS-ST-06-WX-N | OK | 0.002001 | 0.149779 | 1.682e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M85 | OK | 0.6278 | steel-deflection | KDS-ST-05-EY-P |
| 2 | M84 | OK | 0.6278 | steel-deflection | KDS-ST-05-EY-N |
| 3 | M89 | OK | 0.6278 | steel-deflection | KDS-ST-05-EX-P |
| 4 | M80 | OK | 0.6278 | steel-deflection | KDS-ST-05-EX-P |
| 5 | M86 | OK | 0.627166 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M83 | OK | 0.627166 | steel-deflection | KDS-ST-05-EY-P |
| 7 | M94 | OK | 0.627166 | steel-deflection | KDS-ST-05-EX-N |
| 8 | M75 | OK | 0.627166 | steel-deflection | KDS-ST-05-EX-N |
| 9 | M81 | OK | 0.611511 | steel-deflection | KDS-ST-05-EX-N |
| 10 | M79 | OK | 0.611511 | steel-deflection | KDS-ST-05-EX-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
