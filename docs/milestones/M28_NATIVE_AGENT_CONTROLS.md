# M28 Agent Control On Native UI

Date: 2026-06-26

## Goal

Agent and computer-use workflows should control the real S-Structures UI first: palette tools, result toggles, combination selector, load-combination modal, report modal, and validation command.

## Codebase Review

- M26 added native modeler actions, but screen-level controls still needed a native DOM control layer.
- Runtime diagnostics already expose active tool, active combination, result toggles, report modal, player, and palette state.
- The missing layer was command routing through `data-agent-id`, original result toggles, and existing menu buttons.

## Implementation

- Added `src/ui/indexNativeAgentControls.js`.
- Installed it from `installIndexEngineBridge()`.
- Added `nativeAgentControls` to snapshot and screen state.
- Added agent actions:
  - `clickNativeControl`
  - `setNativeResultToggle`
  - `setNativeCombo`
  - `openNativeLoadCombinations`
  - `openNativeDesignReport`
  - `runNativeValidation`
- Extended test shell with `lcModal`.
- Added `tests/m28-native-agent-controls.mjs`.

## Acceptance Check

- Agent can click a native mode tab through `data-agent-id`.
- Agent can toggle original result buttons and trigger the draw path.
- Agent can set the existing combination selector and reanalyze.
- Agent can open original load-combination/report locations.
- Agent screen state reports active tool, active combo, result toggles, and native controls.

## Verification

- `npm.cmd run test:m28`
