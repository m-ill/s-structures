# P2-MVP-S3 Benchmark Gate

status: implemented
ticket: T05

## Scope

P2-MVP-S3 formalizes a ten-case solver benchmark gate using the existing verification fixtures.

## Case Set

| ID | Case |
| --- | --- |
| B01 | simple beam point |
| B02 | simple beam UDL |
| B03 | cantilever tip load |
| B04 | cantilever UDL |
| B05 | fixed-fixed UDL |
| B06 | axial bar |
| B07 | custom fixed cantilever |
| B08 | global Y UDL |
| B09 | triangular UDL |
| B10 | released simple beam |

## Checks

- analysis succeeds.
- `analysis.audit.ok` is true.
- equilibrium residual is within limit.
- solver residual is within limit.
- expected total load matches recovered load summary.

## Verification

```powershell
npm.cmd run test:p2s3
npm.cmd run test:m53
```

`npm.cmd test` also runs the numeric alias `test:m53`.
