# Courtyard hospital frame

## Model

- Type: hospital
- Description: Four-story public facility frame with a central courtyard opening.
- Nodes/members/loads: 120 / 240 / 672
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.009984
- Max utilization: 0.649684
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.00169 | 0.177117 | 6.684e-12 |
| KDS-ST-02 | OK | 0.002167 | 0.248057 | 1.358e-12 |
| KDS-ST-04-WX-P | OK | 0.002574 | 0.247013 | 3.401e-12 |
| KDS-ST-04-WX-N | OK | 0.002574 | 0.247013 | 3.977e-12 |
| KDS-ST-04-WY-P | OK | 0.002574 | 0.247013 | 7.505e-12 |
| KDS-ST-04-WY-N | OK | 0.002574 | 0.247013 | 4.679e-12 |
| KDS-ST-05-EX-P | OK | 0.009984 | 0.385526 | 5.975e-12 |
| KDS-ST-05-EX-N | OK | 0.009984 | 0.385526 | 1.409e-12 |
| KDS-ST-05-EY-P | OK | 0.009984 | 0.385526 | 5.139e-12 |
| KDS-ST-05-EY-N | OK | 0.009984 | 0.385526 | 5.822e-12 |
| KDS-ST-06-WX-P | OK | 0.002068 | 0.149976 | 8.298e-12 |
| KDS-ST-06-WX-N | OK | 0.002068 | 0.149976 | 3.659e-12 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M84 | OK | 0.649684 | steel-deflection | KDS-ST-05-EY-N |
| 2 | M89 | OK | 0.649684 | steel-deflection | KDS-ST-05-EX-P |
| 3 | M85 | OK | 0.649684 | steel-deflection | KDS-ST-05-EY-N |
| 4 | M80 | OK | 0.649684 | steel-deflection | KDS-ST-05-EX-P |
| 5 | M83 | OK | 0.649096 | steel-deflection | KDS-ST-05-EY-P |
| 6 | M94 | OK | 0.649096 | steel-deflection | KDS-ST-05-EX-N |
| 7 | M86 | OK | 0.649096 | steel-deflection | KDS-ST-05-EY-P |
| 8 | M75 | OK | 0.649096 | steel-deflection | KDS-ST-05-EX-P |
| 9 | M88 | OK | 0.63312 | steel-deflection | KDS-ST-05-EY-N |
| 10 | M81 | OK | 0.63312 | steel-deflection | KDS-ST-05-EX-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
