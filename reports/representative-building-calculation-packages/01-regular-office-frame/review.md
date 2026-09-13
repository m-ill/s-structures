# Regular office frame

## Model

- Type: office
- Description: Four-story regular moment frame used as a baseline office building.
- Nodes/members/loads: 45 / 84 / 240
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.005749
- Max utilization: 0.394363
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.001168 | 0.124066 | 3.240e-16 |
| KDS-ST-02 | OK | 0.001436 | 0.165287 | 1.215e-16 |
| KDS-ST-04-WX-P | OK | 0.002118 | 0.182247 | 1.856e-15 |
| KDS-ST-04-WX-N | OK | 0.002118 | 0.182247 | 1.854e-15 |
| KDS-ST-04-WY-P | OK | 0.002253 | 0.188801 | 6.931e-16 |
| KDS-ST-04-WY-N | OK | 0.002253 | 0.188801 | 1.043e-15 |
| KDS-ST-05-EX-P | OK | 0.005749 | 0.252476 | 5.625e-15 |
| KDS-ST-05-EX-N | OK | 0.005749 | 0.252476 | 6.391e-15 |
| KDS-ST-05-EY-P | OK | 0.005289 | 0.249266 | 5.313e-16 |
| KDS-ST-05-EY-N | OK | 0.005289 | 0.249266 | 6.642e-16 |
| KDS-ST-06-WX-P | OK | 0.001851 | 0.118821 | 3.288e-15 |
| KDS-ST-06-WX-N | OK | 0.001851 | 0.118821 | 3.328e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M32 | OK | 0.394363 | steel-deflection | KDS-ST-05-EX-N |
| 2 | M31 | OK | 0.392275 | steel-deflection | KDS-ST-05-EY-P |
| 3 | M33 | OK | 0.392275 | steel-deflection | KDS-ST-05-EY-N |
| 4 | M29 | OK | 0.392059 | steel-deflection | KDS-ST-05-EX-N |
| 5 | M35 | OK | 0.392059 | steel-deflection | KDS-ST-05-EX-P |
| 6 | M28 | OK | 0.390876 | steel-deflection | KDS-ST-05-EX-N |
| 7 | M30 | OK | 0.390876 | steel-deflection | KDS-ST-05-EX-P |
| 8 | M34 | OK | 0.390876 | steel-deflection | KDS-ST-05-EX-N |
| 9 | M36 | OK | 0.390876 | steel-deflection | KDS-ST-05-EX-P |
| 10 | M5 | OK | 0.380663 | steel-interaction | KDS-ST-05-EX-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
