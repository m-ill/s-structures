# Index-First Rebase Milestones

Date: 2026-06-26

## 1. Decision

The product UI must be the existing `index.html` application.

The matrix solver, design checks, P-Delta, modal/RSA, pushover, report, and agent API work can stay, but they must be attached to the existing S-Structures modeler instead of creating a parallel modeling surface or parallel result UI.

Current M0-M21 work should be treated as engine/prototype assets, not as a finished product integration.

## 2. Current Audit

### What is already in `index.html`

- Existing 3D structure modeling tools are present in the original palette:
  `smove`, `member`, `boxsel`, `column`, `addnode`, `pin`, `roller`, `fixed`, `pload`, `udl`, `mload`, `sdelete`.
- Existing result controls are already present in the original second toolbar:
  `def`, `M`, `Q`, `N`, `react`, `val`, `T`, `chk`, `nid`, `mid`, `len`, `axes`, `design`, `defl`.
- Existing result visualization already draws on the original canvas:
  deformed shape, loads, utilization/check values, labels, reactions, diagrams, and step playback.
- Existing report and validation flows already exist:
  load combinations modal, design report modal, validation report, settings, MGT export, image/PDF export, autosave/import.
- The original page initializes its own built-in example model through `initSample()` when no autosave is restored.

### What went wrong in the M9-M21 UI integration

- `src/ui/m3App.js` and `src/ui/m3State.js` are a separate prototype app. They are useful for engine tests, but they are not the product modeler.
- Many tests use `createPortalFrameSample()` directly, so they prove the engine works on a sample model but do not prove that the real `index.html` modeling workflow is connected.
- `indexBridge.js` wraps `analyzeModel()` and `validateModel()`, but later milestones added new floating UI instead of integrating with the original result controls.
- `indexResultOverlay.js` adds a second result-control strip: `Deform`, `Ratio`, `Loads`, `Reactions`, `Mode`, `P-Delta`.
- `indexResultsPanel.js` adds a separate `Results` dock instead of using the original result toolbar, status area, report modal, and member property result area.
- `indexPushoverPanel.js` adds a separate `Pushover` dock instead of being launched from the existing menu/report workflow.
- The browser audit shows the original result controls and new overlay controls visible at the same time. This creates duplicate UI and makes the product feel disconnected.

## 3. Rebase Rules

1. Do not replace the existing `index.html` modeler.
2. Do not add default-visible floating result UI over the modeler.
3. Use the original `model()`, `reanalyze()`, `draw()`, `activeResult()`, result toggles, `comboSel`, `playerBar`, `propResult`, `statusTxt`, `statusChip`, and report modal as the first integration targets.
4. Keep new engine modules in `src/` as calculation services.
5. Keep prototype UI files only as lab/demo code unless explicitly used by tests.
6. Every product milestone must include a browser E2E test against `index.html`, not only module tests.
7. New agent controls must operate through existing UI/state contracts first. Direct model replacement is allowed only as an import/set-model API, not as the normal modeling path.

## 4. New Milestone Sequence

### M22 - UI Stabilization And Feature Gate

Goal: restore the original `index.html` as the clean default product surface.

Scope:
- Hide or feature-gate new overlay controls, result dock, and pushover dock from the default page.
- Keep engine bridge installed only where it does not visibly alter the original UX.
- Add a dev flag such as `?engine_ui=1` for experimental panels.
- Preserve current engine tests, but mark non-native panels as lab UI.

Acceptance:
- Opening `index.html` shows the original modeler with no extra `Deform/Ratio/Loads` strip and no extra `Results/Pushover` buttons by default.
- Existing toolbar result buttons still work.
- Existing sample model loads through the original startup path.
- No console warning/error in the default page.

### M23 - Original Index Runtime Adapter

Goal: make the bridge understand the original page as the source of truth.

Scope:
- Build an adapter around the original runtime functions and DOM:
  `model`, `reanalyze`, `draw`, `activeResult`, `comboSel`, result buttons, player state, report modal.
- Expose read-only adapter diagnostics:
  current page, model counts, active combination, active result, result toggles, view mode, player state.
- Avoid changing the original model data directly except through existing UI-compatible paths.

