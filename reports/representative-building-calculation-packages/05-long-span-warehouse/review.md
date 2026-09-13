# Long-span warehouse

## Model

- Type: industrial
- Description: Single-story long-span industrial warehouse with wide transverse bays.
- Nodes/members/loads: 30 / 37 / 104
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.012959
- Max utilization: 0.538796
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.009764 | 0.455169 | 5.639e-16 |
| KDS-ST-02 | OK | 0.011344 | 0.528863 | 7.784e-16 |
| KDS-ST-04-WX-P | OK | 0.011779 | 0.476843 | 2.834e-15 |
| KDS-ST-04-WX-N | OK | 0.011779 | 0.476843 | 2.821e-15 |
| KDS-ST-04-WY-P | OK | 0.012959 | 0.538554 | 9.293e-16 |
| KDS-ST-04-WY-N | OK | 0.012959 | 0.538554 | 9.611e-16 |
| KDS-ST-05-EX-P | OK | 0.011201 | 0.476843 | 2.203e-15 |
| KDS-ST-05-EX-N | OK | 0.011201 | 0.476843 | 2.243e-15 |
| KDS-ST-05-EY-P | OK | 0.011965 | 0.523306 | 7.409e-16 |
| KDS-ST-05-EY-N | OK | 0.011965 | 0.523306 | 7.490e-16 |
| KDS-ST-06-WX-P | OK | 0.00857 | 0.310861 | 4.472e-15 |
| KDS-ST-06-WX-N | OK | 0.00857 | 0.310861 | 4.462e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M21 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-P |
| 2 | M19 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-P |
| 3 | M23 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-P |
| 4 | M24 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-P |
| 5 | M30 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-N |
| 6 | M17 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-P |
| 7 | M28 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-N |
| 8 | M32 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-N |
| 9 | M33 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-N |
| 10 | M26 | OK | 0.538796 | steel-interaction | KDS-ST-04-WY-N |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
