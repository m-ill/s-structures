import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const phaseRoot = 'docs/phase9';
const requiredFiles = [
  'README.md',
  'CURRENT_STATE_AUDIT.md',
  'PRODUCTION_REQUIREMENTS.md',
  'IMPLEMENTATION_STATUS.md',
  'TARGET_ARCHITECTURE.md',
  'COMPUTE_PRECISION_POLICY.md',
  'ELASTIC_NONLINEAR_MIGRATION.md',
  'REFACTORING_AND_CODE_CLEANUP.md',
  'PERFORMANCE_AND_QUALIFICATION.md',
  'RISK_REGISTER.md',
  'REFERENCE_BASIS.md',
  'MILESTONE_EXECUTION_PLAN.md',
  'VERIFICATION_MATRIX.md',
  'REQUIREMENTS_TRACEABILITY.md',
  'adr/ADR-001-HYBRID-CPU-WASM-WEBGPU.md',
  'adr/ADR-002-MIXED-PRECISION-AND-DETERMINISM.md',
  'adr/ADR-003-EXTENSIBLE-BACKEND-AND-FAIL-CLOSED.md',
];

const documents = new Map();
for (const relativePath of requiredFiles) {
  const file = `${phaseRoot}/${relativePath}`;
  assert.ok(existsSync(file), `Missing Phase 9 document: ${file}`);
  assert.ok(statSync(file).size > 200, `Phase 9 document is unexpectedly small: ${file}`);
  const text = readFileSync(file, 'utf8');
  assert.match(text, /^#\s+\S+/m, `Missing title in ${file}`);
  documents.set(file, text);
}

const hub = documents.get(`${phaseRoot}/README.md`);
const status = documents.get(`${phaseRoot}/IMPLEMENTATION_STATUS.md`);
const milestones = documents.get(`${phaseRoot}/MILESTONE_EXECUTION_PLAN.md`);
const requirements = documents.get(`${phaseRoot}/PRODUCTION_REQUIREMENTS.md`);
const traceability = documents.get(`${phaseRoot}/REQUIREMENTS_TRACEABILITY.md`);
const rootIndex = readFileSync('docs/README.md', 'utf8');

assert.match(hub, /status:\s*implementation/);
assert.match(hub, /implementation_status:\s*in-progress/);
assert.match(hub, /completed_milestones:\s*\[P9-M0, P9-M1, P9-M2, P9-M3\]/);
assert.match(status, /phase_status:\s*implementation/);
assert.match(status, /implementation_status:\s*in-progress/);
assert.match(status, /completed_milestones:\s*\[P9-M0, P9-M1, P9-M2, P9-M3\]/);
assert.match(status, /compute_qualification:\s*G1-candidate/);
assert.match(status, /release_status:\s*not-qualified/);
assert.match(status, /design_transfer_allowed:\s*false/);
assert.doesNotMatch(status, /implementation_status:\s*(complete|qualified)/);
assert.match(requirements, /status:\s*planned/);
assert.match(traceability, /status:\s*planned/);
assert.match(rootIndex, /documentationVersion:\s*2026-07-15-phase9-m3/);
assert.match(rootIndex, /## Phase 9 Reading Order \(current\)/);

const milestoneIds = [...milestones.matchAll(/^## P9-M(\d+)\s+-/gm)].map((match) => Number(match[1]));
assert.deepEqual(milestoneIds, Array.from({ length: 11 }, (_, index) => index));
for (let index = 0; index <= 10; index += 1) {
  const section = milestoneSection(milestones, index);
  assert.match(section, /### 리팩토링 gate/);
  assert.match(section, /### 검증/);
  assert.match(section, /### 완료판정/);
}

assertRequirementSeries(requirements, 'P9-FR-CORE', 1, 10);
assertRequirementSeries(requirements, 'P9-FR-ELA', 1, 8);
assertRequirementSeries(requirements, 'P9-FR-NL', 1, 8);
assertRequirementSeries(requirements, 'P9-FR-PLT', 1, 8);
assertRequirementSeries(requirements, 'P9-NFR', 1, 15);
assertRequirementSeries(requirements, 'P9-REF', 1, 12);

for (const adr of requiredFiles.filter((file) => file.startsWith('adr/'))) {
  const text = documents.get(`${phaseRoot}/${adr}`);
  assert.match(text, /status:\s*accepted-for-phase9-planning/);
  assert.match(text, /## Context/);
  assert.match(text, /## Decision/);
  assert.match(text, /## Consequences/);
  assert.match(text, /## Rejected Alternatives/);
  assert.ok(traceability.includes(adr.split('/').at(-1)), `Traceability does not reference ${adr}`);
}

const brokenLinks = [];
for (const [file, text] of documents) {
  for (const href of extractLocalMarkdownLinks(text)) {
    const target = resolve(dirname(file), href);
    if (!existsSync(target)) brokenLinks.push({ file, href });
  }
}
assert.deepEqual(brokenLinks, []);

console.log(JSON.stringify({
  ok: true,
  requiredDocuments: requiredFiles.length,
  milestones: milestoneIds.length,
  checkedLocalLinks: [...documents.values()]
    .flatMap((text) => extractLocalMarkdownLinks(text)).length,
  status: 'implementation/in-progress/G1-candidate',
}, null, 2));

function assertRequirementSeries(text, prefix, first, last) {
  for (let index = first; index <= last; index += 1) {
    const id = `${prefix}-${String(index).padStart(2, '0')}`;
    assert.ok(text.includes(id), `Missing requirement ${id}`);
  }
}

function milestoneSection(text, index) {
  const start = text.search(new RegExp(`^## P9-M${index}\\s+-`, 'm'));
  assert.notEqual(start, -1, `Missing P9-M${index}`);
  const rest = text.slice(start + 1);
  const next = rest.search(/^## P9-M\d+\s+-/m);
  return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
}

function extractLocalMarkdownLinks(text) {
  const links = [];
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    let href = match[1].trim();
    if (!href || /^(?:https?:|mailto:|#)/i.test(href)) continue;
    if (href.startsWith('<') && href.endsWith('>')) href = href.slice(1, -1);
    href = href.split('#', 1)[0];
    if (!href) continue;
    links.push(decodeURIComponent(href));
  }
  return links;
}
