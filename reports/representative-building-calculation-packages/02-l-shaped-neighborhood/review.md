# L-shaped neighborhood facility

## Model

- Type: neighborhood-living
- Description: Three-story L-shaped low-rise commercial frame with plan irregularity.
- Nodes/members/loads: 48 / 84 / 240
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.003864
- Max utilization: 0.3635
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.001072 | 0.127764 | 9.721e-16 |
| KDS-ST-02 | OK | 0.001351 | 0.182674 | 6.700e-16 |
| KDS-ST-04-WX-P | OK | 0.001472 | 0.179417 | 9.869e-16 |
| KDS-ST-04-WX-N | OK | 0.001466 | 0.175528 | 7.895e-16 |
| KDS-ST-04-WY-P | OK | 0.001454 | 0.18515 | 7.871e-16 |
| KDS-ST-04-WY-N | OK | 0.001509 | 0.182163 | 1.181e-15 |
| KDS-ST-05-EX-P | OK | 0.003864 | 0.247907 | 9.546e-16 |
| KDS-ST-05-EX-N | OK | 0.00383 | 0.243464 | 7.637e-16 |
| KDS-ST-05-EY-P | OK | 0.003544 | 0.245916 | 1.146e-15 |
| KDS-ST-05-EY-N | OK | 0.00355 | 0.241882 | 8.631e-16 |
| KDS-ST-06-WX-P | OK | 0.001107 | 0.10758 | 5.687e-16 |
| KDS-ST-06-WX-N | OK | 0.001103 | 0.10547 | 3.250e-16 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M6 | OK | 0.3635 | steel-interaction | KDS-ST-05-EX-P |
| 2 | M7 | OK | 0.328746 | steel-interaction | KDS-ST-05-EX-N |
| 3 | M3 | OK | 0.327604 | steel-interaction | KDS-ST-05-EX-N |
| 4 | M10 | OK | 0.32617 | steel-interaction | KDS-ST-05-EY-N |
| 5 | M9 | OK | 0.322925 | steel-interaction | KDS-ST-05-EY-N |
| 6 | M2 | OK | 0.322789 | steel-interaction | KDS-ST-05-EX-P |
| 7 | M5 | OK | 0.318116 | steel-interaction | KDS-ST-05-EY-P |
| 8 | M8 | OK | 0.288094 | steel-interaction | KDS-ST-05-EY-P |
| 9 | M12 | OK | 0.287509 | steel-interaction | KDS-ST-05-EX-P |
| 10 | M4 | OK | 0.28651 | steel-interaction | KDS-ST-05-EY-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
