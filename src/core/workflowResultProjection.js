// Execution telemetry is retained and hashed in the raw run record. This
// versioned projection removes only measured wall-clock metadata for parity.
export const WORKFLOW_RESULT_PROJECTION_VERSION = 'p19-result-projection-v1';
const clockFields = new Set(['requestedAt','startedAt','completedAt','finishedAt','createdAt',
  'durationMs','totalSolveMs','totalFactorizationMs','elapsedMs']);
export function workflowResultProjection(value) {
  if (Array.isArray(value)) return value.map(workflowResultProjection);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !clockFields.has(key)).map(([key,item]) => [key,
    ['model','settings','input','analysisCase'].includes(key) ? structuredClone(item) : workflowResultProjection(item)]));
}
