import { readFile, writeFile } from 'node:fs/promises';
import { buildAgentManifest } from '../src/ui/agentManifest.js';
import { availableAgentActions } from '../src/ui/indexAgentActionCatalog.js';

const out = 'docs/user-manual/agent-contract.json';
const canonical = buildContract();
if (process.argv.includes('--write')) {
  await writeFile(out, `${JSON.stringify(canonical, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, version: canonical.manualVersion, wrote: out }, null, 2));
} else {
  const current = JSON.parse(await readFile(out, 'utf8'));
  const ok = JSON.stringify(current) === JSON.stringify(canonical);
  if (!ok) {
    console.error(JSON.stringify({ ok: false, expected: canonical.manualVersion, file: out }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, version: canonical.manualVersion, file: out }, null, 2));
}

function buildContract() {
  const manifest = buildAgentManifest({ availableActions: availableAgentActions() });
  return {
    schemaVersion: 3,
    manualVersion: '2026-07-03-phase4-prebeta',
    product: manifest.product,
    manifestVersion: manifest.version,
    entrypoint: {
      recommendedUrl: 'http://127.0.0.1:5173/',
      primaryHtml: 'index.html',
    },
    readApis: manifest.readApis,
    executeActions: manifest.executeActions,
    qaCommands: manifest.qaCommands,
    reviewGates: manifest.reviewGates,
    dataContracts: manifest.dataContracts,
    modules: manifest.modules,
    limitations: manifest.limitations,
    manualReferences: {
      install: 'docs/user-manual/00-install.md',
      gettingStarted: 'docs/user-manual/01-getting-started.md',
      modeling: 'docs/user-manual/02-modeling-and-elastic-analysis.md',
      reports: 'docs/user-manual/03-loads-design-and-reports.md',
      drawings: 'docs/user-manual/04-import-drawings.md',
      pointcloud: 'docs/user-manual/05-import-pointcloud.md',
      materials: 'docs/user-manual/06-materials-library.md',
      nonlinear: 'docs/user-manual/07-nonlinear-analysis.md',
      collaboration: 'docs/user-manual/08-collaboration.md',
      status: 'docs/user-manual/STATUS_AND_LIMITS.md',
      agentGuide: 'docs/user-manual/AI_AGENT_GUIDE.md',
      coverage: 'docs/phase4/DOCUMENTATION_COVERAGE.md',
    },
  };
}
