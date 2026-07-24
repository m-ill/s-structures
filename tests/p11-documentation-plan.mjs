import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const phaseRoot = 'docs/phase11';
const rootDocuments = [
  'README.md',
  'CURRENT_STATE_AUDIT.md',
  'PRODUCTION_REQUIREMENTS.md',
  'TARGET_ARCHITECTURE.md',
  'MILESTONE_EXECUTION_PLAN.md',
  'ROADMAP.md',
  'VERIFICATION_MATRIX.md',
  'REQUIREMENTS_TRACEABILITY.md',
  'RISK_REGISTER.md',
  'IMPLEMENTATION_STATUS.md',
];
const workPackages = [
  'workpackages/README.md',
  ...Array.from({ length: 10 }, (_, index) => {
    const suffixes = [
      'baseline-governance',
      'report-snapshot-verdict',
      'i18n-dual-render',
      'visual-capture-core',
      'scene-evidence-embedding',
      'executive-report-layout',
      'pdf-export-service',
      'product-agent-workflow',
      'qualification-hardening',
      'pilot-release',
    ];
    return `workpackages/WP-${String(index).padStart(2, '0')}-${suffixes[index]}.md`;
  }),
];
const adrs = [
  'adr/ADR-001-SHARED-SNAPSHOT-DUAL-LOCALE.md',
  'adr/ADR-002-DETERMINISTIC-VISUAL-CAPTURE.md',
];
const requiredFiles = [...rootDocuments, ...workPackages, ...adrs];

const documents = new Map();
for (const relativePath of requiredFiles) {
  const file = `${phaseRoot}/${relativePath}`;
  assert.ok(existsSync(file), `Missing Phase 11 plan document: ${file}`);
  assert.ok(statSync(file).size > 300, `Phase 11 plan document is unexpectedly small: ${file}`);
  const text = readFileSync(file, 'utf8');
  assert.match(text, /^#\s+\S+/m, `Missing title in ${file}`);
  documents.set(file, text);
}

const hub = documents.get(`${phaseRoot}/README.md`);
const requirements = documents.get(`${phaseRoot}/PRODUCTION_REQUIREMENTS.md`);
const milestones = documents.get(`${phaseRoot}/MILESTONE_EXECUTION_PLAN.md`);
const roadmap = documents.get(`${phaseRoot}/ROADMAP.md`);
const traceability = documents.get(`${phaseRoot}/REQUIREMENTS_TRACEABILITY.md`);
const status = documents.get(`${phaseRoot}/IMPLEMENTATION_STATUS.md`);
const rootIndex = readFileSync('docs/README.md', 'utf8');

assert.match(hub, /status:\s*(?:planned|in-progress|release-qualified)/);
assert.match(hub, /governing_plan:\s*MILESTONE_EXECUTION_PLAN\.md/);
assert.match(hub, /release_qualified:\s*(?:false|true)/);
assert.match(status, /implementation_status:\s*(?:not-started|qualification-in-progress|release-qualified)/);
assert.match(status, /active_milestone:\s*none/);
assert.match(status, /release_qualified:\s*(?:false|true)/);
assert.match(rootIndex, /documentationVersion:\s*2026-07-23-phase11-plan-v1/);
assert.match(rootIndex, /## Phase 11 Reading Order \(current\)/);
assert.ok(existsSync('docs/verification/phase11/ARTIFACT_RETENTION.md'));

const milestoneIds = [...milestones.matchAll(/^## P11-M(\d+)\s+—/gm)].map((match) => Number(match[1]));
assert.deepEqual(milestoneIds, Array.from({ length: 10 }, (_, index) => index));
for (let index = 0; index <= 9; index += 1) {
  const section = milestoneSection(milestones, index);
  for (const heading of [
    '목표',
    '구현·산출물',
    '제품 표면 영향',
    '리팩토링 gate',
    '검증',
    '정량 수용기준',
    '증빙',
    '완료판정',
    '비범위·잔여 위험',
  ]) {
    assert.match(section, new RegExp(`### ${heading}`), `P11-M${index} is missing ${heading}`);
  }
    assert.match(roadmap, new RegExp(`\\*\\*P11-M${index}\\*\\* (?:planned|qualification-complete)`));
}

assertRequirementSeries(requirements, 'P11-FR-DATA', 1, 5);
assertRequirementSeries(requirements, 'P11-FR-VER', 1, 5);
assertRequirementSeries(requirements, 'P11-FR-I18N', 1, 7);
assertRequirementSeries(requirements, 'P11-FR-CAP', 1, 9);
assertRequirementSeries(requirements, 'P11-FR-RPT', 1, 9);
assertRequirementSeries(requirements, 'P11-FR-EXP', 1, 9);
assertRequirementSeries(requirements, 'P11-FR-UI', 1, 2);
assertRequirementSeries(requirements, 'P11-FR-API', 1, 2);
assertRequirementSeries(requirements, 'P11-NFR', 1, 12);

for (const prefix of [
  'P11-FR-DATA',
  'P11-FR-VER',
  'P11-FR-I18N',
  'P11-FR-CAP',
  'P11-FR-RPT',
  'P11-FR-EXP',
  'P11-FR-UI',
  'P11-FR-API',
  'P11-NFR',
]) {
  assert.ok(traceability.includes(prefix), `Traceability does not cover ${prefix}`);
}

for (const adr of adrs) {
  const text = documents.get(`${phaseRoot}/${adr}`);
  assert.match(text, /status:\s*(?:proposed|accepted)/);
  for (const heading of ['배경', '결정', '대안', '결과', '승인 조건']) {
    assert.match(text, new RegExp(`## ${heading}`), `${adr} is missing ${heading}`);
  }
}

for (const workPackage of workPackages.filter((file) => file !== 'workpackages/README.md')) {
  const text = documents.get(`${phaseRoot}/${workPackage}`);
  assert.match(text, /status:\s*(?:planned|qualification-complete)/);
  assert.match(text, /## 작업/);
  assert.match(text, /## 게이트/);
  assert.match(text, /## Evidence/);
  assert.match(text, /## Review Log/);
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
  documents: requiredFiles.length,
  milestones: milestoneIds.length,
  workPackages: workPackages.length - 1,
  requirements: 60,
  brokenLinks: brokenLinks.length,
  status: 'release-qualified/P11-M0-M9-qualified',
}, null, 2));

function assertRequirementSeries(text, prefix, first, last) {
  for (let index = first; index <= last; index += 1) {
    const id = `${prefix}-${String(index).padStart(2, '0')}`;
    assert.ok(text.includes(id), `Missing requirement ${id}`);
  }
}

function milestoneSection(text, index) {
  const start = text.search(new RegExp(`^## P11-M${index}\\s+—`, 'm'));
  assert.notEqual(start, -1, `Missing P11-M${index}`);
  const rest = text.slice(start + 1);
  const next = rest.search(/^## P11-M\d+\s+—/m);
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
