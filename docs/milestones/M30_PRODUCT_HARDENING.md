# M30 Product Hardening

Date: 2026-06-26

## Goal

Stabilize the integrated product surface so nonlinear and design expansion can continue on top of the original S-Structures modeler.

## Codebase Review

- M22-M29 restored the original `index.html` UI as the product surface and moved engine features behind native UI contracts.
- The remaining risk was integration drift: duplicate panels could reappear, agent ids could collide, or engine/model state could diverge.
- The product needed one audit that checks default UI, native modules, model consistency, and medium-model analysis performance.

## Implementation

- Added `src/ui/indexProductHardening.js`.
- Installed it from `installIndexEngineBridge()`.
- Added `productHardening` to snapshot and screen state.
- Added agent action:
  - `runNativeProductAudit`
- Added visual contract checks for desktop/tablet UI structure:
  - topbar
  - subbar
  - native mode tabs
  - native ribbon
  - collapsible palette
  - required native controls
- Added medium-model performance check.
- Added `tests/m30-product-hardening.mjs`.

## Acceptance Check

- Default duplicate engine panels are not visible.
- Existing modeler/native modeler remains the product modeling surface.
- Runtime model counts match engine model counts.
- Native result, persistence, agent controls, and advanced report modules are installed.
- Agent ids do not collide.
- Medium frame analysis completes under the test threshold.

## Verification

- `npm.cmd run test:m30`
- Full suite: `npm.cmd run test`
