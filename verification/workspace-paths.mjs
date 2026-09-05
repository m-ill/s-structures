import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERIFICATION_WORKSPACE_PATHS_VERSION = 'p17-verification-workspace-paths-v9';

export const VERIFICATION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
export const REPOSITORY_ROOT = path.resolve(VERIFICATION_ROOT, '..');

export const VERIFICATION_PATHS = Object.freeze({
  root: VERIFICATION_ROOT,
  specs: path.join(VERIFICATION_ROOT, 'specs'),
  phase17Specs: path.join(VERIFICATION_ROOT, 'specs', 'phase17'),
  framework: path.join(VERIFICATION_ROOT, 'framework'),
  phase17Framework: path.join(VERIFICATION_ROOT, 'framework', 'phase17'),
  tests: path.join(VERIFICATION_ROOT, 'tests'),
  taxonomy: path.join(VERIFICATION_ROOT, 'tests', 'taxonomy.json'),
  validationEvidence: path.join(VERIFICATION_ROOT, 'evidence', 'validation'),
  phase16Evidence: path.join(VERIFICATION_ROOT, 'evidence', 'validation', 'phase16', 'p16-m7-repository-separation.json'),
  phase17Evidence: path.join(VERIFICATION_ROOT, 'evidence', 'validation', 'phase17'),
  phase17M1Evidence: path.join(VERIFICATION_ROOT, 'evidence', 'validation', 'phase17', 'p17-m1-case-contract-shared-harness-r6.json'),
  phase17M1Closure: path.join(VERIFICATION_ROOT, 'evidence', 'validation', 'phase17', 'p17-m1-validation-closure-r1.json'),
  strix21Suite: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21'),
  strix21SuiteManifest: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'suite-manifest.json'),
  strix21Cases: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'cases'),
  strix21Custom: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'custom'),
  strix21Runs: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'runs'),
  strix21References: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'references'),
  strix21SourceLocks: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'references', 'source-locks-r2'),
  strix21SupersededSourceLocks: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'references', 'source-locks'),
  strix21Reporting: path.join(VERIFICATION_ROOT, 'benchmarks', 'strix21', 'reporting'),
  runners: path.join(VERIFICATION_ROOT, 'runners'),
  harnesses: path.join(VERIFICATION_ROOT, 'harnesses'),
  archive: path.join(VERIFICATION_ROOT, 'archive'),
  relocationManifest: path.join(VERIFICATION_ROOT, 'archive', 'legacy-layout-map.json'),
  temporary: path.join(REPOSITORY_ROOT, 'tmp', 'verification'),
  deliverables: path.join(REPOSITORY_ROOT, 'output', 'verification'),
  phase17Deliverables: path.join(REPOSITORY_ROOT, 'output', 'verification', 'phase17'),
});

export const VERIFICATION_REPOSITORY_PATHS = Object.freeze({
  specs: 'verification/specs',
  phase17Specs: 'verification/specs/phase17',
  framework: 'verification/framework',
  phase17Framework: 'verification/framework/phase17',
  tests: 'verification/tests',
  taxonomy: 'verification/tests/taxonomy.json',
  validationEvidence: 'verification/evidence/validation',
  phase16Evidence: 'verification/evidence/validation/phase16/p16-m7-repository-separation.json',
  phase17Evidence: 'verification/evidence/validation/phase17',
  phase17M1Evidence: 'verification/evidence/validation/phase17/p17-m1-case-contract-shared-harness-r6.json',
  phase17M1Closure: 'verification/evidence/validation/phase17/p17-m1-validation-closure-r1.json',
  strix21Suite: 'verification/benchmarks/strix21',
  strix21SuiteManifest: 'verification/benchmarks/strix21/suite-manifest.json',
  strix21Cases: 'verification/benchmarks/strix21/cases',
  strix21Custom: 'verification/benchmarks/strix21/custom',
  strix21Runs: 'verification/benchmarks/strix21/runs',
  strix21References: 'verification/benchmarks/strix21/references',
  strix21SourceLocks: 'verification/benchmarks/strix21/references/source-locks-r2',
  strix21SupersededSourceLocks: 'verification/benchmarks/strix21/references/source-locks',
  strix21Reporting: 'verification/benchmarks/strix21/reporting',
  relocationManifest: 'verification/archive/legacy-layout-map.json',
  temporary: 'tmp/verification',
  deliverables: 'output/verification',
  phase17Deliverables: 'output/verification/phase17',
});

export const LEGACY_VERIFICATION_PATHS = Object.freeze({
  specs: path.join(REPOSITORY_ROOT, 'docs', 'verification'),
  validationEvidence: path.join(REPOSITORY_ROOT, 'reports', 'validation-evidence'),
  strix21Runs: path.join(REPOSITORY_ROOT, 'reports', 'benchmark-evidence', 'strix21'),
});

export function remapLegacyVerificationPath(repositoryRelativePath) {
  const normalized = String(repositoryRelativePath || '').replaceAll('\\', '/');
  const mappings = [
    ['docs/verification', 'verification/specs'],
    ['reports/validation-evidence', 'verification/evidence/validation'],
    ['reports/benchmark-evidence/strix21', 'verification/benchmarks/strix21/runs'],
  ];
  for (const [legacy, canonical] of mappings) {
    if (normalized === legacy || normalized.startsWith(`${legacy}/`)) {
      return `${canonical}${normalized.slice(legacy.length)}`;
    }
  }
  return normalized;
}