Acceptance:
- Adapter can read the current model after drawing/editing in `index.html`.
- Adapter can verify that engine model counts match the visible model.
- Browser E2E confirms original palette tools remain usable.

### M24 - Legacy Result Shape Compatibility

Goal: the new engine must feed the existing result renderer.

Scope:
- Normalize engine output to the exact result fields consumed by the original canvas/report code:
  `disp`, `nodeDisplacements`, `memberResults`, `reactions`, `envelope`, `summary`, design check fields.
- Add compatibility tests using a model produced by the original `index.html` startup sample, not only `createPortalFrameSample()`.
- Confirm `reanalyze()` updates the original status and result drawing without extra UI layers.

Acceptance:
- Original `def/M/Q/N/react/chk/design/defl` toggles render from the new engine result.
- Existing design report uses new engine result data.
- Existing validation report uses new validation data.

### M25 - Native Result Control Integration

Goal: advanced results must be controlled through the original result toolbar and existing report locations.

Scope:
- Map P-Delta, modal/RSA, and result scale controls to existing `playerBar`, `comboSel`, and result toggles.
- Reuse the original status chip and property panel result area for selected-member details.
- Remove duplicated default controls for deformation, utilization, loads, and reactions.

Acceptance:
- One visible result-control system exists: the original toolbar.
- P-Delta internal iteration playback uses the original player UI.
- Selecting a member shows result/design details in the existing property/result panel.

### M26 - Existing Modeler E2E

Goal: prove the real modeling workflow is connected.

Scope:
- Browser E2E for:
  create/clear page, draw member, add column, add support, add UDL, add nodal load, move node, select member, delete element.
- After each edit, verify `model()` changes and `reanalyze()` updates results.
- Use existing UI controls, not `src/ui/m3App.js`.

Acceptance:
- E2E can build a small frame from the original UI and get a non-empty analysis result.
- Result toggles draw on the original canvas after user-like modeling actions.

### M27 - Example, Save, Import, And Autosave Unification

Goal: stop sample-model drift.

Scope:
- Treat `index.html` startup sample and imported/autosaved book data as official product fixtures.
- Add fixtures exported from the original page.
- Keep `createPortalFrameSample()` only as an engine unit-test helper unless explicitly aligned with the original sample.

Acceptance:
- Default example, exported JSON, imported JSON, and autosave restore all analyze to matching model/result summaries.
- No product E2E depends solely on generated test-only samples.

### M28 - Agent Control On Native UI

Goal: AI/computer-use control must operate the real UI.

Scope:
- Stable `data-agent-id` on existing controls and result buttons.
- Agent read APIs return native screen state:
  active tool, selected entity, visible panels, active result toggles, active combo, player state.
- Agent actions should prefer existing control paths:
  select tool, click model, set result toggle, open load combinations, open report, run validation.

Acceptance:
- Agent can create or modify a small model through native controls.
- Agent can open old result/report UI and read state without relying on new floating panels.

### M29 - Advanced Analysis Native UX

Goal: advanced analysis features enter the old UX cleanly.

Scope:
- Pushover is launched from a native menu/report workflow, not a default floating dock.
- Pushover curve and hinge state render in a native modal/report panel.
- Modal/RSA results render in native result/report locations.
- Nonlinear state remains clearly marked as preliminary until tangent/hysteresis behavior is implemented.

Acceptance:
- Advanced analysis is discoverable from the existing menu structure.
- No advanced panel appears by default.
- Reports and charts follow the original S-Structures visual language.

### M30 - Product Hardening

Goal: make the integrated product stable enough to continue nonlinear and design expansion.

Scope:
- Visual regression screenshots for default desktop and mobile.
- Browser E2E for modeling, results, report, import/export, autosave.
- Performance checks for medium models.
- Documentation cleanup: mark prototype docs and lab UI clearly.

Acceptance:
- Default UI has no duplicated controls.
- Existing modeler is the only product modeling surface.
- Engine results, reports, and agent APIs all reference the same live model.
- Full test suite plus browser E2E passes.

## 5. Immediate Next Step

Implement M22 first.

M22 is a cleanup/stabilization milestone, not a new feature milestone. It should make the app usable again by restoring the original `index.html` default UI and moving the new floating panels/overlay controls behind a feature flag.
