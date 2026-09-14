// Does the feedback path declaration still match the code it points at?
//
// designFeedbackPaths declares which design change invalidates what, and each
// edge names the code that makes it true. A declaration nobody checks rots the
// same way a test nobody runs does, so this verifies the evidence still exists.
//
//   node verification/harnesses/check-feedback-path-evidence.mjs [--json]
//
// Asymmetric, like the phase 28 clause check. Evidence pointing at a file or a
// symbol that is gone FAILS: the declaration is then describing a mechanism the
// code no longer has. Evidence that names no code at all (a KDS clause, a
// future milestone) is reported and allowed, because not every edge in the
// problem is an edge in this repository.

import { readFile } from 'node:fs/promises';
import { argv } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESIGN_FEEDBACK_EDGES,
  DESIGN_FEEDBACK_QUANTITIES,
  KNOWN_CHANGES,
  feedbackReach,
} from '../../src/compute/product/designFeedbackPaths.js';

const ROOT = path.resolve('.');
const broken = [];
const unverifiable = [];
const verified = [];

for (const edge of DESIGN_FEEDBACK_EDGES) {
  const reference = String(edge.evidence || '');
  const match = /^(src\/[\w./-]+\.js)(?:\s+(\w+))?$/.exec(reference);
  if (!match) {
    unverifiable.push({ change: edge.change, evidence: reference, why: 'names no source file' });
    continue;
  }
  const [, file, symbol] = match;
  let text;
  try {
    text = await readFile(path.join(ROOT, file), 'utf8');
  } catch {
    broken.push({ change: edge.change, evidence: reference, why: 'file does not exist' });
    continue;
  }
  if (symbol && !text.includes(symbol)) {
    broken.push({ change: edge.change, evidence: reference, why: `symbol ${symbol} not found in ${file}` });
    continue;
  }
  verified.push({ change: edge.change, file, symbol: symbol ?? null });
}

// Every target must be a declared quantity, or the graph has a node nobody
// named and reachability answers become quietly wrong.
const undeclared = [];
for (const edge of DESIGN_FEEDBACK_EDGES) {
  for (const target of edge.invalidates) {
    if (!DESIGN_FEEDBACK_QUANTITIES.includes(target)) undeclared.push({ change: edge.change, target });
  }
}

// A change that nothing can produce is a dead entry point: it can be asked
// about but never reached, which usually means an edge is missing.
const produced = new Set(DESIGN_FEEDBACK_EDGES.flatMap((edge) => edge.invalidates));
const unreachable = [...KNOWN_CHANGES].filter((change) => !produced.has(change)).sort();

const loop = feedbackReach('section-dimensions');

const report = {
  version: 'p30-feedback-path-evidence-v1',
  edges: DESIGN_FEEDBACK_EDGES.length,
  quantities: DESIGN_FEEDBACK_QUANTITIES.length,
  verified: verified.length,
  unverifiable,
  broken,
  undeclaredTargets: undeclared,
  unreachableChanges: unreachable,
  // The whole point of the declaration: the loop is closed and visible.
  sectionChangeFormsLoop: loop.formsLoop,
  sectionChangeReaches: loop.reaches,
};

const runDirectly = argv[1] && path.resolve(argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly && argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else if (runDirectly) {
  console.log(`edges=${report.edges} verified=${report.verified} broken=${broken.length} unverifiable=${unverifiable.length}`);
  console.log(`sectionChangeFormsLoop=${report.sectionChangeFormsLoop} reaches=${loop.reaches.length}`);
  for (const row of broken) console.log(`  BROKEN ${row.change}: ${row.evidence} (${row.why})`);
  for (const row of undeclared) console.log(`  UNDECLARED TARGET ${row.change} -> ${row.target}`);
  for (const row of unverifiable) console.log(`  unverifiable ${row.change}: ${row.evidence}`);
  for (const change of unreachable) console.log(`  entry point only: ${change}`);
}

export { report };
