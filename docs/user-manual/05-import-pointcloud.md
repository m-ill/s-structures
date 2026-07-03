# 05 Import Point Cloud

## Supported Scope

Point-cloud support currently covers XYZ, PLY, PCD, LAS-style loading paths,
synthetic benchmark extraction, story clustering, column/beam/wall detection,
and viewer buffer contracts.

## Workflow

1. Load the point-cloud file through the project import path.
2. Check unit scale, story levels, and detected vertical members.
3. Review extraction summary before converting to analysis members.
4. Compare detected members against drawing or field notes.
5. Save accepted geometry as a project revision.

## Limits

This is not yet a field-validated scan-to-model engine. Real project point
clouds must be added to the validation evidence set before production use.
