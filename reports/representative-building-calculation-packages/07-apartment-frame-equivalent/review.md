# Apartment frame equivalent

## Model

- Type: apartment
- Description: Six-story elongated residential block represented as an equivalent 3D frame.
- Nodes/members/loads: 126 / 270 / 756
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.004173
- Max utilization: 0.358187
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 7.626e-4 | 0.087771 | 3.229e-15 |
| KDS-ST-02 | OK | 9.953e-4 | 0.118743 | 5.478e-15 |
| KDS-ST-04-WX-P | OK | 0.001017 | 0.115802 | 5.210e-15 |
| KDS-ST-04-WX-N | OK | 0.001017 | 0.115802 | 5.699e-15 |
| KDS-ST-04-WY-P | OK | 0.002025 | 0.149315 | 5.612e-15 |
| KDS-ST-04-WY-N | OK | 0.002025 | 0.149315 | 5.612e-15 |
| KDS-ST-05-EX-P | OK | 0.003928 | 0.181636 | 5.373e-15 |
| KDS-ST-05-EX-N | OK | 0.003928 | 0.181636 | 5.210e-15 |
| KDS-ST-05-EY-P | OK | 0.004173 | 0.187038 | 1.210e-14 |
| KDS-ST-05-EY-N | OK | 0.004173 | 0.187038 | 1.214e-14 |
| KDS-ST-06-WX-P | OK | 7.206e-4 | 0.069808 | 4.432e-15 |
| KDS-ST-06-WX-N | OK | 7.206e-4 | 0.069808 | 3.989e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M100 | OK | 0.358187 | steel-deflection | KDS-ST-05-EY-N |
| 2 | M99 | OK | 0.358187 | steel-deflection | KDS-ST-05-EY-P |
| 3 | M94 | OK | 0.35803 | steel-deflection | KDS-ST-05-EX-N |
| 4 | M106 | OK | 0.35803 | steel-deflection | KDS-ST-05-EX-N |
| 5 | M93 | OK | 0.35803 | steel-deflection | KDS-ST-05-EX-P |
| 6 | M105 | OK | 0.35803 | steel-deflection | KDS-ST-05-EX-P |
| 7 | M101 | OK | 0.358027 | steel-deflection | KDS-ST-05-EY-P |
| 8 | M98 | OK | 0.358027 | steel-deflection | KDS-ST-05-EY-N |
| 9 | M95 | OK | 0.357869 | steel-deflection | KDS-ST-05-EX-P |
| 10 | M107 | OK | 0.357869 | steel-deflection | KDS-ST-05-EX-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
