import assert from 'node:assert/strict';
import { report } from '../verification/harnesses/check-code-reference-consistency.mjs';

// The clause a check cites is recorded twice: inline in the check module, and
// in the designCodeBasis review map used to scope a standard revision. Two
// records of the same fact drift, and they had: sixteen checks named documents
// the review map did not list, so a revision review would have under-scoped the
// change. This keeps them together.
//
// Asymmetric on purpose: a document the module actually pulls must appear in the
// review map, while the map may list extra documents for review.

assert.ok(report.rules > 0);
assert.ok(report.modulesDeclaringReferences > 0);
assert.ok(report.inlineClauseDeclarations > 0);

assert.deepEqual(
  report.disagreements,
  [],
  `checks whose module cites a document the review map omits:\n${report.disagreements
    .map((row) => `  ${row.checkId} (${row.module}) -> ${row.citedByModuleOnly.join(', ')}`)
    .join('\n')}`,
);

// Advisory entries are allowed but bounded, so an unexplained pile cannot grow.
assert.ok(report.advisories.length <= 6, JSON.stringify(report.advisories));

console.log(JSON.stringify({
  ok: true,
  rules: report.rules,
  modulesDeclaringReferences: report.modulesDeclaringReferences,
  inlineClauseDeclarations: report.inlineClauseDeclarations,
  missingFromReviewMap: report.disagreements.length,
  advisoryOnly: report.advisories.length,
}, null, 2));
