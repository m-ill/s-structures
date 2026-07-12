# ADR-003: Concentrated Hinge Series Compatibility and Regularization

```yaml
status: accepted
date: 2026-07-12
milestone: P8-M4
verification: NL-HNG-01..NL-HNG-12
```

## Context

P8-M4 must replace whole-member secant degradation with physical local-y/local-z rotational springs at the i/j member ends. The spring must share moment with the elastic corotational member, preserve committed history through failed Newton branches, support asymmetric A-B-C-D-E envelopes and cyclic response, and expose zero or negative tangent behavior without silently changing the structural model.

The Phase 8 canonical domain already owns local axes, releases, offsets, property snapshots, and committed/trial element state. P8-M3 already solves finite end releases as internal face rotations. A concentrated hinge therefore needs a separate stateful spring topology built on the same face-rotation kinematics, not another member-wide stiffness modifier.

## Decision

1. Each hinge is identified by `(memberId, end, local axis, propertyId)`. P8-M4 supports independent i/j local-y and local-z rotational springs.
2. The internal member-face rotation is `h`; the reported spring rotation is `theta_h = joint rotation - face rotation = -h`. Internal equilibrium is `M_member - M_hinge(theta_h) = 0` in the current physical local axis.
3. The element solves every release and hinge internal rotation together. Its condensed tangent is

   `dF/dq - dF/dh * (dG/dh)^-1 * dG/dq`,

   where the member derivatives come from the P8-M3 second-order jets and the hinge contribution to `dG/dh` is its current constitutive tangent. Mechanical fixed-end actions participate in the same internal residual.
4. A-B-C-D-E rotations are strictly increasing nonnegative magnitudes. Positive and negative sides are independent. Moment, rotation, length, and energy units are explicit in the immutable property snapshot.
5. The selectable cyclic rules are `kinematic-masing` and `isotropic-multilinear`. The first uses a Masing reversal branch with a smooth peak correction when a prior opposite extreme exists. The second unloads at the degraded initial stiffness to the opposite yield surface and then follows a plastic-offset multilinear envelope.
6. Constitutive evaluation is pure: every trial is reconstructed from the committed state and target rotation. Adaptive constitutive substeps capture crossings and reversals; rejected Newton branches and cutbacks cannot mutate committed hinge history.
7. State stores reversal/cycle count, positive/negative extremes, branch, event, cumulative work, recoverable energy, and dissipated energy. Strength and stiffness degradation factors are updated from explicit per-cycle/per-energy rules and recorded in the trial state.
8. The default tangent policy is `diagnostic-only`: a real zero or negative tangent is preserved. Any property containing a nonpositive envelope segment requires the general/indefinite matrix backend. Optional `signed-floor` and `positive-floor` policies are explicit, reported regularizations. A singular internal series tangent fails closed.
9. Hinge properties use the schema-v5 `hingeProperties` registry. Assignments reference the registry from `member.nonlinear.hinges`. A hinge and release on the same end/axis are invalid.
10. Automatic assignment consumes the same normalized material and section records as elastic analysis. Steel axes use their own `Zy/Zz`; RC generation requires an explicit reinforcement/capacity snapshot. Deformation rules, hinge length, and source must be supplied; missing rules are blocked instead of replaced by hidden defaults.
11. PMM is an immutable axial-ratio interpolation hook. Ratios outside the declared level range fail closed and are not clamped. Full PMM/fiber interaction remains P8-M6.
12. Preview, override diff, apply, and undo use one model transaction. Property content hashes and assignment provenance retain auto sources and user overrides.

## Rejected Alternatives

- Reducing the complete member `Iy/Iz/J` after hinge yield: this changes elastic interior behavior and cannot enforce end-spring compatibility.
- Reusing the Phase 3 envelope-only hinge: it has no committed/trial history, reversal state, or consistent global tangent.
- Mutating hinge state during element evaluation: failed line searches would contaminate later iterations.
- Forcing every nonpositive tangent to a hidden positive stiffness: this suppresses physical instability and gives an unsafe SPD classification.
- Clamping PMM axial ratio or fabricating RC reinforcement: both hide inadmissible input.
- Introducing a commercial or externally licensed constitutive library: P8-M4 remains implemented with in-repository code and the existing in-house numerical backend.

## Consequences

- Stable pre-peak branches can use SPD backends when no other feature requires a general matrix. Softening, plateaus, finite releases, and noncoaxial finite-rotation moments route to the general backend.
- Hinge result rows carry rotation, moment, tangent, state, events, energy, assignment source, qualification, and PMM trace without changing elastic member station recovery.
- Finite releases remain static-only. A release and a hinge on different axes may coexist only within that static limitation; the same axis is rejected.
- P8-M4 qualifies component and frame integration behavior as `candidate`. Formal gravity-preloaded displacement-control Pushover is P8-M5, full PMM/fiber response is P8-M6, cyclic path control is P8-M7, and external solver/pilot equivalence remains P8-M11.

## Migration Impact

- Legacy `member.nonlinear.hinges` rows are not automatically qualified. Production entries must reference a valid schema-v5 property record.
- Existing elastic and P8-M3 corotational entry builders remain unchanged. Analyses that opt into concentrated plasticity use `buildHingedFrame3dEntries`.
- The model transaction collection set now includes all schema-v5 nonlinear registries so property assignment can be undone atomically.

## Reconsideration

Revisit this ADR if P8-M6 PMM/fiber coupling requires a coupled multi-axis return mapping, if P8-M7 cyclic qualification selects a different published hysteresis protocol, or if independent validation shows the selected branch rules cannot meet the stated acceptance tolerances.
