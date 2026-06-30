# M38 KDS-Style Rule Combination Expansion

## Scope

M38 keeps the M35 preset generator intact and adds a rule-expanded generator.

- `createKdsLoadCombinations()` remains the simple preset path.
- `createKdsRuleBasedLoadCombinations()` expands applicable presets into signed lateral cases.
- Wind and seismic load cases are generated as positive and negative factor variants when reverse lateral loading is requested.
- Each generated combination receives `ruleTrace` metadata for report and agent inspection.

## API

Read:

- `summarizeKdsLoadCombinationRules(model)`
- `window.SStructuresAgent.getKdsLoadCombinationRules()`

Execute:

- `window.SStructuresAgent.execute('applyKdsRuleBasedLoadCombinations')`

## Current Limits

- This is still a KDS-style rule scaffold, not a full code-rule engine.
- Project-specific live load reduction, exposure, importance, accidental torsion, seismic redundancy, and special load effects remain external inputs.
- Reverse lateral loading is represented by signed load-case factors unless the model explicitly contains separate plus/minus load cases.
