export const PROJECT_SETUP_VERSION = 'p7-m0-project-setup-v1';

export const PROJECT_SETUP_STATUSES = new Set([
  'load-setup-required',
  'draft',
  'configured',
  'legacy-unreviewed',
]);

export function defaultProjectSetup(status = 'legacy-unreviewed') {
  return {
    version: PROJECT_SETUP_VERSION,
    status: PROJECT_SETUP_STATUSES.has(status) ? status : 'load-setup-required',
    templateId: null,
    configuredAt: null,
    reviewedAt: null,
    warnings: [],
  };
}

export function defaultDesignBasis() {
  return {
    status: 'unconfigured',
    codeSourceId: null,
    designMethod: null,
    unitSystem: null,
    fields: {},
    floorUsages: [],
    confirmedFields: [],
  };
}

export function normalizeProjectSetup(input, fallbackStatus = 'legacy-unreviewed') {
  const base = defaultProjectSetup(fallbackStatus);
  const source = input && typeof input === 'object' ? input : {};
  return {
    ...base,
    ...source,
    version: PROJECT_SETUP_VERSION,
    status: PROJECT_SETUP_STATUSES.has(source.status) ? source.status : base.status,
    warnings: uniqueStrings(source.warnings),
  };
}

export function normalizeDesignBasis(input) {
  const base = defaultDesignBasis();
  const source = input && typeof input === 'object' ? input : {};
  return {
    ...base,
    ...source,
    fields: source.fields && typeof source.fields === 'object' ? { ...source.fields } : {},
    floorUsages: Array.isArray(source.floorUsages) ? source.floorUsages.map((item) => ({ ...item })) : [],
    confirmedFields: uniqueStrings(source.confirmedFields),
  };
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}
