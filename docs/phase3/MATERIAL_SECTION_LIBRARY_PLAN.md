# Phase 3 Material And Section Library Plan

status: active
milestone: P3-M10

## Goal

Replace fixed catalog-style material and section lookup with a versioned library that can be used by elastic analysis, nonlinear analysis, design traces, calculation reports, and AI agents. The library must keep old model references stable while allowing project-specific custom materials and sections.

## Material Schema

```js
{
  id: 'SS275',
  version: 2,
  name: 'SS275 structural steel',
  kind: 'steel' | 'concrete' | 'timber' | 'custom',
  elastic: { E, G, nu, rho, alpha },
  strength: {
    steel: { Fy, Fu },
    concrete: { fck, fy_rebar },
    custom: {}
  },
  nonlinear: {
    model: 'bilinear' | 'trilinear' | 'table',
    backbone: [{ strain, stress }],
    hardeningRatio: 0.02,
    ultimateDuctility: 9
  },
  damping: { ratio: 0.05 },
  source: { standard: 'KS D 3503', note: null }
}
```

Required validation:

| Kind | Required fields |
| --- | --- |
| steel | `elastic.E`, `elastic.G`, `strength.steel.Fy`, `strength.steel.Fu` |
| concrete | `elastic.E`, `elastic.G`, `strength.concrete.fck` |
| custom | positive elastic values and explicit source note when available |

## Section Schema

```js
{
  id: 'H-400x200x8x13',
  version: 1,
  kind: 'db' | 'parametric' | 'direct',
  shape: 'H' | 'BOX' | 'PIPE' | 'RECT' | 'CIRC' | 'CUSTOM',
  params: { H, B, tw, tf },
  properties: { A, Iy, Iz, J, Zy, Zz, Sy, Sz, ry, rz },
  designMeta: { compactnessClass: null, rebar: null },
  source: { db: 'KS-H-2024' }
}
```

| Section kind | Rule |
| --- | --- |
| db | use seeded KS table values from `src/materials/db/ksH.js` |
| parametric | calculate properties from shape parameters in `src/materials/sectionProperties.js` |
| direct | accept user values but report physical-consistency warnings such as invalid radius values |

## Versioned Registry

| Rule | Requirement |
| --- | --- |
| Reference format | model members reference `material: 'SS275@2'` and `section: 'H-400x200x8x13@1'` |
| Append-only edits | changed records for an existing `id@version` are rejected; edited items must create a new version |
| Scope priority | project scope overrides global scope, which overrides built-in scope |
| Soft delete | deleted rows are blocked for new resolution but old model references remain traceable |
| Report trace | calculation reports show `id@version`, scope, standard/db, and source note |
| Legacy migration | unversioned references resolve to the latest valid version and emit a warning |

## Module Layout

```text
src/materials/
  materialSchema.js
  sectionSchema.js
  sectionProperties.js
  registry.js
  db/ksH.js
  libraryReport.js
  libraryEdit.js
```

`src/core/catalogs.js` compatibility is preserved through built-in defaults and registry resolution.

## UI And Agent Actions

The UI should expose a library panel with list, filter, edit, validation warning, and version-history views. The AI-agent contract must expose the same operations:

| Agent action | Purpose |
| --- | --- |
| `listLibrary` | list materials and sections with version labels |
| `getLibraryItem` | inspect one `id@version` item |
| `upsertMaterial` | add a new material version |
| `upsertSection` | add a new section version |

## Verification

1. `tests/p3-m10-materials.mjs` verifies schemas, registry resolution, legacy migration warnings, scope priority, append-only behavior, agent actions, and server-backed project storage.
2. `tests/p3-section-properties.mjs` verifies parametric H-section properties against the seeded KS H table.
3. Calculation reports must expose source trace with `id@version`.
4. Material-library review stays preliminary until the office-grade KS database and owner catalog policy are approved.
