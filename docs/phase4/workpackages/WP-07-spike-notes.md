# WP-07 Spike Notes

date: 2026-07-03
status: decision recorded, first host wiring started
scope: P4-M7 / P4-T33 before validation or beta work

## Decision

Use iframe isolation for the first product shell integration.

The shell route `#/p/:projectId/modeler` now mounts `index.html` as:

```text
./index.html?shell=1&project=<projectId>&storage=server
```

The local route `#/local/modeler` mounts:

```text
./index.html?shell=1&project=local-model&storage=local
```

This keeps the existing index entry point intact while giving the Phase 4 shell a real modeler surface instead of a placeholder.

## Why iframe First

1. `index.html` still owns a large inline runtime and boots its own native state.
2. The existing bridge modules already expect browser globals such as `model`, `reanalyze`, `activeResult`, and `draw`.
3. Same-document mounting would require a broad refactor into `initNativeModeler(container, options)` before product flow can be tested.
4. iframe isolation lets WP-07 proceed without risking regressions in the standalone index workflow.

## Runtime Globals Observed

The native index entry exposes or relies on these stable globals:

| Global | Purpose |
| --- | --- |
| `window.SStructuresNativeRuntime` | stable wrapper around native runtime functions |
| `window.model()` | returns current live model |
| `window.reanalyze(force)` | reruns analysis and redraw state |
| `window.activeResult()` | returns active analysis result |
| `window.draw()` | redraws the native canvas/view |
| `window.SStructuresEngine` | engine bridge installed by `src/ui/indexBridge.js` |
| `window.SStructuresAgent` | agent API for model, analysis, UI, and report commands |
| `window.SStructuresRuntimeAdapter` | runtime diagnostics for AI and product audit |
| `window.SStructuresNativeModeler` | native modeling command surface |
| `window.SStructuresNativePersistence` | local example/book/autosave surface |
| `window.SStructuresAgentCommandBridge` | postMessage command channel already used by index |

## DOM Dependencies Observed

The current native workflow expects these important DOM anchors:

| DOM id / selector | Purpose |
| --- | --- |
| `#topbar` | top mode tabs and native ribbon area |
| `#subbar` | view, combo, result toggles |
| `#palette` | left modeling tool palette |
| `[data-tool]` | native modeler command buttons |
| `[data-view]` | view mode controls |
| `[data-res]` | result visualization toggles |
| `#comboSel` | active load combination selector |
| `#statusTxt`, `#statusChip` | runtime status display |
| `#pageInfo` | current page indicator |
| `#playerBar` | pushover / step playback bar |
| `#reportModal`, `#reportBody` | report modal output |
| `#menuDrop` | legacy index menu commands |

## Integration Boundary

The shell owns:

1. login/session state
2. project id and route state
3. server revisions
4. import review and report routes

The iframe owns:

1. canvas/modeling UI
2. existing native ribbon and palette behavior
3. current live model until the server bridge is added
4. local autosave/book import/export behavior

The next bridge should pass only versioned messages across the boundary. It should not reach into iframe internals directly.

## Next Steps

1. Add `src/app/modelerBridge.js` with a versioned postMessage envelope.
2. Teach `modelerHost` to request snapshot, set model, and save current model through the iframe bridge.
3. Add server-backed Ctrl+S and autosave only after the message bridge is covered by tests.
4. Keep standalone `index.html` green throughout WP-07.

## Result

The placeholder shell modeler was replaced with an iframe host in `src/app/modelerHost.js`. The shell test now verifies that both local and project routes mount the native modeler frame and preserve the standalone link.
