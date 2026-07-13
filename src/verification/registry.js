export const VERIFICATION_REGISTRY_VERSION = 'p8-m6.1-verification-registry-v7';
export const PHASE8_EVIDENCE_ARTIFACT_VERSION = 'p8-evidence-artifact-v1';
export const P8_M0_GOVERNANCE_AUDIT_VERSION = 'p8-m0-governance-evidence-v1';

const TRUSTED_ANALYSIS_AUDIT_VERSIONS = new Set([
  'p7-m11-run-record-audit-v1',
  'p7-m11-ui-verification-v1',
]);

const GOVERNANCE_AUDIT_VERSIONS = new Set([P8_M0_GOVERNANCE_AUDIT_VERSION]);

export const PHASE8_VERIFICATION_SUITES = Object.freeze([
  Object.freeze({
    id: 'P8-M0-GOV',
    milestone: 'P8-M0',
    required: true,
    verificationIds: Object.freeze([
      'NL-GOV-01',
      'NL-GOV-02',
      'NL-GOV-03',
      'NL-GOV-04',
      'NL-GOV-05',
      'NL-GOV-06',
    ]),
  }),
  Object.freeze({
    id: 'P8-M1-DOMAIN-STATE',
    milestone: 'P8-M1',
    required: true,
    verificationIds: Object.freeze([
      'NL-DOM-01',
      'NL-DOM-02',
      'NL-DOM-03',
      'NL-DOM-04',
      'NL-DOM-05',
      'NL-DOM-06',
      'NL-DOM-07',
      'NL-DOM-08',
      'NL-STATE-01',
      'NL-STATE-02',
      'NL-STATE-03',
      'NL-STATE-04',
      'NL-STATE-05',
      'NL-STATE-06',
      'NL-STATE-07',
      'NL-MEI-01',
      'NL-MEI-02',
      'NL-MEI-03',
      'NL-MEI-04',
      'NL-MEI-05',
      'NL-MEI-06',
      'NL-MEI-07',
      'NL-MEI-08',
    ]),
  }),
  Object.freeze({
    id: 'P8-M2-EQUILIBRIUM',
    milestone: 'P8-M2',
    required: true,
    verificationIds: Object.freeze([
      'NL-EQ-01',
      'NL-EQ-02',
      'NL-EQ-03',
      'NL-EQ-04',
      'NL-EQ-05',
      'NL-EQ-06',
      'NL-EQ-07',
      'NL-EQ-08',
      'NL-EQ-09',
      'NL-EQ-10',
      'NL-EQ-11',
      'NL-EQ-12',
      'NL-CTRL-01',
      'NL-CTRL-02',
      'NL-CTRL-03',
      'NL-CTRL-04',
    ]),
  }),
  Object.freeze({
    id: 'P8-M3-COROTATIONAL',
    milestone: 'P8-M3',
    required: true,
    verificationIds: Object.freeze([
      'NL-COR-01',
      'NL-COR-02',
      'NL-COR-03',
      'NL-COR-04',
      'NL-COR-05',
      'NL-COR-06',
      'NL-COR-07',
      'NL-COR-08',
      'NL-COR-09',
      'NL-COR-10',
      'NL-COR-11',
      'NL-COR-12',
    ]),
  }),
  Object.freeze({
    id: 'P8-M4-CONCENTRATED-HINGE',
    milestone: 'P8-M4',
    required: true,
    verificationIds: Object.freeze([
      'NL-HNG-01',
      'NL-HNG-02',
      'NL-HNG-03',
      'NL-HNG-04',
      'NL-HNG-05',
      'NL-HNG-06',
      'NL-HNG-07',
      'NL-HNG-08',
      'NL-HNG-09',
      'NL-HNG-10',
      'NL-HNG-11',
      'NL-HNG-12',
    ]),
  }),
  Object.freeze({
    id: 'P8-M5-FORMAL-PUSHOVER',
    milestone: 'P8-M5',
    required: true,
    verificationIds: Object.freeze([
      'NL-PUSH-01', 'NL-PUSH-02', 'NL-PUSH-03', 'NL-PUSH-04',
      'NL-PUSH-05', 'NL-PUSH-06', 'NL-PUSH-07', 'NL-PUSH-08',
      'NL-PUSH-09', 'NL-PUSH-10', 'NL-PUSH-11', 'NL-PUSH-12',
      'NL-PUSH-13', 'NL-PUSH-14',
      'NL-CTRL-05', 'NL-CTRL-06', 'NL-CTRL-07', 'NL-CTRL-08',
      'NL-MEI-09', 'NL-MEI-10', 'NL-MEI-11', 'NL-MEI-12',
      'NL-MEI-13', 'NL-MEI-14', 'NL-MEI-15',
    ]),
  }),
  Object.freeze({
    id: 'P8-M6-FIBER-PMM',
    milestone: 'P8-M6',
    required: true,
    verificationIds: Object.freeze([
      'NL-FIB-01', 'NL-FIB-02', 'NL-FIB-03', 'NL-FIB-04',
      'NL-FIB-05', 'NL-FIB-06', 'NL-FIB-07', 'NL-FIB-08',
      'NL-FIB-09', 'NL-FIB-10', 'NL-FIB-11', 'NL-FIB-12',
      'NL-FIB-13', 'NL-FIB-14',
      'NL-PMM-01', 'NL-PMM-02', 'NL-PMM-03', 'NL-PMM-04',
      'NL-PMM-05', 'NL-PMM-06', 'NL-PMM-07', 'NL-PMM-08',
    ]),
  }),
  Object.freeze({
    id: 'P8-M6-PMM-RUNTIME',
    milestone: 'P8-M6',
    required: true,
    verificationIds: Object.freeze([
      'NL-PMM-09', 'NL-PMM-10', 'NL-PMM-11',
      'NL-PMM-12', 'NL-PMM-13', 'NL-PMM-14',
    ]),
  }),
]);

