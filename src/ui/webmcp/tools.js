import { BudgetMap, createResourceBudget } from '../../core/resourceBudget.js';
import { createWorkflowTools } from './workflowTools.js';
import { createHarnessTools } from './harnessTools.js';
import { createNonlinearTools } from './nonlinearTools.js';
import { createPracticalTools } from './practicalTools.js';
import { command } from './schemas.js';
import { finiteJson, DESIGN_INPUT_TYPES, DESIGN_INPUT_UNITS } from '../../modeling/designInputCommands.js';
import { stableHash } from '../../core/stableHash.js';
import { SOLVER_UNIT_POLICY } from '../../core/units.js';
import { resultSliceUnits } from './resultUnits.js';
import { DESIGN_MODULE_IDS } from '../../metadata/designModuleCapabilities.js';
import { PRACTICAL_DESIGN_TYPES, DESIGN_RECORD_CHANNELS } from '../../modeling/practicalInputContract.js';

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
  const budget=bridge.getResourceBudget?.()||createResourceBudget();
  const requests = new BudgetMap(budget,'legacy-webmcp-requests');
  const jobs = new BudgetMap(budget,'legacy-webmcp-jobs');
  let active = true;
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
    const binding = jobs.get(jobId)||workflow.findJob(jobId);
    if (!binding) fail('JOB_NOT_FOUND', 'Only analysis jobs started in this WebMCP page session are available.');
    if(binding.analysisRunId){
      const row=bridge.getWorkflowAnalysisMetadata(binding.analysisRunId);
      if(!row.ok)fail('RESULT_REQUIRED','The result is no longer in the current catalog.');
      return {...binding,jobId,stale:row.stale,status:{id:jobId,caseId:row.caseId,kind:row.kind,status:row.executionStatus,resultAvailable:row.executionStatus==='completed',qualification:row.qualification,designBlocked:true}};
    }
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
        if (!active) fail('SESSION_DISPOSED', 'This WebMCP page session has been disposed.');
        try{finiteJson(args);}catch{fail('INVALID_INPUT','Input must be finite safe JSON.');}
        if(JSON.stringify(args).length>64000) fail('REQUEST_TOO_LARGE','Maximum input is 64000 characters.');
        validate(inputSchema, args);
        const before=bridge.getWorkflowInputIdentity?.().inputHash;
        const value = await run(args);
        if (!active) fail('SESSION_DISPOSED', 'This WebMCP page session has been disposed.');
        const text = JSON.stringify(value);
        if (text.length > 48000) fail('RESULT_TOO_LARGE', 'Request a narrower path or smaller limit.');
        onActivity({tool:name,ok:value?.ok!==false,designRunId:value?.designRunId,changed:before!==bridge.getWorkflowInputIdentity?.().inputHash});
        return value;
      },
    };
  }
  const workflow=createWorkflowTools({agent,bridge,tool,object,context,setView});
  const nonlinear=createNonlinearTools({agent,budget,tool,context});
  const definitions = [
    ...createHarnessTools({tool,object,agent,bridge}),
    ...createPracticalTools({bridge,tool,object}),
    tool('get_design_input_schema','Read the shared typed input contract and field units for UI and WebMCP.',object({type:{type:'string',enum:DESIGN_INPUT_TYPES}},['type']),true,args=>{
      if(PRACTICAL_DESIGN_TYPES.includes(args.type))return bridge.getDesignInputSchema(args);
      const variants=command.oneOf.filter(schema=>schema.properties.type.enum.includes(args.type));
      return {ok:true,version:WEBMCP_VERSION,units:DESIGN_INPUT_UNITS,schema:structuredClone(variants.length===1?variants[0]:{oneOf:variants})};
    }),
    tool('get_design_records','Read paginated material, section, reinforcement, connection, ground or foundation records. Does not solve or modify input.',object({channel:{type:'string',enum:DESIGN_RECORD_CHANNELS},id,version:{type:'integer',minimum:1,maximum:1000000},offset:{type:'integer',minimum:0,maximum:1000000},limit:{type:'integer',minimum:1,maximum:20}},['channel']),true,args=>({...bridge.getDesignRecords(args),inputIdentity:bridge.getWorkflowInputIdentity()})),
    tool('get_design_modules', 'Read module scope, required checks, available controls and unresolved rule qualifications. Does not solve or modify inputs.', object({moduleId:{type:'string',enum:DESIGN_MODULE_IDS}}), true, args=>bridge.getDesignModules(args)),
    tool('get_design_rule_catalog', 'Read RC system profiles, captured KDS clause headings, missing sources and Phase25 gap owners. Does not calculate or grant qualification.', object(), true, ()=>bridge.getDesignRuleCatalog()),
    tool('get_design_dependencies','Read separate analysis, design and detail identities without solving.',object(),true,()=>bridge.getDesignDependencies()),
    ...['undo','redo'].map(action=>tool(`${action}_design_input`,`${action} the latest typed input transaction if the revision is current. Supply expectedRequestId to reject undo/redo of a different transaction, including later user edits.`,object({inputHash:hash,expectedRequestId:id},['inputHash']),false,args=>{
      if(args.inputHash!==bridge.getWorkflowInputIdentity().inputHash)fail('STALE_INPUT','Input changed.');
      return bridge[action==='undo'?'undoDesignInputChanges':'redoDesignInputChanges']({expectedRequestId:args.expectedRequestId});
    })),
    tool('reuse_design_analysis','Explicitly derive a current analysis record when captured gross-elastic dependencies match; leaves historical records unchanged.',object({analysisRunId:id,inputHash:hash},['analysisRunId','inputHash']),false,args=>bridge.reuseDesignAnalysis(args)),
    tool('get_project_context', 'Read model units, input hash, case IDs and supported analysis capabilities. Does not run analysis.', object(), true, () => {
      const value = model();
      return {
        version: WEBMCP_VERSION, ...context(value),
        startHere: 'get_agent_start_context',
        inputIdentity: agent.getWorkflowInputIdentity?.({ model: value }) || null,
        counts: Object.fromEntries(['nodes', 'members', 'loads'].map((key) => [key, value[key]?.length || 0])),
        cases: (value.analysisCases || []).slice(0, 100).map(({ id, name, kind, engineId }) => ({ id, name, kind, engineId, exposed: KINDS.includes(kind)||nonlinear.isCase(id) })),
        casesTruncated: (value.analysisCases?.length || 0) > 100,
        capabilities: [...KINDS.map((kind) => {
          const result = agent.getAnalysisCapabilities({ kind });
          return { kind, targets: result.targets };
        }), ...['p8-production-mdof-pushover', 'p8-production-mdof-nlth'].map(engineId => ({engineId, qualification:'candidate', designBlocked:true, targets:['cpu'], settings:'case-specific preflight required'}))],
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
      if ([...jobs].some(([jobId,binding]) => !binding.analysisRunId&&['queued', 'running', 'pending'].includes(agent.getAnalysisRunStatus({ jobId }).status))) fail('ANALYSIS_BUSY', 'Wait for or cancel the current job.');
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
      const slice = info.analysisRunId?bridge.getWorkflowAnalysisSlice(info.analysisRunId,{path,limit}).slice:agent.getAnalysisResultSlice({ jobId, query: { path, limit } });
      if (slice.data === undefined) fail('RESULT_PATH_NOT_FOUND', 'Result path is unavailable for this case. Start with summary.');
      return { ...info, ...resultSliceUnits(info.status.kind,path,info.units), slice, externalQualification: 'NOT_CLAIMED' };
    }),
    tool('cancel_analysis', 'Request cancellation of one analysis job started by this page session. Completed results are retained.', object({ jobId: id }, ['jobId']), false, ({ jobId }) => {
      if(nonlinear.owns(jobId))return nonlinear.cancel(jobId);
      if(jobInfo(jobId).analysisRunId)fail('READ_ONLY_RESULT','Restored result handles cannot control jobs.');
      agent.cancelAnalysisRun({ jobId });
      return jobInfo(jobId);
    }),
    tool('open_analysis_result','Issue a fresh read-only session ID for a completed current-catalog result, including restored records. Does not run analysis.',object({analysisRunId:id},['analysisRunId']),true,({analysisRunId})=>{
      const row=bridge.getWorkflowAnalysisMetadata(analysisRunId);
      if(!row.ok||row.executionStatus!=='completed'||!KINDS.includes(row.kind))fail('RESULT_REQUIRED','A completed elastic catalog record is required.');
      const jobId=`result-${globalThis.crypto?.randomUUID?.()||`${Date.now()}-${requests.size}-${jobs.size}`}`;
      jobs.set(jobId,{...context(),analysisRunId,caseId:row.caseId});return jobInfo(jobId);
    }),
    tool('get_runtime_resources','Read managed estimates, termination-unconfirmed Worker reservations and allocation blocking/recovery state, plus optional browser aggregate memory. Unsupported measurements return unavailable, never zero. Does not run analysis.',object({includeAggregate:{type:'boolean'}}),true,args=>bridge.getRuntimeResources(args)),
    ...workflow.tools,
    ...nonlinear.tools,
  ];
  definitions.dispose=()=>{
    if (!active) return {errors:[]};
    active=false;
    const errors=[];
    const attempt=run=>{try{errors.push(...(run()?.errors||[]));}catch(error){errors.push({code:error?.code||'CANCEL_FAILED',message:String(error?.message||error)});}};
    attempt(()=>workflow.dispose());
    attempt(()=>nonlinear.dispose());
    for(const [jobId,binding] of jobs) if(!binding.analysisRunId)attempt(()=>agent.cancelAnalysisRun({jobId}));
    jobs.clear();requests.clear();
    return {errors};
  };
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
