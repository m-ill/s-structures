# M41 Connection And Foundation Preliminary Review

## Scope

M41 adds preliminary connection-force and foundation-reaction schedules.

- Reads member force envelopes for connection design-force rows.
- Reads support reactions for preliminary foundation rows.
- Reports equivalent connection demand, bearing area, uplift flag, and sliding ratio.
- Adds `getConnectionFoundationReport()` for agent/browser API use.
- Adds a connection/foundation section to the detailed HTML report.

## Current Limits

- Connection rows are force envelopes, not bolt/weld/plate designs.
- Foundation rows are bearing/sliding screens, not footing or pile designs.
- Soil bearing, settlement, punching, reinforcement, uplift anchorage, and constructability checks remain future work.
