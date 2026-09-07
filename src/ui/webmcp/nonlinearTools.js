import { stableHash } from '../../core/stableHash.js';
import { createProductionNonlinearCase } from '../../nonlinear/product/preflight.js';
import { NONLINEAR_ENGINE_IDS } from '../../nonlinear/capabilities.js';
import { id, hash, object, choice, array } from './schemas.js';

const engines = new Set([NONLINEAR_ENGINE_IDS.productionPushover, NONLINEAR_ENGINE_IDS.productionNlth]);
const positive = {type:'number',minimum:1e-9,maximum:1e6};
const integer = {type:'integer',minimum:1,maximum:20000};
const caseSchema = object({
  id,name:id,mode:choice('pushover','nlth'),gravityCombinationId:id,controlNodeId:id,
  direction:choice('+x','-x','+y','-y'),massSourceId:id,
  settings:object({targetDisplacement:positive,steps:integer,fiberPmm:{type:'boolean'},
    control:choice('displacement','arcLength'),pattern:choice('uniform','triangular'),
    groundMotionRecords:array(object({id,values:array({type:'number',minimum:-1e5,maximum:1e5},20000),dt:positive,
      unit:choice('m/s2','g'),direction:choice('x','y','z'),baseline:choice('none')},['id','values','dt','unit','direction']),3),
    newmark:object({outputDt:positive,initialDt:positive,minDt:positive})})
},['id','mode','gravityCombinationId','settings']);

