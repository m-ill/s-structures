# P2-M5 Advanced Elastic Trace

status: preliminary

## Scope

This milestone records advanced elastic analysis assumptions and result traces.
It wraps existing P-Delta, modal, and response spectrum results into one
versioned contract for reports and AI automation.

## Contracts

| Contract | Output |
| --- | --- |
| P-Delta trace | method, settings, combo convergence, iteration rows |
| Modal trace | periods, frequencies, mass participation ratios |
| RSA trace | spectrum, SRSS direction summary, modal response rows |
| Agent API | `getAdvancedElasticTrace()` |

## Limits

1. P-Delta is iterative secondary load amplification, not full nonlinear solve.
2. Modal mass is lumped translational mass.
3. RSA reports displacement trace and SRSS combination only.

## Verification

Run `npm run test:p2m5`.
