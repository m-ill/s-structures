# M24 legacy result shape compatibility report

Date: 2026-06-26

## Scope

M24 makes the new analysis engine produce the result fields expected by the original S-Structures canvas/report workflow. The goal is to keep the original modeling surface and result toggles usable while the engine internals continue to evolve.

## Codebase review

- The original `index.html` result renderer reads direct result fields such as `disp`, `memberResults`, `reactions`, `dmax`, and design check summaries.
- The engine bridge already replaced `analyzeModel`, but it only guaranteed the modern engine shape.
- The runtime adapter can inspect original UI state, so result compatibility should be exposed there instead of adding another panel.
- Browser-side UI work must stay conservative because `index.html` is compacted and high risk to edit directly.

## Implementation

- Added `INDEX_LEGACY_RESULT_SHAPE_VERSION`.
- Normalized each result set with original-compatible aliases:
  - `disp`, `nodeDisplacements`, `displacements`
  - `memberResults.*.N/Vy/Vz/Tq/My/Mz`
  - `memberResults.*.values`, `shear`, `moments`, `axial`
  - `reactions.*.rx/ry/rz/rmx/rmy/rmz`
  - `reactions.*.values`, `force`, `moment`, `RMx/RMy/RMz`
- Added result summaries for `maxDisplacement`, `maxRatio`, `maxUtilization`, `okCount`, and `ngCount`.
- Added `legacyShape` on every normalized result set and `legacyResultShape` on the full analysis output.
- Added runtime diagnostics so agent/API snapshots can report whether the active result is compatible.
- Added manifest entries for the compatibility contract and M24 milestone.

## Verification

Automated:

```powershell
npm.cmd run test:m24
npm.cmd run test
```

Browser:

- Opened `http://127.0.0.1:5173/index.html`.
- Confirmed original S-Structures page loads.
- Confirmed the original result toggles include `def`, `M`, `Q`, `N`, `react`, `chk`, `design`, and `defl`.
- Confirmed the bridge module script is present on the original page.
- Confirmed status text updates on the original screen without extra default panels.
- Browser warnings/errors were empty for the checked page load.

## Acceptance

- Original result toggles can read the new engine result shape.
- Design report data uses the new engine output.
- Validation report data uses the new validation output.
- Reanalysis updates original status/result state through the bridge.
