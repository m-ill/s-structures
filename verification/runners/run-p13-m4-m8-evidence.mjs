import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const safe = process.cwd().replaceAll('\\', '/');
const sourceRevision = execFileSync('git', ['-c', `safe.directory=${safe}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const specs = [
  {
    milestone: 'P13-M4', name: 'kds-procedures', tests: ['tests/p13-m4-kds-procedures.mjs'], status: 'PARTIAL', impact: 'implementation-complete-source-qualification-blocked',
    records: Array.from({ length: 10 }, (_, index) => ({ id: `P13-KDS-${String(index + 1).padStart(2, '0')}`, status: [0, 3, 6].includes(index) ? 'BLOCKED' : 'PASS' })),
    blockers: ['official-standard-source-and-independent-fixture-required', 'full-direction-and-pack-update-fixture-required'],
  },
  {
    milestone: 'P13-M5', name: 'practical-editors', tests: ['tests/p13-m5-practical-editors.mjs', 'tests/p13-m5-performance-migration.mjs'], status: 'PARTIAL', impact: 'implementation-complete-only',
    records: Array.from({ length: 10 }, (_, index) => ({ id: `P13-EDIT-${String(index + 1).padStart(2, '0')}`, status: [1, 2].includes(index) ? 'BLOCKED' : 'PASS' })),
    blockers: ['full-phase10-solver-parity-and-unused-feature-regression-required', 'packaged-browser-round-trip-qualification-required'],
  },
  {
    milestone: 'P13-M6', name: 'elastic-dashboard', tests: ['tests/p13-m6-elastic-dashboard.mjs', 'tests/p13-m6-performance-accessibility.mjs'], status: 'PARTIAL', impact: 'implementation-complete-only',
    records: Array.from({ length: 12 }, (_, index) => ({ id: `P13-RES-${String(index + 1).padStart(2, '0')}`, status: [3, 4, 5, 7, 9].includes(index) ? 'BLOCKED' : 'PASS' })),
    blockers: ['pdelta-rsa-modal-source-provenance-and-cached-selection-performance-evidence-required', 'packaged-static-pdelta-modal-rsa-buckling-browser-qualification-required'],
  },
  {
    milestone: 'P13-M7', name: 'review-mgt', tests: ['tests/p13-m7-review-mgt.mjs'], status: 'PARTIAL', impact: 'implementation-complete-only',
    records: ['P13-REV-01', 'P13-REV-02', 'P13-RPT-01', 'P13-RPT-02', 'P13-RPT-03', 'P13-MGT-01', 'P13-MGT-02', 'P13-MGT-03', 'P13-MGT-04', 'P13-MGT-05', 'P13-MGT-06', 'P13-SEC-IMP-01'].map((id) => ({ id, status: ['P13-RPT-03'].includes(id) ? 'BLOCKED' : 'PASS' })),
    blockers: ['required-plan-elevation-layer-evidence-required', 'packaged-parser-fuzz-report-render-privacy-scan-required'],
  },
  {
    milestone: 'P13-M8', name: 'shell-lab', tests: ['tests/p13-m8-shell-lab.mjs'], status: 'PASS', impact: 'qualification-complete-experimental-view-only',
    records: ['P13-SHX-01', 'P13-SHX-02', 'P13-SHX-03', 'P13-SHX-04', 'P13-SHX-05', 'P13-SHX-06', 'P13-SHELL-GUARD-01', 'P13-SHELL-GUARD-02', 'P13-SHELL-GUARD-03', 'P13-SHELL-GUARD-04'].map((id) => ({ id, status: 'PASS' })),
    blockers: ['shell-design-transfer-remains-permanently-blocked'],
  },
];

await mkdir('verification/evidence/validation/phase13', { recursive: true });
for (const spec of specs) {
  for (const test of spec.tests) execFileSync(process.execPath, [test], { stdio: 'inherit' });
  const evidence = { version: `${spec.milestone.toLowerCase()}-evidence-v2`, phase: 'Phase 13', milestone: spec.milestone, status: spec.status, qualificationImpact: spec.impact, sourceRevision, generatedAt: new Date().toISOString(), verificationRecords: spec.records, blockers: spec.blockers };
  await writeFile(`verification/evidence/validation/phase13/${spec.milestone.toLowerCase()}-${spec.name}.json`, `${JSON.stringify(evidence, null, 2)}\n`);
}
execFileSync(process.execPath, ['tests/p13-m4-m9-index-milestones-ui.mjs'], { stdio: 'inherit' });
console.log(JSON.stringify({ ok: true, milestones: specs.map((row) => row.milestone) }, null, 2));
