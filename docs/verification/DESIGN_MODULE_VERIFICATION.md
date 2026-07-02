# Design Module Verification

## P3-M17 RC Detailed Design

Scope follows `docs/phase3/DESIGN_MODULES_PLAN.md`.

| Ticket | Module | Verification |
| --- | --- | --- |
| P3-T87 | RC beam flexure, shear, torsion warning, serviceability, bar schedule, development and splice trace | `tests/p3-design-rc.mjs` released beam case |
| P3-T88 | RC column PM curve, slenderness, tie schedule, column schedule | `tests/p3-design-rc.mjs` vertical column case |
| P3-T89 | RC wall pier PM, in-plane shear, reinforcement ratios, boundary flag | `tests/p3-design-rc.mjs` wall schedule case |
| P3-T90 | RC slab one-way/two-way mode, punching shear, slab reinforcement schedule | `tests/p3-design-rc.mjs` slab schedule case |

Current status is preliminary. The module produces traceable schedules and formula IDs for agent/report consumption, but final clause selection, seismic detailing, constructability, and drawing production remain review items.
