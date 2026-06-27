# Long-span warehouse

## Model

- Type: industrial
- Description: Single-story long-span industrial warehouse with wide transverse bays.
- Nodes/members/loads: 30 / 37 / 104
- Load cases/combinations: 6 / 28

## Analysis

- Status: OK
- Max displacement: 0.012765
- Max utilization: 0.539032
- Design status: OK
- Package audit: OK

## First Combination Results

| Combo | Status | Max displacement | Max utilization | Residual |
| --- | --- | ---: | ---: | ---: |
| KDS-ST-01 | OK | 0.009591 | 0.455281 | 6.608e-18 |
| KDS-ST-02 | OK | 0.011144 | 0.528993 | 4.853e-16 |
| KDS-ST-04-WX-P | OK | 0.011586 | 0.476961 | 2.742e-15 |
| KDS-ST-04-WX-N | OK | 0.011586 | 0.476961 | 2.717e-15 |
| KDS-ST-04-WY-P | OK | 0.012765 | 0.538789 | 5.383e-16 |
| KDS-ST-04-WY-N | OK | 0.012765 | 0.538789 | 5.383e-16 |
| KDS-ST-05-EX-P | OK | 0.011013 | 0.476961 | 2.136e-15 |
| KDS-ST-05-EX-N | OK | 0.011013 | 0.476961 | 2.136e-15 |
| KDS-ST-05-EY-P | OK | 0.011777 | 0.523512 | 4.037e-16 |
| KDS-ST-05-EY-N | OK | 0.011777 | 0.523512 | 6.729e-16 |
| KDS-ST-06-WX-P | OK | 0.008439 | 0.311265 | 4.413e-15 |
| KDS-ST-06-WX-N | OK | 0.008439 | 0.311265 | 4.413e-15 |

## Governing Members

| Rank | Member | Status | Utilization | Check | Combo |
| ---: | --- | --- | ---: | --- | --- |
| 1 | M30 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-N |
| 2 | M28 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-N |
| 3 | M32 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-N |
| 4 | M26 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-N |
| 5 | M33 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-N |
| 6 | M17 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-P |
| 7 | M19 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-P |
| 8 | M23 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-P |
| 9 | M21 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-P |
| 10 | M24 | OK | 0.539032 | steel-interaction | KDS-ST-04-WY-P |

## Notes

- Print-ready HTML is intended for browser PDF output.
- Final sealed calculation packages require project-specific engineering review.
- Unsupported checks remain listed in the appendix rather than hidden.
