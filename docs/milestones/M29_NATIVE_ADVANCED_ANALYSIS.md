# M29 Advanced Analysis Native UX

Date: 2026-06-26

## Goal

Advanced analysis should be discoverable from the native UI and report through the existing modal/report surface, not through default floating docks.

## Codebase Review

- Pushover calculation existed and the nonlinear ribbon had a run control.
- Modal/RSA data existed in the analysis result.
- The gap was native report presentation: advanced results needed to render into the existing `reportModal` / `reportBody`.
- Experimental panels must remain hidden unless explicitly enabled.

## Implementation

- Added `src/ui/indexNativeAdvancedAnalysis.js`.
- Installed it from `installIndexEngineBridge()`.
- Added `nativeAdvancedAnalysis` to snapshot and screen state.
- Added agent actions:
  - `runNativePushoverReport`
  - `showNativeModalReport`
- Pushover reports are marked preliminary and include capacity-curve rows.
- Modal/RSA reports include mode summary rows in the original report modal.
- Added `tests/m29-native-advanced-analysis.mjs`.

## Acceptance Check

- No default advanced dock appears.
- Pushover report opens in the existing report modal.
- Modal/RSA report opens in the existing report modal.
- Pushover remains clearly marked preliminary.
- Native advanced state reports the last advanced view and report modal state.

## Verification

- `npm.cmd run test:m29`
