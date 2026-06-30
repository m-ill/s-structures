# P2-MVP-S4 Story Model Foundation

status: implemented for T07

## Scope

This slice adds the first part of P2-MVP-S4: a shared story object contract. Member release hardening and rigid diaphragm constraints remain separate follow-up slices.

## Implemented Contract

| Item | Result |
| --- | --- |
| Story level detection | `getStoryLevels(model)` derives base level and story top elevations from node z coordinates |
| Story objects | `deriveStories(model)` returns indexed stories with base/top elevation, height, node ids, and future diaphragm slot |
| Model normalization | `createModel()` and `migrateModel()` now attach `stories` and `storyModel` |
| Shared consumers | Load estimation and serviceability drift use the same story level utility |
| Agent/API | `getStorySummary()` exposes current story count and per-story node counts |
| Regression | `test:p2s4` verifies creation, migration, load estimation, drift, and manifest exposure |

## Data Shape

```js
{
  storyModel: { version, source: 'node-z', count },
  stories: [
    { id, name, index, baseZ, topZ, height, nodeIds, diaphragm }
  ]
}
```

## Current Limits

`diaphragm` is a reserved field only. Actual rigid diaphragm constraint assembly is not implemented in this slice.

## Next S4 Work

1. T09 member release contract audit and benchmark expansion.
2. T11 diaphragm definition and solver constraint path.
3. Story result table linking drift, story force, and generated load traces.
