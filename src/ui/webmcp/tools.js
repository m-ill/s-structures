import { createWorkflowTools } from './workflowTools.js';
import { createNonlinearTools } from './nonlinearTools.js';
import { finiteJson } from '../../modeling/designInputCommands.js';
import { stableHash } from '../../core/stableHash.js';
import { SOLVER_UNIT_POLICY } from '../../core/units.js';

export const WEBMCP_VERSION = 'sstructures-webmcp-v2';
const KINDS = ['static', 'modal', 'responseSpectrum', 'buckling', 'linearTha'];
const id = { type: 'string', minLength: 1, maxLength: 128 };
const hash = { type: 'string', pattern: '^[a-f0-9]{64}$' };
const targetSchema = { type: 'string', enum: ['auto', 'cpu', 'gpu'] };
const analysis = { caseId: id, modelHash: hash, computeTarget: targetSchema };
const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// Exclude only derived case execution state. Keep all actual model inputs bound.
export function webmcpModelHash(model) {
  const input = structuredClone(model);
  for (const row of input.analysisCases || []) { delete row.status; delete row.lastRun; }
  return stableHash(input);
}

export function createWebMcpTools({ agent, bridge, onActivity = () => {}, setView = () => ({ok:false,code:'VIEW_UNAVAILABLE'}) }) {
  const requests = new Map();
  const jobs = new Map();
  function model() {
    const value = agent.getModel();
    if (!value) fail('MODEL_REQUIRED', 'Open a model first.');
    return value;
  }
  function context(value = model()) {
    return { modelHash: webmcpModelHash(value), units: value.units || null, solverUnitPolicy: SOLVER_UNIT_POLICY };
  }
  function inputFor(args) {
    const value = model();
    const binding = context(value);
    if (binding.modelHash !== args.modelHash) fail('STALE_MODEL', 'Model changed. Read the current context and plan again.');
    const row = (value.analysisCases || []).find((item) => item.id === args.caseId);
    if (!row) fail('CASE_NOT_FOUND', 'Choose a case returned by get_project_context.');
    if (!KINDS.includes(row.kind)) fail('KIND_NOT_EXPOSED', 'This WebMCP version exposes elastic analysis cases only.');
    if (!value.units?.length || !value.units?.force) fail('UNITS_REQUIRED', 'Model length and force units are required.');
    // The product queue otherwise retains a live model reference. Bind a private
    // snapshot so edits while queued cannot change the input behind its hash.
    return { input: { caseId: args.caseId, computeTarget: args.computeTarget || 'cpu', model: value }, binding };
  }
  function jobInfo(jobId) {
    const binding = jobs.get(jobId);
    if (!binding) fail('JOB_NOT_FOUND', 'Only analysis jobs started in this WebMCP page session are available.');
    const raw = agent.getAnalysisRunStatus({ jobId });
    // Publication may contain the complete report/model. Status is a bounded
    // control-plane response; numerical data is requested through result slices.
    const status = Object.fromEntries([
      'id', 'caseId', 'kind', 'status', 'stage', 'progress', 'progressMessage',
      'createdAt', 'startedAt', 'completedAt', 'resultAvailable', 'error',
      'settingsHash', 'planHash', 'requestedTarget', 'executedTarget',
      'operationRoute', 'qualification', 'designBlocked', 'productProvenance',
    ].map((key) => [key, raw[key]]));
    status.resultVerdict = raw.publication ? {
      ok: raw.publication.ok ?? null, status: raw.publication.status ?? null,
      designBlocked: raw.publication.designBlocked ?? null,
      warnings: (raw.publication.warnings || []).slice(0, 20),
      warningCount: raw.publication.warnings?.length || 0,
    } : null;
    return { ...binding, jobId, stale: binding.modelHash !== context().modelHash, status };
  }
  function tool(name, description, inputSchema, readOnly, run) {
    return {
      name, description, inputSchema,
      annotations: { readOnlyHint: readOnly },
      async execute(args = {}) {
        try{finiteJson(args);}catch{fail('INVALID_INPUT','Input must be finite safe JSON.');}
        if(JSON.stringify(args).length>64000) fail('REQUEST_TOO_LARGE','Maximum input is 64000 characters.');
        validate(inputSchema, args);
        const before=bridge.getWorkflowInputIdentity?.().inputHash;
        const value = await run(args);
        const text = JSON.stringify(value);
        if (text.length > 48000) fail('RESULT_TOO_LARGE', 'Request a narrower path or smaller limit.');
        onActivity({tool:name,ok:value?.ok!==false,designRunId:value?.designRunId,changed:before!==bridge.getWorkflowInputIdentity?.().inputHash});
        return value;
      },
    };
  }
  const workflow=createWorkflowTools({agent,bridge,tool,object,context,setView});
  const nonlinear=createNonlinearTools({agent,tool,context});
  const definitions = [
    tool('get_project_context', 'Read model units, input hash, case IDs and supported analysis capabilities. Does not run analysis.', object(), true, () => {
      const value = model();
      return {
        version: WEBMCP_VERSION, ...context(value),
        inputIdentity: agent.getWorkflowInputIdentity?.({ model: value }) || null,
        counts: Object.fromEntries(['nodes', 'members', 'loads'].map((key) => [key, value[key]?.length || 0])),
        cases: (value.analysisCases || []).slice(0, 100).map(({ id, name, kind, engineId }) => ({ id, name, kind, engineId, exposed: KINDS.includes(kind)||nonlinear.isCase(id) })),
        casesTruncated: (value.analysisCases?.length || 0) > 100,
        capabilities: [...KINDS.map((kind) => {
          const result = agent.getAnalysisCapabilities({ kind });
          return { kind, targets: result.targets };
        }), ...['p8-production-pushover', 'p8-production-mdof-nlth'].map(engineId => ({engineId, qualification:'candidate', designBlocked:true, targets:['cpu'], settings:'case-specific preflight required'}))],
        jobs: [...jobs.keys()],
        limits: { maxSessionJobs: 128, maxConcurrentJobs: 1, editing: true, externalQualification: 'NOT_CLAIMED' },
      };
    }),
    tool('inspect_model', 'Read current Model Check issues, without running a solver or repairing the model.', object({ limit: { type: 'integer', minimum: 1, maximum: 100 } }), true, ({ limit = 30 }) => {
      const check = agent.getPhase13ModelCheck();
      if (!check) fail('MODEL_CHECK_UNAVAILABLE', 'Model Check is unavailable.');
      return { ...context(), checkModelHash: check.modelHash, ok: check.ok, summary: check.summary, issues: check.issues.slice(0, limit), truncated: check.issues.length > limit };
    }),
    tool('select_entities', 'Highlight one existing node or member in the shared view. Changes selection only.', object({ entityType: { type: 'string', enum: ['node', 'member'] }, entityId: id }, ['entityType', 'entityId']), false, ({ entityType, entityId }) => {
      const value = model();
      if (!(value[entityType === 'node' ? 'nodes' : 'members'] || []).some((row) => row.id === entityId)) fail('ENTITY_NOT_FOUND', 'Entity does not exist.');
      const selection = bridge.selectResultEntity(entityType, entityId, 'webmcp');
      if (!selection) fail('SELECTION_UNAVAILABLE', 'Selection is unavailable in this view.');
      return { ...context(value), selection };
    }),
    tool('validate_analysis', 'Validate an existing case and compute route for the current model hash. Does not start a job.', object(analysis, ['caseId', 'modelHash']), true, (args) => {
      if(nonlinear.isCase(args.caseId))return nonlinear.validate(args);
      const { input, binding } = inputFor(args);
      return { ...binding, validation: agent.validateAnalysisRun(input) };
    }),
    tool('plan_analysis', 'Plan an existing analysis case. Review route, qualification and blocking conditions before starting.', object(analysis, ['caseId', 'modelHash']), true, (args) => {
      if(nonlinear.isCase(args.caseId))return nonlinear.plan(args);
      const { input, binding } = inputFor(args);
      return { ...binding, plan: agent.planAnalysisRun(input) };
    }),
    tool('start_analysis', 'Start analysis of the current existing case and publish its results to the UI. Returns a job ID. Reuse requestId to avoid duplicate execution.', object({ ...analysis, requestId: id }, ['caseId', 'modelHash', 'requestId']), false, (args) => {
      if(nonlinear.isCase(args.caseId))return nonlinear.start(args);
      const fingerprint = stableHash({ ...args, computeTarget: args.computeTarget || 'cpu' });
      const previous = requests.get(args.requestId);
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail('REQUEST_ID_CONFLICT', 'Use a new requestId for different inputs.');
        return { ...jobInfo(previous.jobId), reused: true };
      }
      const { input, binding } = inputFor(args);
      if (jobs.size >= 128) fail('SESSION_JOB_LIMIT', 'Session job limit reached. Open a new page session.');
      if ([...jobs.keys()].some((jobId) => ['queued', 'running', 'pending'].includes(agent.getAnalysisRunStatus({ jobId }).status))) fail('ANALYSIS_BUSY', 'Wait for or cancel the current job.');
      const validation = agent.validateAnalysisRun(input);
      if (!validation.ok) return { ...binding, status: 'blocked', validation };
      const job = agent.startAnalysisRun(input);
      jobs.set(job.id, { ...binding, caseId: args.caseId });
      requests.set(args.requestId, { fingerprint, jobId: job.id });
      return { ...jobInfo(job.id), reused: false };
    }),
    tool('get_analysis_status', 'Read execution status, errors, provenance and whether the model changed since this job started.', object({ jobId: id }, ['jobId']), true, ({ jobId }) => nonlinear.owns(jobId)?nonlinear.status(jobId):jobInfo(jobId)),
    tool('get_result_slice', 'Read a bounded path from an existing completed job. Default is summary. Preserves qualification and flags stale results; does not rerun analysis.', object({ jobId: id, path: { type: 'string', minLength: 1, maxLength: 180, pattern: '^(summary|payload)(\\.[A-Za-z0-9_-]+)*$' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, ['jobId']), true, ({ jobId, path = 'summary', limit = 25 }) => {
      if (path.split('.').some((part) => ['__proto__', 'prototype', 'constructor'].includes(part))) fail('INVALID_PATH', 'Unsafe result path.');
      if(nonlinear.owns(jobId))return nonlinear.slice({jobId,path,limit});
      const info = jobInfo(jobId);
      if (!info.status.resultAvailable) fail('RESULT_NOT_READY', 'No result is available. Check analysis status.');
      const slice = agent.getAnalysisResultSlice({ jobId, query: { path, limit } });
      if (slice.data === undefined) fail('RESULT_PATH_NOT_FOUND', 'Result path is unavailable for this case. Start with summary.');
      return { ...info, slice, externalQualification: 'NOT_CLAIMED' };
    }),
    tool('cancel_analysis', 'Request cancellation of one analysis job started by this page session. Completed results are retained.', object({ jobId: id }, ['jobId']), false, ({ jobId }) => {
      if(nonlinear.owns(jobId))return nonlinear.cancel(jobId);
      jobInfo(jobId);
      agent.cancelAnalysisRun({ jobId });
      return jobInfo(jobId);
    }),
    ...workflow.tools,
    ...nonlinear.tools,
  ];
  definitions.dispose=()=>{workflow.dispose();nonlinear.dispose();for(const jobId of jobs.keys()) agent.cancelAnalysisRun({jobId});};
  return definitions;
}

function fail(code, message) { throw Object.assign(new Error(message), { code }); }
export function validate(schema, value, at = 'input') {
  if(schema.oneOf) {let matches=0;for(const child of schema.oneOf){try{validate(child,value,at);matches++;}catch{}}if(matches!==1) fail('INVALID_INPUT',`Invalid typed input: ${at}`);return;}
  if(schema.type==='array'){if(!Array.isArray(value)||value.length<schema.minItems||value.length>schema.maxItems)fail('INVALID_INPUT',`Invalid array: ${at}`);value.forEach((item,i)=>validate(schema.items,item,`${at}[${i}]`));return;}
  if(schema.type==='boolean'&&typeof value!=='boolean') fail('INVALID_INPUT',`Invalid boolean: ${at}`);
  if(schema.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)||value<schema.minimum||value>schema.maximum))fail('INVALID_INPUT',`Invalid number: ${at}`);
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT', `${at} must be an object.`);
    for (const key of Object.keys(value)) {
      if (Object.keys(value).length>(schema.maxProperties||100)) fail('INVALID_INPUT','Too many properties');
      const child=schema.properties[key]||schema.additionalProperties;
      if (!child || child===true) fail('INVALID_INPUT', `Unknown field: ${at}.${key}`);
      validate(child, value[key], `${at}.${key}`);
    }
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) fail('INVALID_INPUT', `Missing field: ${at}.${key}`);
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > (schema.maxLength || 10000) || (schema.pattern && !new RegExp(schema.pattern).test(value))) fail('INVALID_INPUT', `Invalid string: ${at}`);
  } else if (schema.type === 'integer' && (!Number.isSafeInteger(value) || value < schema.minimum || value > schema.maximum)) fail('INVALID_INPUT', `Invalid integer: ${at}`);
  if (schema.enum && !schema.enum.includes(value)) fail('INVALID_INPUT', `Unsupported value: ${at}`);
}
