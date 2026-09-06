export const VALIDATION_HEALTH_VERSION = 'p2-t04-validation-health';

export function summarizeValidationHealth(validation = {}) {
  const errors = validation.errors || [];
  const warnings = validation.warnings || [];
  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);
  return {
    healthVersion: VALIDATION_HEALTH_VERSION,
    modelHealthScore: score,
    issueCount: errors.length + warnings.length,
    status: errors.length ? 'ERROR' : warnings.length ? 'WARN' : 'OK',
  };
}
