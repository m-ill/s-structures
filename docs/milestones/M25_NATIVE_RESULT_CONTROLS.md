# M25 Native Result Control Integration

Date: 2026-06-26

## Goal

Advanced result controls should use the original S-Structures UI surface instead of adding another default result panel.

## Codebase Review

- The M22 ribbon integration already moves the original result controls into the Elastic tab.
- M24 normalized engine output to the fields consumed by the original result renderer.
- The missing product link was advanced result control: P-Delta steps, scale changes, and selected-member result details still needed a native UI contract.
- During review, the P-Delta ribbon button had a potential double-binding path between the ribbon module and the result-control module. M25 keeps the action binding in the result-control module so one click maps to one state change.

## Implementation

- Added `src/ui/indexNativeResultControls.js`.
- Installed native result controls from `installIndexEngineBridge()` after the native ribbon is created.
- Added Elastic ribbon controls for:
  - `ssNativePDeltaToggle`
  - `ssNativeResultScale`
- Mapped P-Delta step playback to the existing `playerBar`, `plSlider`, `plPrev`, `plNext`, `plPlay`, and `plClose` elements.
- Mapped result scale to the existing `setExag` control and the native Elastic ribbon scale selector.
- Rendered selected-member force/design detail into the existing `propPanel` / `propResult` area.
- Extended agent snapshot/screen state with `nativeResultControls`.
- Added agent actions:
  - `setNativePDeltaEnabled`
  - `setNativePDeltaStep`
  - `setNativeResultScale`
  - `showNativeMemberResult`

## Acceptance Check

- One default result-control system remains visible: the original toolbar/ribbon system.
- P-Delta playback uses the original player UI.
- Selected-member result details render in the existing property/result panel.
- Experimental result and pushover panels remain unavailable unless the experimental UI flag is used.

## Verification

- `npm.cmd run test:m25`
- `npm.cmd run test:m22`
- `npm.cmd run test:m24`

## Next Milestone

M26 should prove that the real existing modeler is connected by running E2E flows for drawing, editing, loading, selecting, deleting, and then reanalyzing through the original `index.html` UI.
