export const LAUNCH_READINESS_VERSION = 'p3-m20-launch-readiness';
export const LAUNCH_READINESS_GATE_VERSION = 'p3-m20-launch-readiness-gate-v1';

export function buildLaunchReadinessReport(evidence = {}) {
  const gates = [
    gate('G1', 'Full test suite', evidence.fullSuiteGreen === true, 'Automated suite completed with failed 0.'),
    gate('G2', 'Solver and nonlinear benchmarks', evidence.benchmarkGreen === true, 'B1-B8 and elastic benchmark gates passed.'),
    gate('G3', 'Point-cloud synthetic benchmark', evidence.pointCloudGreen === true, 'Synthetic extraction recall/precision gate passed.'),
    gate('G4', 'Representative building pilot', evidence.pilot?.summary?.pilotCount === 10 && evidence.pilot?.summary?.analysisOkCount === 10, 'Ten representative projects generated analysis and review data.'),
    gate('G5', 'Platform workflow e2e', evidence.platformGreen === true, 'Login, project, revision, report, and approval tests passed.'),
    gate('G6', 'Import e2e', evidence.importGreen === true, 'DXF and point-cloud import validation reached analyzable models.'),
    gate('G7', 'Performance budget record', evidence.performanceRecorded === true, 'Performance budget status recorded for launch review.'),
    gate('G8', 'Security checklist', evidence.securityChecklistSigned === true, 'Security checklist recorded for launch review.'),
    gate('G9', 'User manual refresh', evidence.manual?.updated === true, 'Manual includes Phase 3 import, nonlinear, design, report, and agent workflow.'),
    gate('G10', 'Agent contract current', agentContractMatches(evidence.manifest, evidence.agentContract), 'Manual agent contract mirrors manifest read APIs.'),
    gate('G11', 'Beta pilot reports', evidence.pilotReports?.count === 10, 'Ten beta pilot scenario reports are present.'),
    gate('G12', 'Backup restore rehearsal', evidence.backupRestoreRecorded === true, 'Backup and restore rehearsal record exists.'),
    gate('G13', 'Design module verification', evidence.designVerificationRecorded === true, 'RC, steel, connection, and foundation verification record exists.'),
    gate('G14', 'Calculation package completeness', evidence.notCheckedCount === 0 && evidence.calculationTraceConnected === true, 'Default calculation package has no not-checked chapter and includes trace/limitations.'),
  ];
  return {
    version: LAUNCH_READINESS_VERSION,
    releaseGate: buildLaunchReadinessGate(gates, evidence),
    status: gates.every((item) => item.status === 'OK') ? 'OK' : 'REVIEW',
    gates,
    summary: {
      okCount: gates.filter((item) => item.status === 'OK').length,
      reviewCount: gates.filter((item) => item.status !== 'OK').length,
      total: gates.length,
    },
    packaging: buildPackagingReadiness(evidence),
    license: buildLicenseReadiness(evidence),
  };
}

export function buildLaunchReadinessGate(gates = [], evidence = {}) {
  const coverage = {
    packaging: !!(evidence.files?.indexHtml && evidence.files?.serverMain),
    license: String(evidence.licenseText || '').trim().length > 0,
    manual: evidence.manual?.updated === true,
    qa: evidence.fullSuiteGreen === true && evidence.benchmarkGreen === true,
    pilotReports: evidence.pilotReports?.count || 0,
    backupRestore: evidence.backupRestoreRecorded === true,
    ownerSignoffChecklist: evidence.ownerSignoffChecklistRecorded === true,
  };
  return {
    version: LAUNCH_READINESS_GATE_VERSION,
    milestone: 'P3-M20',
    tickets: ['P3-T63', 'P3-T64', 'P3-T65', 'P3-T66', 'P3-T67'],
    requiredGates: gates.map((item) => item.id),
    ok: gates.length === 14 && gates.every((item) => item.status === 'OK'),
    ticketCoverage: buildLaunchTicketCoverage(gates, evidence, coverage),
    coverage,
    manualSignoffRequired: [
      'owner license policy',
      'deployment target',
      'field pilot feedback',
      'backup restore rehearsal evidence',
    ],
  };
}

function buildLaunchTicketCoverage(gates, evidence, coverage) {
  const byId = Object.fromEntries(gates.map((item) => [item.id, item.status === 'OK']));
  const readApis = evidence.agentContract?.readApis?.length || 0;
  return [
    {
      ticket: 'P3-T63',
      scope: 'packaging-smoke',
      covered: coverage.packaging === true && !!evidence.packageJson?.scripts?.dev,
      evidence: `index=${!!evidence.files?.indexHtml}, server=${!!evidence.files?.serverMain}, mode=${evidence.packageJson?.scripts?.dev ? 'web-server' : 'manual-static'}`,
    },
    {
      ticket: 'P3-T64',
      scope: 'license-policy-record',
      covered: coverage.license === true,
      evidence: `license=${coverage.license ? 'RECORDED' : 'MISSING'}, private=${evidence.packageJson?.private === true}`,
    },
    {
      ticket: 'P3-T65',
      scope: 'onboarding-manual-agent-contract',
      covered: coverage.manual === true && byId.G10 === true,
      evidence: `manual=${coverage.manual ? 'updated' : 'missing'}, readApis=${readApis}`,
    },
    {
      ticket: 'P3-T66',
      scope: 'performance-security-launch-gate',
      covered: ['G1', 'G2', 'G3', 'G5', 'G6', 'G7', 'G8', 'G12', 'G13', 'G14'].every((id) => byId[id] === true),
      evidence: `performance=${byId.G7 ? 'OK' : 'REVIEW'}, security=${byId.G8 ? 'OK' : 'REVIEW'}, backup=${coverage.backupRestore ? 'OK' : 'REVIEW'}`,
    },
    {
      ticket: 'P3-T67',
      scope: 'beta-pilot-scenarios',
      covered: coverage.pilotReports === 10 && byId.G4 === true && byId.G11 === true,
      evidence: `${coverage.pilotReports} pilot reports, analysisOk=${evidence.pilot?.summary?.analysisOkCount || 0}`,
    },
  ];
}

export function buildPackagingReadiness(evidence = {}) {
  const files = evidence.files || {};
  return {
    version: LAUNCH_READINESS_VERSION,
    mode: evidence.packageJson?.scripts?.dev ? 'web-server' : 'manual-static',
    smoke: !!(files.indexHtml && files.serverMain && evidence.packageJson?.scripts?.dev),
    installCommand: evidence.packageJson?.scripts?.dev ? 'npm run dev' : 'open index.html',
  };
}

export function buildLicenseReadiness(evidence = {}) {
  const licenseText = String(evidence.licenseText || '');
  const hasLicense = licenseText.trim().length > 0;
  return {
    version: LAUNCH_READINESS_VERSION,
    status: hasLicense ? 'RECORDED' : 'MISSING',
    packagePrivate: evidence.packageJson?.private === true,
    licenseFile: hasLicense ? 'LICENSE.txt' : null,
    note: hasLicense ? 'License text is recorded; open-source license selection remains owner policy.' : 'License file is missing.',
  };
}

function agentContractMatches(manifest, contract) {
  if (!manifest || !contract) return false;
  const manifestApis = [...(manifest.readApis || [])].sort();
  const contractApis = [...(contract.readApis || [])].sort();
  return JSON.stringify(manifestApis) === JSON.stringify(contractApis);
}

function gate(id, name, ok, evidence) {
  return { id, name, status: ok ? 'OK' : 'REVIEW', evidence };
}
