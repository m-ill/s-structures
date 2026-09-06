# P2-M5 Advanced Elastic Trace

status: preliminary

## Scope

This milestone records advanced elastic analysis assumptions and result traces.
It wraps existing P-Delta, modal, and response spectrum results into one
versioned contract for reports and AI automation.

## Contracts

| Contract | Output |
| --- | --- |
| P-Delta trace | method, settings, combo convergence, iteration rows, final design summary, story stability rows, load-step Global/Story/Member curves |
| Direct Analysis trace | `Kt = Ke + Kg(N)` method, tangent iteration convergence, final second-order forces, story stability rows |
| Modal trace | periods, frequencies, mass participation ratios |
| RSA trace | spectrum, SRSS direction summary, modal response rows |
| Agent API | `getAdvancedElasticTrace()` |

## Limits

1. The current P-Delta solver uses iterative secondary lateral-load amplification, not full geometric-stiffness Newton tangent assembly.
2. P-Delta design values are final `lambda = 1.0` combination results: story theta, B-delta, P-Delta shear/moment, and second-order member forces.
3. Displayed P-Delta curves are load-step response curves. Iteration rows remain convergence diagnostics and should not be interpreted as the P-Delta response curve.
4. The planned direct-analysis mode is separate from the current equivalent-load method and is defined in `P2_M5_DIRECT_ANALYSIS_IMPLEMENTATION_PLAN.md`.
5. Direct-analysis mode remains preliminary until `verification/specs/P2_M5_DIRECT_ANALYSIS_VERIFICATION.md` passes.
6. Modal mass is lumped translational mass.
7. RSA reports displacement trace and SRSS combination only.

## Verification

Run `npm run test:p2m5`.
