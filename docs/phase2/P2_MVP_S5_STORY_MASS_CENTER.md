# P2-MVP-S5 Story Mass Center Contract

status: implemented for first T18 slice

## Purpose

This slice exposes story-level mass center, diaphragm center eccentricity, and an eccentric lateral load distribution preview. It prepares the seismic load engine without changing the current generated model loads yet.

## Contract

| Area | Scope |
| --- | --- |
| Story mass | Uses explicit `node.mass` values at each story level |
| Mass center | Weighted x/y center from story node mass |
| Diaphragm center | Existing rigid diaphragm geometry center |
| Stiffness center | Column stiffness proxy, marked as preliminary |
| Distribution | Preview nodal in-plane forces from force eccentricity |
| Agent API | `getStoryMassSummary()` and `getEccentricStoryLoadDistribution()` |

## Example

```js
const summary = SStructuresAgent.getStoryMassSummary();
const distribution = SStructuresAgent.getEccentricStoryLoadDistribution({
  forces: [{ story: 1, caseId: 'EX', dir: '+x', force: 80 }],
});
```

## Limits

The stiffness center is not yet a formal unit-load center of rigidity. The current distribution is a preview contract and does not replace the generated load list until the next load-engine slice.
