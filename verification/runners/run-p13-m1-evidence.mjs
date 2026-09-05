import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

execFileSync(process.execPath, ['tests/p13-m1-unified-run-workspace.mjs'], { stdio: 'inherit' });
execFileSync(process.execPath, ['tests/p13-m1-index-workspace-integration.mjs'], { stdio: 'inherit' });
const safeDirectory = process.cwd().replaceAll('\\', '/');
const sourceRevision = execFileSync('git', ['-c', `safe.directory=${safeDirectory}`, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const outputPath = 'verification/evidence/validation/phase13/p13-m1-unified-run-workspace.json';
const evidence = {
  version: 'p13-m1-evidence-v1',
  phase: 'Phase 13',
  milestone: 'P13-M1',
  status: 'PASS',
  qualificationImpact: 'implementation-complete-only',
  generatedAt: new Date().toISOString(),
  sourceRevision,
  releaseInvariants: {
    openSeesRuntimeUsed: false,
    externalSolverRuntimeDependency: false,
    nonlinearInScope: false,
    shellDesignTransferAllowed: false,
  },
  verificationRecords: [
    pass('P13-RUN-01', 'Unified service and workspace consume one run ID.'),
    pass('P13-RUN-02', 'Engineering model edits produce stale state.'),
    pass('P13-RUN-03', 'View-state changes do not produce stale state.'),
    pass('P13-RUN-04', 'Mixed-run publication fails closed.'),
    pass('P13-RUN-05', 'Failed and cancelled runs preserve the last success.'),
    pass('P13-RUN-06', 'Hash-qualified current state is reconstructible from the store.'),
    pass('P13-RUN-07', 'Legacy Phase 7 records migrate without result loss.'),
    pass('P13-RUN-08', 'Out-of-order older results cannot replace a newer success.'),
    pass('P13-WS-01', 'Six workspace modes share one normalized store.'),
    pass('P13-WS-02', 'Tree, viewport, and inspector share object-ID selection.'),
    pass('P13-WS-03', 'The normalized 1280x720 layout retains a 600px center pane.'),
    pass('P13-WS-04', 'Workspace updates are observable and layout state is separate from project data.'),
    pass('P13-WS-05', 'The index bridge mounts the real six-tab workspace and keeps batch results inside the workspace.'),
    pass('P13-WS-06', 'The integrated batch executes six elastic cases without touching nonlinear analysis.'),
  ],
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, outputPath, sourceRevision }, null, 2));

function pass(id, detail) {
  return { id, status: 'PASS', detail };
}
