// Does the central clause map agree with what the check modules actually cite?
//
// designCodeBasis keeps a per-check map of [document, clause], and each check
// module separately attaches its own clause to the documents it pulls from
// getKcscRuleSources. Two records of the same fact drift, so this compares the
// documents they name and reports any check where they disagree.
//
//   node verification/harnesses/check-code-reference-consistency.mjs [--json]

import { readFile, readdir } from 'node:fs/promises';
import { argv } from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PRACTICAL_RULE_IMPLEMENTATIONS } from '../../src/metadata/practicalRuleImplementations.js';
import { designCodeBasis } from '../../src/metadata/designCodeBasis.js';

const ROOT = path.resolve('.');
const DESIGN = path.join(ROOT, 'src', 'design');

async function moduleSources() {
  const found = new Map();
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.js')) {
        const text = await readFile(full, 'utf8');
        const rel = path.relative(DESIGN, full).replaceAll('\\', '/');
        const documents = new Set();
        for (const match of text.matchAll(/getKcscRuleSources\(\[([^\]]*)\]\)/g)) {
          for (const id of match[1].matchAll(/'(\d+)'/g)) documents.add(id[1]);
        }
        const clauses = [...text.matchAll(/clause:\s*'([^']+)'/g)].map((m) => m[1]);
        if (documents.size || clauses.length) found.set(rel, { documents: [...documents].sort(), clauses });
      }
    }
  };
  await walk(DESIGN);
  return found;
}

const modules = await moduleSources();
const disagreements = [];
const advisories = [];
const unmapped = [];

for (const rule of PRACTICAL_RULE_IMPLEMENTATIONS) {
  const moduleKey = String(rule.module || '').replace(/^src\/design\//, '');
  const implementation = modules.get(moduleKey);
  if (!implementation) {
    unmapped.push({ rule: rule.id, module: rule.module, why: 'module declares no code reference' });
    continue;
  }
  for (const checkId of rule.checkIds) {
    const central = designCodeBasis(checkId);
    const centralDocuments = [...new Set([...(central?.reviewTargets || []), ...(central?.applied || [])].map((row) => row.id))].sort();
    if (!centralDocuments.length) {
      unmapped.push({ rule: rule.id, checkId, why: 'no central clause target' });
      continue;
    }
    const missingCentrally = implementation.documents.filter((id) => !centralDocuments.includes(id));
    const missingInModule = centralDocuments.filter((id) => !implementation.documents.includes(id));
    // Asymmetric on purpose. A document the module actually pulls must appear in
    // the review map, or a revision impact review under-scopes the change. The
    // map listing extra documents for review is allowed and only reported.
    if (missingInModule.length) {
      advisories.push({ rule: rule.id, checkId, module: rule.module, citedCentrallyOnly: missingInModule });
    }
    if (missingCentrally.length) {
      disagreements.push({
        rule: rule.id,
        checkId,
        module: rule.module,
        citedByModuleOnly: missingCentrally,
        citedCentrallyOnly: missingInModule,
      });
    }
  }
}

const report = {
  version: 'p28-code-reference-consistency-v1',
  rules: PRACTICAL_RULE_IMPLEMENTATIONS.length,
  modulesDeclaringReferences: modules.size,
  inlineClauseDeclarations: [...modules.values()].reduce((sum, row) => sum + row.clauses.length, 0),
  disagreements,
  advisories,
  unmapped,
};

// Quiet when imported by a check; print only when run directly.
const runDirectly = argv[1] && path.resolve(argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly && argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else if (runDirectly) {
  console.log(`rules=${report.rules} modules=${report.modulesDeclaringReferences} inlineClauses=${report.inlineClauseDeclarations}`);
  console.log(`missingFromReviewMap=${disagreements.length} advisoryOnly=${advisories.length} unmapped=${unmapped.length}`);
  for (const row of disagreements) {
    console.log(`  ${row.checkId} (${row.module})`);
    if (row.citedByModuleOnly.length) console.log(`    module cites documents the central map does not: ${row.citedByModuleOnly.join(', ')}`);
    if (row.citedCentrallyOnly.length) console.log(`    central map cites documents the module does not: ${row.citedCentrallyOnly.join(', ')}`);
  }
}

export { report };
