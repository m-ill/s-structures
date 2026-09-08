# Podium tower setback

## Model

- Type: mixed-use
- Description: Six-story mixed-use frame with a broad podium and upper setback tower.
- Nodes/members/loads: 84 / 154 / 436
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.048649
- Max utilization: 3.553149
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.008186 | 0.594423 | 7.161e-16 |
| KDS-ST-02 | OK | 0.010482 | 0.815794 | 1.231e-15 |
| KDS-ST-04-WX-P | OK | 0.01068 | 0.780479 | 1.320e-15 |
| KDS-ST-04-WX-N | OK | 0.01068 | 0.780479 | 1.679e-15 |
| KDS-ST-04-WY-P | OK | 0.012428 | 0.777253 | 1.972e-15 |
| KDS-ST-04-WY-N | OK | 0.012428 | 0.777253 | 1.946e-15 |
| KDS-ST-05-EX-P | OK | 0.042124 | 1.294937 | 2.947e-15 |
| KDS-ST-05-EX-N | OK | 0.042124 | 1.294937 | 2.909e-15 |
| KDS-ST-05-EY-P | OK | 0.048649 | 1.280959 | 1.023e-14 |
| KDS-ST-05-EY-N | OK | 0.048649 | 1.280959 | 1.020e-14 |
| KDS-ST-06-WX-P | OK | 0.007578 | 0.459831 | 8.389e-16 |
| KDS-ST-06-WX-N | OK | 0.007578 | 0.459831 | 8.111e-16 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M63 | NG | 3.553149 | steel-deflection | KDS-ST-05-EX-P |
| 2 | M60 | NG | 3.553149 | steel-deflection | KDS-ST-05-EX-P |
| 3 | M59 | NG | 3.531914 | steel-deflection | KDS-ST-05-EY-N |
| 4 | M62 | NG | 3.531914 | steel-deflection | KDS-ST-05-EY-P |
| 5 | M61 | NG | 3.531914 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M64 | NG | 3.531914 | steel-deflection | KDS-ST-05-EY-P |
| 7 | M54 | NG | 3.101206 | steel-deflection | KDS-ST-05-EX-N |
| 8 | M57 | NG | 3.101206 | steel-deflection | KDS-ST-05-EX-N |
| 9 | M53 | NG | 3.0757 | steel-deflection | KDS-ST-05-EY-N |
| 10 | M56 | NG | 3.0757 | steel-deflection | KDS-ST-05-EY-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
