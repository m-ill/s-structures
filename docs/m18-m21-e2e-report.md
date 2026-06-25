# M18-M21 implementation and E2E report

Date: 2026-06-25

## Scope

M18 through M21 extend the original S-Structures UI integration with result overlays, agent screen controls, preliminary pushover UI, and a design review workflow.

## M18 result overlay

Codebase review:
- The original `index.html` canvas code is compacted and high risk to edit directly.
- The existing engine bridge already exposes result visual data through `buildIndexResultVisuals`.

Implementation:
- Added `src/ui/indexResultOverlay.js`.
- Installed a canvas overlay above the original canvas area.
- Added stable controls for deformed shape, utilization color, loads, reactions, mode shape, and P-Delta overlay.
- Added pure scene generation so overlay behavior can be unit tested without a browser.

Verification:
- `tests/m18-result-overlay.mjs`
- Checks base members, utilization lines, deformed lines, load arrows, reaction arrows, mode shape lines, badges, legend, and focus state.

## M19 agent screen control

Codebase review:
- Agent modeling actions were already centralized in `indexAgentActions.js`.
- Screen-facing state was not yet readable or controllable through the same API.

Implementation:
- Added `getScreenState`.
- Added `setOverlayOption`, `setOverlayMode`, `setOverlayPDeltaStep`, and `focusEntity`.
- Added overlay and screen state to agent snapshots.
- Updated capability manifest with screen control contracts.

Verification:
- `tests/m19-agent-screen-control.mjs`
- Confirms overlay toggles, mode step control, focus selection, screen state reads, and manifest exposure.

## M20 pushover panel

Codebase review:
- Preliminary pushover engine existed as `runPushover`.
- No persistent UI existed for capacity curve or hinge state review.

Implementation:
- Added `src/ui/indexPushoverPanel.js`.
- Added floating pushover panel with run button, capacity curve, summary metrics, hinge rows, and warnings.
- Connected agent `runPushover` to update the panel.
- Added `setPushoverOption`.
- Fixed an installation-path recursion risk by injecting the core pushover runner into the panel.

Verification:
- `tests/m20-pushover-panel.mjs`
- Confirms panel view, capacity curve markup, hinge table, agent option updates, and agent run results.

## M21 design workflow

Codebase review:
- Design results already existed as steel and concrete member result maps.
- The UI needed a workflow-level summary rather than only tables and bars.

Implementation:
- Added `src/ui/indexDesignWorkflow.js`.
- Added Design tab workflow card with model, loads, analysis, design status checks.
- Added OK/WARN/NG/unchecked counts and next actions.
- Added workflow summary fields to agent snapshots.
- Updated capability manifest.

Verification:
- `tests/m21-design-workflow.mjs`
- Confirms workflow status, counts, next actions, Design tab rendering, agent snapshot summary, and manifest exposure.

## Browser E2E

Target:
- `http://127.0.0.1:5173/index.html`

Checked:
- Original S-Structures page loads.
- Result overlay canvas exists.
- Overlay controls exist.
- Loads and reactions overlay buttons change pressed state.
- Pushover panel exists.
- Pushover run button renders a capacity result and hinge rows.
- Design tab renders Design Workflow.
- Browser console reported no warnings or errors during the checked flow.

Observed browser result:
- Pushover panel showed OK status, control node, base shear, control displacement, hinge rows, and warning text when no yield occurred in the default range.
- Design Workflow showed WARN status because warning members remain in the sample design result.

## Automated tests

Command:

```powershell
npm.cmd run test
```

Result:
- Passed M0 through M21.

Added test entries:
- `test:m18`
- `test:m19`
- `test:m20`
- `test:m21`

## Notes

- The original compacted canvas implementation was not edited directly.
- New UI layers are installed through the bridge modules.
- Stable `data-agent-id` attributes were added for future computer-use and API control.
