import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entries = [
  { milestone: 'M0', cases: ['T00', 'T18'], file: 'tests/p24-m0-scope.mjs' },
  { milestone: 'M0', cases: ['T00'], file: 'tests/p24-m0-kcsc-sources.mjs' },
  { milestone: 'M1', cases: ['T01', 'T18'], file: 'tests/p24-m1-material-input.mjs' },
  { milestone: 'M1', cases: ['T01'], file: 'tests/p24-m1-material-routing.mjs' },
  { milestone: 'M1', cases: ['T02', 'T18'], file: 'tests/p24-m1-section-input.mjs' },
  { milestone: 'M1', cases: ['T03', 'T18'], file: 'tests/p24-m1-details-input.mjs' },
  { milestone: 'M2', cases: ['T05'], file: 'tests/p24-m2-detail-persistence.mjs' },
  { milestone: 'M2', cases: ['T04','T18'], file: 'tests/p24-m2-reuse.mjs' },
  { milestone: 'M2', cases: ['T04','T05','T18'], file: 'tests/p24-m2-history.mjs' },
  { milestone: 'M2', cases: ['T05'], file: 'tests/p24-m2-checkpoint.mjs' },
  { milestone: 'M3', cases: ['T06','T07'], file: 'tests/p24-m3-evaluation.mjs' },
  { milestone: 'M3', cases: ['T06'], file: 'tests/p24-m3-direct-source.mjs' },
  { milestone: 'M3', cases: ['T06'], file: 'tests/p24-m3-code-basis.mjs' },
  { milestone: 'M4', cases: ['T08'], file: 'tests/p24-m4-stirrups.mjs' },
  { milestone: 'M4', cases: ['T09'], file: 'tests/p24-m4-section.mjs' },
  { milestone: 'M4', cases: ['T10'], file: 'tests/p24-m4-kds-anchorage.mjs' },
  { milestone: 'M4', cases: ['T09'], file: 'tests/p24-m4-kds-strength.mjs' },
  { milestone: 'M4', cases: ['T08'], file: 'tests/p24-m4-kds-shear.mjs' },
  { milestone: 'M4', cases: ['T11'], file: 'tests/p24-m4-kds-service.mjs' },
  { milestone: 'M4', cases: ['T08','T10','T11'], file: 'tests/p24-m4-provided.mjs' },
  { milestone: 'M5', cases: ['T12','T18'], file: 'tests/p24-m5-workflow.mjs' },
  { milestone: 'M5', cases: ['T12','T13'], file: 'tests/p24-m5-section-candidates.mjs' },
  { milestone: 'M6', cases: ['T14'], file: 'tests/p24-m6-joint.mjs' },
  { milestone: 'M6', cases: ['T14'], file: 'tests/p24-m6-kds-joint.mjs' },
  { milestone: 'M7', cases: ['T15'], file: 'tests/p24-m7-footing.mjs' },
  { milestone: 'M7', cases: ['T15'], file: 'tests/p24-m7-kds-punching.mjs' },
  { milestone: 'M8', cases: ['T16'], file: 'tests/p24-m8-drawings.mjs' },
  { milestone: 'M8', cases: ['T16'], file: 'tests/p24-m8-fabrication.mjs' },
  { milestone: 'M8', cases: ['T16'], file: 'tests/p24-m8-assets.mjs' },
  { milestone: 'M9', cases: ['T12','T13','T17','T18'], file: 'tests/p24-m9-smoke.mjs' },
];
const args = process.argv.slice(2);
if (!args.length || args.includes('--list')) {
  console.log(JSON.stringify({ scope: 'focused-only', tests: entries }, null, 2));
} else {
  const options = {};
  for (const arg of args) {
    const match = /^--(milestone|case)=(M\d+|T\d+)$/.exec(arg);
    if (match) options[match[1]] = match[2];
    else if (arg !== '--focused') throw new Error(`Unsupported test option: ${arg}`);
  }
  if (!options.milestone) throw new Error('Explicit --milestone required; full suites are not a development default');
  const selected = entries.filter(row => row.milestone === options.milestone && (!options.case || row.cases.includes(options.case)));
  if (!selected.length) throw new Error('No implemented focused test matches this selection');
  for (const row of selected) {
    const start = performance.now();
    const result = spawnSync(process.execPath, [row.file], { cwd: root, stdio: 'inherit', timeout: 60000 });
    console.log(JSON.stringify({ ...row, elapsedMs: Math.round(performance.now() - start), exitCode: result.status, error: result.error?.code || null }));
    if (result.error || result.status !== 0) { process.exitCode = result.status || 1; break; }
  }
}
