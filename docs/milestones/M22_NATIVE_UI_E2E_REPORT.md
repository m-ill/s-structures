# M22 Native UI E2E Report

Date: 2026-06-26

## Scope

M22 verifies that the existing `index.html` modeler remains the main product UI while the new native ribbon provides four large work tabs:

- Modeling
- Elastic Analysis
- Nonlinear Analysis
- Tablet Memo

## Browser Target

- URL: `http://127.0.0.1:5173/index.html`
- Browser: in-app browser
- Test method: real DOM inspection plus coordinate clicks on visible controls

## Checks

| Check | Result |
| --- | --- |
| Native top mode tabs render | PASS |
| Modeling tab shows modeling ribbon tools | PASS, 12 tool proxies visible |
| Elastic Analysis tab shows result controls | PASS, 14 result toggles visible |
| Nonlinear Analysis tab shows pushover controls | PASS |
| Tablet Memo tab shows memo controls | PASS, 4 mode proxies visible |
| Experimental floating result controls hidden by default | PASS |
| Pushover run updates status and curve graph | PASS |
| Unit and integration test suite | PASS |
| Code-scope forbidden string check | PASS |

## Observed Browser Results

- Nonlinear tab activation set `body[data-ss-active-mode]` to `nonlinear`.
- Pushover run produced status: `OK · 9 step · V=10.0 · Δ=0.001`.
- Pushover curve rendered an inline SVG in `#ssPushoverCurve`.
- No default-visible experimental controls were found for:
  - `#engineVisualControls`
  - `#engineResultsToggle`
  - `#enginePushoverToggle`
  - `#engineResultsDock`

## Mode Switching Results

| Clicked Mode | Active Panels | Visible Mode-Specific Controls |
| --- | --- | --- |
| Modeling | `common`, `modeling` | 12 modeling tools |
| Elastic Analysis | `common`, `elastic` | 14 result toggles |
| Nonlinear Analysis | `common`, `nonlinear` | pushover setup, run, curve |
| Tablet Memo | `common`, `memo` | 4 memo mode commands |

## Review Notes

- The original modeler remains intact. Ribbon buttons proxy existing controls or move existing DOM controls instead of replacing the modeler.
- The nonlinear ribbon uses the bridge pushover API directly, so the old floating pushover panel is no longer required for the default UI.
- The browser automation context could not reliably read page-level custom globals, but the same UI event handlers executed successfully through real clicks. Agent API behavior is covered by `tests/m19-agent-screen-control.mjs`.
