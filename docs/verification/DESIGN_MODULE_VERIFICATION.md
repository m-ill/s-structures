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

## P3-M18 Steel / Connection / Foundation Detailed Design

Scope follows `docs/phase3/DESIGN_MODULES_PLAN.md`.

| Ticket | Module | Verification |
| --- | --- | --- |
| P3-T91 | Steel classification, compression/slenderness, flexure LTB, shear and H1 interaction trace | `tests/p3-design-steel-foundation.mjs` cantilever and frame cases |
| P3-T92 | Brace/connection demand, bolt group, weld, base plate sizing trace | `tests/p3-design-steel-foundation.mjs` frame connection case |
| P3-T93 | Spread footing, combined footing, mat v1, pile group v1 trace | `tests/p3-design-steel-foundation.mjs` frame support reaction case |
| P3-T94 | Integrated detailed design report, formula trace, issue-row bridge | `tests/p3-design-steel-foundation.mjs` integrated report case |
| P3-T95 | Serviceability hook remains available through existing drift/deflection reports and steel deflection trace | Full milestone runner plus M40/M49 coverage |

Current status is preliminary. M18 adds traceable steel, connection, base-plate, and foundation schedules for agent/report consumption. Final local buckling table selection, fabrication detailing, geotechnical settlement, and construction drawings remain review items.
