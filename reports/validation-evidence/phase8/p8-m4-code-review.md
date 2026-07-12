# P8-M4 Code Review

```yaml
reviewed_at: 2026-07-13
milestone: P8-M4
status: PASS
critical_findings_open: 0
high_findings_open: 0
review_rounds: 2
external_numerical_dependencies_added: 0
```

## Corrected Findings

1. Replaced the legacy whole-member secant degradation concept with independent i/j local-y/local-z spring rotations and the physical internal residual `M_member - M_hinge = 0`.
2. Added consistent implicit condensation of member-face rotations. The elastic beam-spring closed form, rotation partition, end moment, and finite-difference tangent now agree.
3. Kept constitutive evaluation pure. Every Newton candidate reconstructs trial history from the committed state; cancellation returns a byte-equivalent state-store snapshot.
4. Added strict asymmetric A-B-C-D-E normalization, smooth-segment tangents, Masing and isotropic multilinear reversal rules, residual rotation, event state, degradation, and recoverable/dissipated energy.
5. Fixed an origin-state defect found during review: zero rotation had point A but inherited point B's `yielded` label. The envelope now reports the A state and initial tangent consistently.
6. Fixed a PMM integration defect found during review: an axial-ratio-derived property changed its ID and was rejected by the member assignment. Derived snapshots now retain the registry ID and use content hash plus axial-ratio provenance for identity.
7. Preserved actual zero and negative tangents. Softening properties force the assembler to the general backend; optional tangent floors are explicit diagnostics rather than hidden SPD stabilization.
8. Included mechanical member fixed-end actions in hinge internal equilibrium. A UDL produces a nonzero spring rotation and matching member/hinge end moment.
9. Added strict hinge-property hashes, units, source/calibration rules, PMM bounds, and fail-closed release/hinge conflict validation.
10. Replaced the old strong/weak-axis maximum-capacity shortcut. Automatic steel properties use separate `Zy/Zz`; RC properties require an explicit reinforcement/capacity snapshot.
11. Blocked missing auto-deformation rules instead of installing undocumented default rotations. Duplicate generated property IDs with different snapshots are reported as conflicts.
12. Extended the existing model transaction to schema-v5 nonlinear registries so preview, user override diff, apply, and undo remain atomic.
13. Added public API exports, verification registry entries, Agent data contracts, ADR-003, source-linked evidence, and test-source verification for every `NL-HNG-01~12` result.

## Review Scope

- Positive/negative backbone geometry, units, segment states, tangents, and failure continuation
- Kinematic Masing and isotropic multilinear reversal branches, residual rotation, degradation, and energy
- Committed/trial purity, substep limits, event generation, state hashing, cancellation, and rollback
- 3D corotational member-face kinematics, i/j and y/z independence, member loads, releases, and consistent tangent condensation
- Zero/negative tangent policy, local singularity errors, and SPD/general backend routing
- Hinge property registry, PMM hook, automatic steel/RC assignment, provenance, content hash, diff, and undo
- Phase 7 material/section/modeling/elastic regressions, P8-M0~M3 regressions, public exports, Agent contract, ADR, and evidence

## Verification Results

- `tests/p8-m4-hinge-material.mjs`: PASS
- `tests/p8-m4-hinged-frame.mjs`: PASS
- `tests/p8-m4-assignment.mjs`: PASS
- `tests/p8-m4-artifacts.mjs`: PASS
- A-B-C-D-E smooth-segment tangent relative error: `3.946603796552723e-11`
- closed Masing loop energy: `3.6`, state/integral difference below `2e-8`
- residual zero-moment rotation: `0.009`
- beam-spring series moment error: `9.750422691467975e-12`
- beam-spring series compatibility error: `0`
- condensed series tangent relative error: `3.8596653400999595e-9`
- rejected-step rollback equivalence: `true`
- P8-M0~M3 regression: PASS
- Phase 7 full regression: PASS
- repository-wide `npm test` (legacy milestones + Phase 7 + Phase 8 M0~M4): PASS
- external or commercial numerical dependency additions: `0`

## Residual Risks

- The Masing and isotropic rules are component-qualified against the stated closed-form protocols but have not completed external laboratory, published cyclic protocol, or commercial-solver qualification.
- The PMM hook accepts a fixed axial-ratio snapshot. Coupled axial-force/two-axis moment return mapping and fiber-derived interaction are P8-M6 scope.
- Formal gravity preload, augmented displacement control, mechanism tracking, and complete cyclic-static path control remain P8-M5/P8-M7 scope.
- Automatic assignment intentionally has no hidden KDS/FEMA deformation defaults. A project rule source or approved calibration is required; otherwise the preview is blocked or the property remains `assumed`.
- P8-M3 principal rotation-chart, follower-load, unilateral-truss, and finite-release limitations still apply.
- Large-model performance, independent commercial comparison, and building pilot qualification remain P8-M11 gates.
