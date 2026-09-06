import { execFileSync } from 'node:child_process'; import { mkdir, writeFile } from 'node:fs/promises'; import { dirname } from 'node:path';
execFileSync(process.execPath, ['tests/p13-m3-load-mass-workspace.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/p13-m3-index-load-workspace-ui.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/p13-m3-performance-migration.mjs'], { stdio: 'inherit' });
const safe = process.cwd().replaceAll('\\', '/'); const sourceRevision = execFileSync('git', ['-c', `safe.directory=${safe}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const outputPath = 'verification/evidence/validation/phase13/p13-m3-load-mass-workspace.json';
const evidence = {
  version: 'p13-m3-evidence-v2', phase: 'Phase 13', milestone: 'P13-M3', status: 'PARTIAL',
  qualificationImpact: 'integrated-ui-in-progress', sourceRevision, generatedAt: new Date().toISOString(),
  verificationRecords: [
    { id: 'P13-LM-01', status: 'PASS', detail: 'Six-resultant load audit is shared by UI/API/report milestone snapshot.' },
    { id: 'P13-LM-02', status: 'PASS' },
    { id: 'P13-LM-03', status: 'PASS' },
    { id: 'P13-LM-04', status: 'PASS' },
    { id: 'P13-LM-05', status: 'PASS', detail: 'Physical member/self-weight mass uses exclusive source ownership.' },
    { id: 'P13-LM-06', status: 'PASS', detail: 'Mass-source trace and assembled total parity contract passed.' },
    { id: 'P13-LM-07', status: 'PASS' },
    { id: 'P13-LM-08', status: 'BLOCKED', detail: 'Unit/direction mapping UI and unmapped-column evidence remain.' },
    { id: 'P13-LM-09', status: 'PASS' },
    { id: 'P13-LM-10', status: 'PASS', detail: '250-panel preview p95 is measured against the 2-second budget.' },
    { id: 'P13-LM-11', status: 'PASS', detail: 'JSON save/reopen logical workspace parity passed.' },
    { id: 'P13-LM-12', status: 'PASS', detail: 'Each integrated Apply/Undo issues one explicit stale transition.' },
  ],
};
await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`); console.log(JSON.stringify({ ok: true, outputPath }, null, 2));
