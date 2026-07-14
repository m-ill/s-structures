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
    manualVersion: '2026-07-14-phase8-m11',
    product: manifest.product,
    manifestVersion: manifest.version,
    entrypoint: {
      recommendedUrl: 'http://127.0.0.1:5173/',
      primaryHtml: 'index.html',
    },
    readApis: manifest.readApis,
    executeActions: manifest.executeActions,
    readWorkflows: {
      phase3ImportReview: ['listImportCandidates', 'resolveImportCandidate', 'confirmImport', 'rejectImport'],
      phase3EvidenceRegister: ['listProjectEvidence', 'submitProjectEvidence', 'getPhase3EvidenceRegister'],
    },
    qaCommands: manifest.qaCommands,
    reviewGates: manifest.reviewGates,
    dataContracts: manifest.dataContracts,
    modules: Object.keys(manifest.modules),
    moduleVersions: manifest.modules,
    limitations: manifest.limitations,
    interpretationRules: unique([
      ...manifest.interpretationRules,
      'getPhase3PlanAlignment().status OK means implementation is aligned with the written plan; it does not mean production readiness.',
      'getLaunchReadinessReport().productionReadiness.status must be checked before treating a launch report as final.',
      'getLaunchReadinessReport().agentSafeStatus must be checked before final-use automation.',
      'getLaunchReadinessReport().finalUseReview.requiredReviews lists the remaining accepted fields for final use.',
      'getPhase3EvidenceRegister().summary.evidenceComplete true means the evidence register is complete for review; it does not mean final production approval.',
      'submitProjectEvidence accepts only IDs listed by getPhase3EvidenceRegister().rows or a matching required evidence type label.',
      'getPhase3OwnerSignoffReview().deploymentApprovalGroup lists owner sign-off review aliases.',
      'summary.readyForAgentReview and related convenience flags must be interpreted through getCapabilities().reviewGates.',
      'A readyDecision does not set the listed finalApprovalField.',
      'Milestone review APIs expose exitCriteriaSummary; automated-exit-criteria-covered does not mean production approval.',
      'Agents must inspect remainingValidation before advancing workflows.',
    ]),
    manualReferences: manifest.manualReferences,
    phase4ManualReferences: {
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

function unique(values) {
  return [...new Set(values)];
}
