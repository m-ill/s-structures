# Index Native UI Reorganization Plan

Date: 2026-06-26

## 1. Goal

Reorganize the existing `index.html` UI without replacing its visual identity.

The current S-Structures interface already has a strong 3D canvas, top toolbar, result toggles, palette, property panel, report modal, and tablet memo functions. The next UI milestone should not add more floating buttons. It should group the existing and new functions into clear work modes:

- Modeling
- Elastic Analysis
- Nonlinear Analysis
- Tablet Memo

Each top mode opens a ribbon-style detail menu directly below the top bar. This follows the current S-Structures layout more closely than a separate right-side task column.

## 2. UX Rule

Only one task context should be visually dominant at a time.

That means:

- Modeling tools are visible in Modeling mode.
- Elastic result controls are visible in Elastic Analysis mode.
- Pushover and future nonlinear tools are visible in Nonlinear Analysis mode.
- Pen, eraser, image, and page note tools are visible in Tablet Memo mode.
- Common controls such as page navigation, undo/redo, view control, zoom, and status remain available globally.

## 3. Proposed Layout

### Top Bar

Keep the current blue S-Structures top bar style.

Recommended top bar zones:

1. Brand and page controls
   - S-Structures logo
   - previous page, page count, next page, new page

2. Main mode tabs
   - Modeling
   - Elastic Analysis
   - Nonlinear Analysis
   - Tablet Memo

3. Global commands
   - undo/redo
   - zoom
   - menu
   - save/export if needed

The current `select`, `draw`, `erase`, `image`, `structure` mode buttons should be absorbed into these main mode tabs:

- `structure` and structure tools -> Modeling
- current result controls -> Elastic Analysis
- future pushover/nonlinear tools -> Nonlinear Analysis
- `draw`, `erase`, `image` -> Tablet Memo

### Ribbon Menu

The current second bar should become a mode-aware ribbon menu.

It should show grouped controls for the active mode:

- Modeling:
  - 3D / plan / front / side
  - snap/workplane controls
  - active tool hint

- Elastic Analysis:
  - 3D / plan / front / side
  - active load combination
  - result scale
  - result step/player status when P-Delta is active

- Nonlinear Analysis:
  - analysis type selector
  - control node/member selection
  - load pattern
  - step/player status

- Tablet Memo:
  - pen color
  - pen width
  - free line / straight line
  - image insert

The ribbon should be horizontally scrollable on small screens, as the current top/sub bars already are. It should feel like the existing UI, not like a separate desktop application frame.

### Right Detail Area

Do not use the right side as the primary command menu.

The right-side area should remain a contextual detail surface for:

- selected node/member/load properties
- selected result details
- warnings or compact report summaries
- optional advanced setup forms when a ribbon command opens them

This keeps the canvas wide and preserves the existing S-Structures interaction style.

## 4. Mode Contents

### Modeling Mode

Purpose:
Create and edit the structure model using the existing modeler.

Ribbon groups:

1. Selection
   - select/move
   - box select
   - delete
   - copy story

2. Geometry
   - member draw
   - column add
   - add node / split
   - workplane

3. Supports
   - pin
   - roller
   - fixed
   - custom support later

4. Loads
   - nodal load
   - UDL
   - moment load
   - load case selector

5. Member properties
   - material
   - section
   - release
   - local axis
   - design role

Implementation note:
Reuse the existing `data-tool` buttons and property editing functions. Do not create a new modeler.

### Elastic Analysis Mode

Purpose:
Review linear elastic, P-Delta, modal/RSA, and design-check results through the original result visual language.

Ribbon groups:

1. Analysis run/status
   - run analysis
   - validation
   - warnings/errors
   - model summary

2. Load combination
   - active combination
   - edit combinations
   - envelope

3. Result display
   - deformation
   - M
   - Q
   - N
   - reaction
   - values
   - check ratio
   - node/member labels
   - length
   - local axes
   - design
   - deflection

4. Advanced elastic results
   - P-Delta enable
  - P-Delta internal iteration playback
   - modal result
   - response spectrum summary

5. Reports
   - design report
   - validation report
   - calculation HTML/export later

