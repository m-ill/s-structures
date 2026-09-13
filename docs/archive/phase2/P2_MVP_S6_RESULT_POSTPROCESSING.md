# P2-M6 Result Postprocessing

status: preliminary

## Scope

P2-M6 adds a standard result package for office review, reports, and AI
automation. It does not rerun analysis. It reads solved elastic results and
builds practical tables.

## Contracts

| Contract | Output |
| --- | --- |
| Story result table | story weight, cumulative shear, torsion, drift ratio |
| Member station force | station rows and governing N/V/M peak per member |
| Foundation reaction envelope | min/max support reaction and uplift flag |
| Agent API | `getResultPostprocessing()` |

## Limits

1. Story shear is based on generated nodal loads and combination factors.
2. Member forces use existing frame recovery stations.
3. Foundation reactions are design demands, not final footing checks.

## Verification

Run `npm run test:p2s6`.
