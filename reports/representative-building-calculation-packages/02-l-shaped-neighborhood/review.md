# L-shaped neighborhood facility

## Model

- Type: neighborhood-living
- Description: Three-story L-shaped low-rise commercial frame with plan irregularity.
- Nodes/members/loads: 48 / 84 / 240
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.003715
- Max utilization: 0.36326
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.001029 | 0.127671 | 3.646e-16 |
| KDS-ST-02 | OK | 0.001299 | 0.182466 | 3.403e-16 |
| KDS-ST-04-WX-P | OK | 0.001414 | 0.179343 | 3.331e-16 |
| KDS-ST-04-WX-N | OK | 0.001409 | 0.175277 | 3.628e-16 |
| KDS-ST-04-WY-P | OK | 0.001391 | 0.184973 | 8.068e-16 |
| KDS-ST-04-WY-N | OK | 0.001446 | 0.181809 | 8.444e-16 |
| KDS-ST-05-EX-P | OK | 0.003715 | 0.247758 | 1.414e-15 |
| KDS-ST-05-EX-N | OK | 0.003683 | 0.24324 | 1.464e-15 |
| KDS-ST-05-EY-P | OK | 0.003385 | 0.245582 | 2.727e-15 |
| KDS-ST-05-EY-N | OK | 0.003391 | 0.241478 | 2.815e-15 |
| KDS-ST-06-WX-P | OK | 0.001063 | 0.107548 | 7.561e-16 |
| KDS-ST-06-WX-N | OK | 0.001059 | 0.105344 | 9.451e-16 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M6 | OK | 0.36326 | steel-interaction | KDS-ST-05-EX-P |
| 2 | M7 | OK | 0.328641 | steel-interaction | KDS-ST-05-EX-N |
| 3 | M3 | OK | 0.327514 | steel-interaction | KDS-ST-05-EX-N |
| 4 | M10 | OK | 0.326481 | steel-interaction | KDS-ST-05-EY-N |
| 5 | M9 | OK | 0.323158 | steel-interaction | KDS-ST-05-EY-N |
| 6 | M2 | OK | 0.322589 | steel-interaction | KDS-ST-05-EX-P |
| 7 | M5 | OK | 0.318239 | steel-interaction | KDS-ST-05-EY-P |
| 8 | M8 | OK | 0.288554 | steel-interaction | KDS-ST-05-EY-P |
| 9 | M12 | OK | 0.28795 | steel-interaction | KDS-ST-05-EX-P |
| 10 | M4 | OK | 0.286948 | steel-interaction | KDS-ST-05-EY-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
