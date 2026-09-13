# Apartment frame equivalent

## Model

- Type: apartment
- Description: Six-story elongated residential block represented as an equivalent 3D frame.
- Nodes/members/loads: 126 / 270 / 756
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.004441
- Max utilization: 0.381166
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 7.763e-4 | 0.088002 | 2.107e-11 |
| KDS-ST-02 | OK | 0.001012 | 0.119052 | 2.089e-11 |
| KDS-ST-04-WX-P | OK | 0.001046 | 0.116109 | 2.091e-11 |
| KDS-ST-04-WX-N | OK | 0.001046 | 0.116109 | 2.014e-11 |
| KDS-ST-04-WY-P | OK | 0.002143 | 0.14964 | 1.922e-11 |
| KDS-ST-04-WY-N | OK | 0.002143 | 0.14964 | 1.957e-11 |
| KDS-ST-05-EX-P | OK | 0.004145 | 0.182165 | 2.100e-11 |
| KDS-ST-05-EX-N | OK | 0.004145 | 0.182165 | 1.175e-11 |
| KDS-ST-05-EY-P | OK | 0.004441 | 0.187459 | 1.783e-11 |
| KDS-ST-05-EY-N | OK | 0.004441 | 0.187459 | 4.496e-12 |
| KDS-ST-06-WX-P | OK | 7.491e-4 | 0.069996 | 2.075e-11 |
| KDS-ST-06-WX-N | OK | 7.491e-4 | 0.069996 | 1.974e-11 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M99 | OK | 0.381166 | steel-deflection | KDS-ST-05-EY-N |
| 2 | M100 | OK | 0.381166 | steel-deflection | KDS-ST-05-EY-P |
| 3 | M98 | OK | 0.38103 | steel-deflection | KDS-ST-05-EY-P |
| 4 | M101 | OK | 0.38103 | steel-deflection | KDS-ST-05-EY-N |
| 5 | M105 | OK | 0.380958 | steel-deflection | KDS-ST-05-EX-P |
| 6 | M94 | OK | 0.380958 | steel-deflection | KDS-ST-05-EX-N |
| 7 | M106 | OK | 0.380958 | steel-deflection | KDS-ST-05-EX-N |
| 8 | M93 | OK | 0.380958 | steel-deflection | KDS-ST-05-EX-P |
| 9 | M104 | OK | 0.380821 | steel-deflection | KDS-ST-05-EX-N |
| 10 | M95 | OK | 0.380821 | steel-deflection | KDS-ST-05-EX-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
