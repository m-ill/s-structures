import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

execFileSync(process.execPath, ['tests/p13-m2-model-check-repair.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/p13-m2-index-model-check-ui.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/p13-m2-agent-report-parity.mjs'], { stdio: 'inherit' });
const safeDirectory = process.cwd().replaceAll('\\', '/');
const sourceRevision = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const outputPath = 'verification/evidence/validation/phase13/p13-m2-model-check-repair.json';
const ids = Array.from({ length: 9 }, (_, index) => `P13-MC-${String(index + 1).padStart(2, '0')}`);
const evidence = {
  version: 'p13-m2-evidence-v2', phase: 'Phase 13', milestone: 'P13-M2', status: 'PASS',
  qualificationImpact: 'implementation-complete-only',
  generatedAt: new Date().toISOString(), sourceRevision,
  verificationRecords: [
    ...ids.map((id) => ({ id, status: 'PASS' })),
    { id: 'P13-MC-10', status: 'PASS', detail: 'UI, Agent API and detailed-report issue/waiver IDs and status are identical.' },
  ],
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, outputPath }, null, 2));
