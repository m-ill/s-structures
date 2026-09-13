# U-shaped school wing

## Model

- Type: school
- Description: Three-story U-shaped education building around an open courtyard.
- Nodes/members/loads: 40 / 57 / 174
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.063941
- Max utilization: 4.320353
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.003581 | 0.399624 | 6.030e-16 |
| KDS-ST-02 | OK | 0.004462 | 0.51189 | 4.281e-16 |
| KDS-ST-04-WX-P | OK | 0.013772 | 0.46309 | 6.196e-16 |
| KDS-ST-04-WX-N | OK | 0.013772 | 0.46309 | 4.469e-16 |
| KDS-ST-04-WY-P | OK | 0.006029 | 0.419463 | 1.140e-15 |
| KDS-ST-04-WY-N | OK | 0.005546 | 0.459992 | 1.369e-15 |
| KDS-ST-05-EX-P | OK | 0.063941 | 0.727538 | 1.847e-15 |
| KDS-ST-05-EX-N | OK | 0.063941 | 0.727538 | 1.854e-15 |
| KDS-ST-05-EY-P | OK | 0.020364 | 0.474433 | 4.677e-15 |
| KDS-ST-05-EY-N | OK | 0.019793 | 0.586208 | 4.878e-15 |
| KDS-ST-06-WX-P | OK | 0.013469 | 0.280914 | 7.807e-16 |
| KDS-ST-06-WX-N | OK | 0.013469 | 0.280914 | 7.664e-16 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M29 | NG | 4.320353 | steel-deflection | KDS-ST-05-EX-P |
| 2 | M30 | NG | 4.320353 | steel-deflection | KDS-ST-05-EX-N |
| 3 | M27 | NG | 3.390054 | steel-deflection | KDS-ST-05-EY-N |
| 4 | M28 | NG | 3.390054 | steel-deflection | KDS-ST-05-EY-N |
| 5 | M56 | NG | 2.664217 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M57 | NG | 2.664217 | steel-deflection | KDS-ST-05-EY-N |
| 7 | M20 | NG | 2.412249 | steel-deflection | KDS-ST-05-EX-N |
| 8 | M19 | NG | 2.412249 | steel-deflection | KDS-ST-05-EX-P |
| 9 | M25 | NG | 2.108547 | steel-deflection | KDS-ST-05-EY-P |
| 10 | M26 | NG | 2.108547 | steel-deflection | KDS-ST-05-EY-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
