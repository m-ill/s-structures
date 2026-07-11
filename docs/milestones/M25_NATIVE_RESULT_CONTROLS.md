# M25 Native Result Control Integration

Date: 2026-06-26

## Goal

Advanced result controls should use the original S-Structures UI surface instead of adding another default result panel.

## Codebase Review

- The M22 ribbon integration already moves the original result controls into the Elastic tab.
- M24 normalized engine output to the fields consumed by the original result renderer.
- The missing product link was advanced result control: P-Delta internal step playback, scale changes, and selected-member P-Delta contribution details still needed a native UI contract.
- During review, the P-Delta ribbon button had a potential double-binding path between the ribbon module and the result-control module. M25 keeps the action binding in the result-control module so one click maps to one state change.

## Implementation

- Added `src/ui/indexNativeResultControls.js`.
- Installed native result controls from `installIndexEngineBridge()` after the native ribbon is created.
- Added Elastic ribbon controls for:
  - `ssNativeResultScale`
- Mapped P-Delta internal iteration playback to the existing `playerBar`, `plSlider`, `plPrev`, `plNext`, `plPlay`, and `plClose` elements.
- Mapped result scale to the existing `setExag` control and the native Elastic ribbon scale selector.
- Rendered selected-member force/design detail into the existing `propPanel` / `propResult` area.
- Rendered selected-member P-Delta contribution as a floating canvas dock, using load factor `λ` versus `Nδ/L` instead of iteration history.
- Added a member P-Delta combo selector so overlapping CO1/SLS1 curves can be reviewed as `All combos` or one combo at a time.
- Labeled the member P-Delta panel as diagnostic only; design values come from final second-order member forces and story stability summary.
- Extended agent snapshot/screen state with `nativeResultControls`.
- Added agent actions:
  - `setNativePDeltaEnabled`
  - `setNativePDeltaStep`
  - `setNativeResultScale`
  - `showNativeMemberResult`

### Phase 7 UI consolidation

- Removed the legacy `ssNativePDeltaToggle` from the visible ribbon after the unified elastic result popup was introduced.
- P-Delta results now open from the `P-Delta` result shortcut beside the other elastic result kinds.
- The native result-control API and agent actions remain available for compatibility; only the duplicate visible button and its dead binding path were removed.

## Acceptance Check

- One default result-control system remains visible: the original toolbar/ribbon system.
- P-Delta internal playback uses the original player UI.
- Selected-member P-Delta dock shows member contribution, not the global response curve.
- Selected-member P-Delta graphs can be separated by result combination when multiple P-Delta combinations exist.
- The dock makes clear that member `Nδ/L` is diagnostic, while design checks use final second-order forces.
- Selected-member result details render in the existing property/result panel.
- Experimental result and pushover panels remain unavailable unless the experimental UI flag is used.

## Verification

- `npm.cmd run test:m25`
- `npm.cmd run test:m22`
- `npm.cmd run test:m24`

## Next Milestone

M26 should prove that the real existing modeler is connected by running E2E flows for drawing, editing, loading, selecting, deleting, and then reanalyzing through the original `index.html` UI.
