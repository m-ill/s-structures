# M26 Native Modeler E2E Contract

Date: 2026-06-26

## Goal

Prove that the product workflow uses the existing `index.html` modeler controls as the native modeling surface.

## Codebase Review

- Before M26, direct agent modeling actions could mutate the live model, but they did not first select the original palette tools.
- The original UI already exposes stable tool controls through `data-tool`.
- Runtime diagnostics can already compare the original `model()` result with the engine model.
- The missing layer was a native workflow adapter that ties original tool selection, live model mutation, and `reanalyze()` together.

## Implementation

- Added `src/ui/indexNativeModeler.js`.
- Installed it from `installIndexEngineBridge()`.
- Added native modeler state to agent snapshots and screen state.
- Added native workflow actions:
  - `nativeClearPage`
  - `nativeSelectTool`
  - `nativeDrawMember`
  - `nativeAddColumn`
  - `nativeSetSupport`
  - `nativeAddUdl`
  - `nativeAddNodalLoad`
  - `nativeMoveNode`
  - `nativeSelectMember`
  - `nativeDeleteElement`
- Added `tests/helpers/fakeIndexDom.mjs` so product-facing tests can exercise the original DOM contracts without the prototype UI.
- Added `tests/m26-native-modeler-e2e.mjs`.

## Acceptance Check

- The test starts from a cleared live model.
- It selects existing palette tools for column, member, support, UDL, nodal load, move/select, and delete.
- It builds a small frame, applies loads, moves a node, selects a member, deletes a load, and reanalyzes through the bridge.
- Existing result toggles call the original draw path.
- Final analysis is non-empty and runtime model counts match engine model counts.

## Verification

- `npm.cmd run test:m26`
