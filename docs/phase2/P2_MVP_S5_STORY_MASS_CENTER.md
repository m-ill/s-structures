# P2-MVP-S5 Story Mass Center Contract

status: implemented for T18 story mass and eccentric generated load slice

## Purpose

This slice exposes story-level mass center, diaphragm center eccentricity, and eccentric lateral load distribution. Generated wind and seismic story loads now use this distribution when story mass and diaphragm data are available.

## Contract

| Area | Scope |
| --- | --- |
| Story mass | Uses explicit `node.mass` values at each story level |
| Mass center | Weighted x/y center from story node mass |
| Diaphragm center | Existing rigid diaphragm geometry center |
| Stiffness center | Column stiffness proxy, marked as preliminary |
| Distribution | Base nodal force from actual eccentricity plus `AP/AN` signed accidental cases |
| Agent API | `getStoryMassSummary()` and `getEccentricStoryLoadDistribution()` |

## Example

```js
const summary = SStructuresAgent.getStoryMassSummary();
const distribution = SStructuresAgent.getEccentricStoryLoadDistribution({
  forces: [{ story: 1, caseId: 'EX', dir: '+x', force: 80 }],
});
```

## Limits

The stiffness center is not yet a formal unit-load center of rigidity. Code-specific torsion amplification remains future standard-engine work.
