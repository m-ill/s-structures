# M23 Runtime Adapter E2E Report

Date: 2026-06-26

## Scope

M23 adds a read-only adapter for the original `index.html` runtime. The adapter treats the original page as the source of truth for model, result, view, toolbar, player, and modal state.

This pass also fixes the native ribbon so it wraps instead of requiring horizontal scrolling.

## Automated Checks

| Check | Result |
| --- | --- |
| Full test suite through M23 | PASS |
| Code-scope forbidden string check | PASS |
| Runtime adapter unit test | PASS |
| Manifest exposes M23 adapter contract | PASS |

## Browser Checks

Target: `http://127.0.0.1:5173/index.html`

| Browser Check | Result |
| --- | --- |
| Modeling ribbon does not horizontally overflow | PASS |
| Elastic ribbon does not horizontally overflow | PASS |
| Elastic result toggles are all visible after wrapping | PASS, 14 toggles |
| Native ribbon uses multi-row layout when needed | PASS |
| Original modeler tool state remains connected | PASS |
| Console warnings/errors | PASS, none observed |

## Observed Layout Metrics

Modeling mode:

- `#subbar.clientWidth`: 1280
- `#subbar.scrollWidth`: 1280
- `#ssNativeRibbon.clientWidth`: 1264
- `#ssNativeRibbon.scrollWidth`: 1264
- Horizontal overflow: false

Elastic mode:

- `#subbar.clientWidth`: 1280
- `#subbar.scrollWidth`: 1280
- Elastic panel `clientWidth`: 1264
- Elastic panel `scrollWidth`: 1264
- Visible result toggles: 14
- Horizontal overflow: false

## Runtime Adapter Coverage

The adapter reads:

- runtime function availability: `model`, `reanalyze`, `draw`, `activeResult`
- current page label/count
- model counts
- active load combination
- active result summary
- result toggle state
- view mode
- active modeling tool
- player state
- report modal state
- palette state
- status text/chip
- runtime model versus engine model count consistency

## Review Notes

- The adapter is read-only and avoids mutating original model data.
- Native ribbon buttons still proxy or move original controls instead of replacing the original modeler.
- The original `[data-tool="member"]` control became active after clicking the native member command, confirming that the original tool state remains connected.