// Uses the existing UI product service. Private plans are session-scoped and
// never accept caller-provided checkpoints, executable options or file paths.
export function createNonlinearTools({agent,tool,context}) {
  const plans=new Map(),requests=new Map(),jobs=new Set();let sequence=0,active=true;
  const session=globalThis.crypto?.randomUUID?.() || stableHash({time:Date.now(),random:Math.random()});
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const current=expected=>{if(!active)fail('SESSION_DISPOSED');if(context().modelHash!==expected)fail('STALE_MODEL');};
  const own=jobId=>{if(!active||!jobs.has(jobId))fail('JOB_NOT_FOUND');return jobId;};
  const save=value=>{if(plans.size>=128)fail('SESSION_HANDLE_LIMIT');const handle=`nl-${session}-${++sequence}`;plans.set(handle,value);return handle;};
  const get=handle=>{const p=plans.get(handle);if(!p||!active)fail('HANDLE_NOT_FOUND');current(p.modelHash);return p;};
  function once(name,args,run) {
    const fingerprint=stableHash({name,args}),old=requests.get(args.requestId);
    if(old){if(old.fingerprint!==fingerprint)fail('REQUEST_ID_CONFLICT');return old.value;}
    if(requests.size>=128)fail('SESSION_REQUEST_LIMIT');
    const value=run();requests.set(args.requestId,{fingerprint,value});return value;
  }
  function input(args) {
    current(args.modelHash);
    const c=(agent.getModel().analysisCases||[]).find(c=>c.id===args.caseId);
    if(!c||!engines.has(c.engineId))fail('NONLINEAR_PRODUCTION_CASE_REQUIRED');
    if(args.computeTarget && !['auto','cpu'].includes(args.computeTarget))fail('NONLINEAR_TARGET_UNSUPPORTED');
    return {caseId:c.id};
  }
  function status(jobId) {
    own(jobId);const r=agent.getNonlinearRunStatus({jobId});
    return {...context(),jobId,stale:r.stale,status:Object.fromEntries([
      'id','caseId','kind','status','stage','progress','progressMessage','createdAt','startedAt','completedAt',
      'resultAvailable','qualification','designBlocked','settingsHash','runtime','error','checkpoint','resumePolicy'
    ].map(k=>[k,r[k]]))};
  }
  const preflight=args=>agent.validateNonlinearCase(input(args));
  const compact=p=>({ok:p.ok,engineId:p.analysisCase?.engineId,qualification:p.qualification,designBlocked:true,
    blocking:p.blocking?.slice(0,20),warnings:p.warnings?.slice(0,20),preflightHash:p.preflightHash,settingsHash:p.settingsHash});
  const tools=[
    tool('preview_nonlinear_case','Preview a typed candidate production case. Does not change the model.',object({modelHash:hash,case:caseSchema},['modelHash','case']),true,args=>{
      current(args.modelHash);const analysisCase=createProductionNonlinearCase(agent.getModel(),args.case);
      return {handle:save({modelHash:args.modelHash,kind:'case',analysisCase}),analysisCase,qualification:'candidate',designTransferAllowed:false};
    }),
    tool('apply_nonlinear_case','Apply a current stored nonlinear case preview. Does not run analysis.',object({handle:id,requestId:id},['handle','requestId']),false,args=>once('case',args,()=>{
      const p=get(args.handle);if(p.kind!=='case')fail('CASE_PREVIEW_REQUIRED');
      const analysisCase=agent.createProductionNonlinearCase(p.analysisCase);return {ok:true,caseId:analysisCase.id,engineId:analysisCase.engineId,...context()};
    })),
    tool('preview_nonlinear_assignments','Preview existing project-derived hinge assumptions; no solver execution.',object({modelHash:hash,caseId:id},['modelHash','caseId']),true,args=>{
      const preview=agent.previewNonlinearAssignments(input(args));
      return {handle:save({kind:'assignments',modelHash:args.modelHash,preview}),assignmentCount:preview.assignments?.length||0,
        propertyCount:preview.properties?.length||0,qualification:'assumed',source:'Project material/section assumptions; deformation limits require independent review.'};
    }),
    tool('get_nonlinear_preview','Read a bounded page of the stored assignment preview before applying.',object({handle:id,
      channel:choice('assignments','properties','warnings'),offset:{type:'integer',minimum:0,maximum:100000}},['handle','channel']),true,args=>{
      const p=get(args.handle);if(p.kind!=='assignments')fail('ASSIGNMENT_PREVIEW_REQUIRED');
      const rows=p.preview[args.channel]||[],offset=args.offset||0;return {rows:rows.slice(offset,offset+1),total:rows.length,nextOffset:offset+1<rows.length?offset+1:null};
    }),
    tool('apply_nonlinear_assignments','Apply the stored hinge assignment preview to the unchanged model.',object({handle:id,requestId:id},['handle','requestId']),false,args=>once('assign',args,()=>{
      const p=get(args.handle);if(p.kind!=='assignments')fail('ASSIGNMENT_PREVIEW_REQUIRED');
      const result=agent.applyNonlinearAssignments({changeSet:p.preview});return {ok:result.ok!==false,...context()};
    })),
    tool('get_nonlinear_history','Read bounded typed result history from a session job, without computing.',object({jobId:id,
      channel:choice('overview','capacity','history','convergence','provenance','story','node','member','hinge'),
      page:{type:'integer',minimum:1,maximum:100000},entityId:id},['jobId','channel']),true,args=>{
      own(args.jobId);return agent.getNonlinearResultSlice({jobId:args.jobId,query:{slice:args.channel,page:args.page||1,pageSize:20,maxPoints:40,
        nodeId:args.entityId,memberId:args.entityId,hingeId:args.entityId}});
    }),
    tool('explain_analysis_failure','Read nonlinear failure diagnostics; never retries automatically.',object({jobId:id},['jobId']),true,args=>agent.explainNonlinearFailure({jobId:own(args.jobId)})),
    tool('pause_analysis','Request a nonlinear checkpoint boundary pause.',object({jobId:id},['jobId']),false,args=>{agent.pauseNonlinearRun({jobId:own(args.jobId)});return status(args.jobId);}),
    tool('resume_analysis','Resume a paused job with a compatible private checkpoint, or explicitly retry from origin.',object({jobId:id,modelHash:hash,requestId:id,mode:choice('checkpoint','retry')},['jobId','modelHash','requestId','mode']),false,args=>once('resume',args,()=>{
      current(args.modelHash);own(args.jobId);if(jobs.size>=128)fail('SESSION_JOB_LIMIT');
      const old=agent.getNonlinearRunStatus({jobId:args.jobId});
      if(args.mode==='checkpoint'&&(!old.checkpoint||old.mode!=='nlth'||old.stale))fail('CHECKPOINT_RESUME_UNAVAILABLE');
      const job=args.mode==='checkpoint'?agent.resumeNonlinearRun({jobId:args.jobId}):agent.retryNonlinearRun({jobId:args.jobId});
      jobs.add(job.id);return status(job.id);
    })),
  ];
  return {tools,owns:jobId=>jobs.has(jobId),isCase:caseId=>engines.has((agent.getModel().analysisCases||[]).find(c=>c.id===caseId)?.engineId),
    validate:args=>({...context(),validation:compact(preflight(args))}),
    plan:args=>({...context(),plan:compact(preflight(args))}),
    start:args=>once('start',args,()=>{const p=preflight(args);if(!p.ok)return {...context(),status:'blocked',validation:compact(p)};
      if(jobs.size>=128)fail('SESSION_JOB_LIMIT');const job=agent.startNonlinearRun(input(args));jobs.add(job.id);return status(job.id);}),
    status,cancel:jobId=>{agent.cancelNonlinearRun({jobId:own(jobId)});return status(jobId);},
    slice:args=>{own(args.jobId);if(args.path&&!['summary','payload'].includes(args.path))fail('USE_TYPED_NONLINEAR_HISTORY');
      return {...status(args.jobId),slice:agent.getNonlinearResultSlice({jobId:args.jobId,query:{slice:'overview'}})};},
    dispose:()=>{for(const jobId of jobs)agent.cancelNonlinearRun({jobId});active=false;plans.clear();}
  };
}
