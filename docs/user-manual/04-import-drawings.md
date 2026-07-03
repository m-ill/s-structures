# 04 Import Drawings

## Supported Scope

DXF import is available for ASCII drawing lines and layer-based structural
mapping. DWG support is represented by an adapter contract and requires an
external conversion path before production use.

## Workflow

1. Upload a drawing file to a project.
2. Run the import pipeline to create an import candidate.
3. Open `#/p/:projectId/import/:jobId`.
4. Review node, member, grid, story, layer, and warning counts.
5. Use the overlay list to select detected nodes and members.
6. Confirm the candidate only when validation is clean.

## Review Rules

- Unmapped layers require human review.
- Single-plan assembly requires human review.
- Low recognition quality blocks automatic acceptance.
- Confirmed imports should be saved as a project revision before reporting.