Implementation note:
These controls should drive the existing `[data-res]`, `comboSel`, `playerBar`, `statusTxt`, `statusChip`, `propResult`, and report modal. The separate `engineVisualControls` and `engineResultsDock` should not be visible by default.

### Nonlinear Analysis Mode

Purpose:
Provide pushover and future nonlinear workflows without cluttering the main modeler.

Ribbon groups:

1. Analysis type
   - pushover
   - future hinge analysis
   - future material/geometric nonlinear options

2. Pushover setup
   - direction
   - load pattern
   - control node
   - target displacement
   - step count
   - plastic hinge assumptions

3. Run and monitor
   - run pushover
   - convergence state
   - current step
   - warnings

4. Result review
   - capacity curve
   - hinge state
   - step playback
   - selected member hinge details

5. Report
   - pushover summary
   - hinge table
   - export later

Implementation note:
The current `indexPushoverPanel.js` can be reused as logic/view-model code, but its floating dock should become a ribbon-launched native report/detail panel. It should not appear as a default bottom-left button.

### Tablet Memo Mode

Purpose:
Keep the existing tablet note workflow clear and separate from structural modeling.

Ribbon groups:

1. Pen tools
   - free pen
   - straight line
   - color
   - width

2. Eraser
   - erase stroke
   - clear memo on page

3. Image
   - insert image
   - resize/move image

4. Page note workflow
   - new page
   - export page image/PDF

Implementation note:
Current `draw`, `erase`, and `image` modes should move under this tab. Structural modeling should not expose pen controls unless Tablet Memo is active.

## 5. State Contract

Add a native UI state layer:

```js
uiMode: 'modeling' | 'elastic' | 'nonlinear' | 'memo'
ribbonCollapsed: boolean
activeRibbonGroup: string
```

This state should be reflected in:

- top mode tab active class
- visible ribbon groups
- selected detail area content
- agent `getScreenState()`

Agent-facing actions:

```js
setUiMode({ mode })
setRibbonCollapsed({ collapsed })
setNativeResultToggle({ key, value })
setNativeTool({ tool })
```

These actions should operate the existing UI state first, not replace it with a parallel model.

## 6. Migration From Current M22-M30 Plan

This plan should be inserted before deep result integration.

Recommended updated sequence:

### M22A - Hide Experimental Floating UI

Default page hides:

- `engineVisualControls`
- `engineResultsToggle`
- `engineResultsDock`
- `enginePushoverToggle`
- `enginePushoverPanel`

They can remain available behind a dev query flag for testing.

### M22B - Main Mode Tabs

Add top mode tabs:

- Modeling
- Elastic Analysis
- Nonlinear Analysis
- Tablet Memo

Mode switching should not break existing modeling, drawing, result rendering, or report behavior.

### M22C - Native Ribbon Skeleton

Create the mode-aware ribbon menu directly below the top bar.

At this step, the old palette may still exist internally, but the default visible user workflow should be the top mode tabs plus the native ribbon.

### M22D - Native Elastic Ribbon

Move result controls into the Elastic Analysis ribbon and bind them to existing `[data-res]` controls.

### M22E - Native Nonlinear Ribbon

Move pushover setup/result entry points into the Nonlinear Analysis ribbon. Detailed pushover curves and hinge tables can open in a native modal/detail surface.

### M22F - Browser E2E

Create browser checks for:

- default page has no duplicate floating result controls
- Modeling tab shows modeling ribbon groups
- Elastic Analysis tab shows result ribbon groups
- Nonlinear Analysis tab shows pushover ribbon groups
- Tablet Memo tab shows pen/image ribbon groups
- original canvas and model remain active

## 7. Acceptance Criteria

The milestone is complete when:

- The first screen still feels like the existing S-Structures app.
- The user sees four clear top-level work modes, not a long row of unrelated toggles.
- The ribbon changes by mode.
- Existing modeling tools still modify the same `index.html` model.
- Existing result buttons are not duplicated by new engine buttons.
- Pushover and advanced results are available only when the user enters Nonlinear Analysis.
- Agent screen state can identify active mode, visible ribbon groups, selected tool, and result display state.
