# Podium tower setback

## Model

- Type: mixed-use
- Description: Six-story mixed-use frame with a broad podium and upper setback tower.
- Nodes/members/loads: 84 / 154 / 436
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.050286
- Max utilization: 3.671727
- Design status: Review
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.008371 | 0.5897 | 3.784e-12 |
| KDS-ST-02 | OK | 0.010701 | 0.817102 | 1.935e-12 |
| KDS-ST-04-WX-P | OK | 0.010955 | 0.781442 | 3.612e-12 |
| KDS-ST-04-WX-N | OK | 0.010955 | 0.781442 | 2.969e-12 |
| KDS-ST-04-WY-P | OK | 0.012767 | 0.778104 | 6.069e-12 |
| KDS-ST-04-WY-N | OK | 0.012767 | 0.778104 | 4.541e-12 |
| KDS-ST-05-EX-P | OK | 0.043686 | 1.295023 | 1.713e-12 |
| KDS-ST-05-EX-N | OK | 0.043686 | 1.295023 | 2.649e-12 |
| KDS-ST-05-EY-P | OK | 0.050286 | 1.278535 | 4.616e-12 |
| KDS-ST-05-EY-N | OK | 0.050286 | 1.278535 | 5.080e-12 |
| KDS-ST-06-WX-P | OK | 0.007811 | 0.460299 | 3.172e-12 |
| KDS-ST-06-WX-N | OK | 0.007811 | 0.460299 | 2.876e-12 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M60 | NG | 3.671727 | steel-deflection | KDS-ST-05-EX-P |
| 2 | M63 | NG | 3.671727 | steel-deflection | KDS-ST-05-EX-N |
| 3 | M61 | NG | 3.650934 | steel-deflection | KDS-ST-05-EY-N |
| 4 | M62 | NG | 3.650934 | steel-deflection | KDS-ST-05-EY-P |
| 5 | M59 | NG | 3.650934 | steel-deflection | KDS-ST-05-EY-N |
| 6 | M64 | NG | 3.650934 | steel-deflection | KDS-ST-05-EY-P |
| 7 | M54 | NG | 3.205796 | steel-deflection | KDS-ST-05-EX-P |
| 8 | M57 | NG | 3.205796 | steel-deflection | KDS-ST-05-EX-P |
| 9 | M56 | NG | 3.18068 | steel-deflection | KDS-ST-05-EY-P |
| 10 | M53 | NG | 3.18068 | steel-deflection | KDS-ST-05-EY-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
