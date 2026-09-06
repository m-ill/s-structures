# M27 Native Persistence Unification

Date: 2026-06-26

## Goal

Stop sample-model drift by making the original `index.html` startup model, export book, import, and autosave restore resolve to the same product model signature.

## Codebase Review

- The original page has its own `initSample()` startup model.
- Engine tests historically used `createPortalFrameSample()`, which is useful for solver tests but should not be the product fixture.
- Autosave uses the existing `s-structures-autosave-v3` key and wraps page data in a book-like payload.
- The missing integration was a product-level fixture and import/export normalizer that accepts raw models, book payloads, and autosave payloads.

## Implementation

- Added `src/examples/indexStartupSample.js`.
- Added `src/ui/indexNativePersistence.js`.
- Exported the startup sample from `src/index.js`.
- Installed native persistence from `installIndexEngineBridge()`.
- Added agent snapshot/screen-state field `nativePersistence`.
- Added agent actions:
  - `loadNativeExample`
  - `exportNativeBook`
  - `importNativeBook`
  - `saveNativeAutosave`
  - `restoreNativeAutosave`
- Added `tests/m27-native-persistence.mjs`.

## Acceptance Check

- The product startup fixture analyzes successfully.
- Raw model JSON, product book, and autosave payload extract to the same model signature.
- Loading the native example updates the live model and reanalyzes.
- Export/import round trip keeps node/member/load counts and ids stable.
- Autosave save/restore uses the original autosave key and restores the same model signature.

## Verification

- `npm.cmd run test:m27`
