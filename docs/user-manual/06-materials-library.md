# 06 Materials Library

## Project Library

Open `#/p/:projectId/library` to list and save project material records.
Records are versioned as `id@version`. Existing versions are append-only unless
the incoming record is identical.

## Material Fields

- `E`, `G`: elastic moduli
- `Fy`, `Fu`: steel strength values
- `version`: explicit project record version
- `source`: optional review trace

## Agent Actions

Agents can call `listLibrary`, `getLibraryItem`, `upsertMaterial`, and
`upsertSection`. Agents must preserve versioned references and avoid silently
changing a member's referenced material or section.
