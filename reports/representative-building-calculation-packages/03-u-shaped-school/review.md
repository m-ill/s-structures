# U-shaped school wing

## Model

- Type: school
- Description: Three-story U-shaped education building around an open courtyard.
- Nodes/members/loads: 40 / 57 / 174
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.063659
- Max utilization: 4.301254
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.003438 | 0.403368 | 4.523e-16 |
| KDS-ST-02 | OK | 0.004248 | 0.515674 | 2.141e-16 |
| KDS-ST-04-WX-P | OK | 0.013688 | 0.462707 | 6.704e-16 |
| KDS-ST-04-WX-N | OK | 0.013688 | 0.462707 | 1.004e-15 |
| KDS-ST-04-WY-P | OK | 0.005882 | 0.423826 | 6.272e-16 |
| KDS-ST-04-WY-N | OK | 0.005431 | 0.461757 | 3.763e-16 |
| KDS-ST-05-EX-P | OK | 0.063659 | 0.728043 | 3.003e-15 |
| KDS-ST-05-EX-N | OK | 0.063659 | 0.728043 | 2.979e-15 |
| KDS-ST-05-EY-P | OK | 0.020035 | 0.475477 | 5.096e-16 |
| KDS-ST-05-EY-N | OK | 0.019506 | 0.588159 | 6.272e-16 |
| KDS-ST-06-WX-P | OK | 0.013398 | 0.281036 | 1.231e-15 |
| KDS-ST-06-WX-N | OK | 0.013398 | 0.281036 | 1.260e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M29 | NG | 4.301254 | steel-deflection | KDS-ST-05-EX-P |
| 2 | M30 | NG | 4.301254 | steel-deflection | KDS-ST-05-EX-N |
| 3 | M27 | NG | 3.368541 | steel-deflection | KDS-ST-05-EY-N |
| 4 | M28 | NG | 3.368541 | steel-deflection | KDS-ST-05-EY-N |
| 5 | M56 | NG | 2.65244 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M57 | NG | 2.65244 | steel-deflection | KDS-ST-05-EY-N |
| 7 | M19 | NG | 2.399345 | steel-deflection | KDS-ST-05-EX-P |
| 8 | M20 | NG | 2.399345 | steel-deflection | KDS-ST-05-EX-N |
| 9 | M25 | NG | 2.08399 | steel-deflection | KDS-ST-05-EY-P |
| 10 | M26 | NG | 2.08399 | steel-deflection | KDS-ST-05-EY-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