export function isTrustedVerificationAuditVersion(version, options = {}) {
  const purpose = options.purpose || 'analysis-result';
  if (purpose === 'governance') return GOVERNANCE_AUDIT_VERSIONS.has(String(version || ''));
  return TRUSTED_ANALYSIS_AUDIT_VERSIONS.has(String(version || ''));
}

export function getPhase8VerificationSuite(id) {
  const suite = PHASE8_VERIFICATION_SUITES.find((item) => item.id === id);
  return suite ? clone(suite) : null;
}

export function validatePhase8EvidenceArtifact(artifact = {}) {
  const errors = [];
  if (!record(artifact)) return { ok: false, errors: ['artifact:not-object'] };
  if (artifact.version !== PHASE8_EVIDENCE_ARTIFACT_VERSION) errors.push('artifact:version');
  const suite = getPhase8VerificationSuite(artifact.suiteId);
  if (!suite) errors.push('artifact:suite');
  if (artifact.milestone !== suite?.milestone) errors.push('artifact:milestone');
  if (artifact.status !== 'PASS') errors.push('artifact:status');
  if (!clean(artifact.generatedAt)) errors.push('artifact:generatedAt');
  if (!clean(artifact.sourceRevision)) errors.push('artifact:sourceRevision');
  const ids = new Set(Array.isArray(artifact.verificationIds) ? artifact.verificationIds : []);
  for (const id of suite?.verificationIds || []) {
    if (!ids.has(id)) errors.push(`artifact:missing:${id}`);
  }
  const rows = Array.isArray(artifact.results) ? artifact.results : [];
  for (const id of suite?.verificationIds || []) {
    const row = rows.find((item) => item?.id === id);
    if (!row || row.status !== 'PASS' || !clean(row.test)) errors.push(`artifact:result:${id}`);
  }
  if (!record(artifact.environment) || !clean(artifact.environment.profileVersion)) errors.push('artifact:environment');
  return { ok: errors.length === 0, errors };
}

export function verificationRegistryManifest() {
  return {
    version: VERIFICATION_REGISTRY_VERSION,
    trustedAuditVersions: [...TRUSTED_ANALYSIS_AUDIT_VERSIONS],
    trustedAnalysisAuditVersions: [...TRUSTED_ANALYSIS_AUDIT_VERSIONS],
    governanceAuditVersions: [...GOVERNANCE_AUDIT_VERSIONS],
    suites: PHASE8_VERIFICATION_SUITES.map(clone),
  };
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
