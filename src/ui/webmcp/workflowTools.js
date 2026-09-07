import { stableHash } from '../../core/stableHash.js';
import { DESIGN_INPUT_UNITS } from '../../modeling/designInputCommands.js';
import { id, hash, array, choice, command, caseCommand, pagination } from './schemas.js';

export function createWorkflowTools({agent,bridge,tool,object,context,setView}) {
  const handles=new Map(),requests=new Map(),workflows=new Map();let sequence=0,active=true;
  const sessionId=globalThis.crypto?.randomUUID?.()||stableHash({time:Date.now(),random:Math.random()});
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const good=value=>{if(!value?.ok)fail(value?.code||'SERVICE_FAILED');return value;};
  const identity=()=>bridge.getWorkflowInputIdentity();
  const current=inputHash=>{if(inputHash!==identity().inputHash)fail('STALE_INPUT');};
  const save=(kind,value)=>{if(handles.size>=128)fail('SESSION_HANDLE_LIMIT');const handle=`${kind}-${sessionId}-${++sequence}`;handles.set(handle,{kind,value});return handle;};
  const get=(handle,kind)=>{const row=handles.get(handle);if(!active||row?.kind!==kind)fail('HANDLE_NOT_FOUND');return row.value;};
  const page=(rows,{offset=0,limit=20})=>({rows:rows.slice(offset,offset+limit),total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null});
  function once(name,args,run) {
    const key=args.requestId,fingerprint=stableHash({name,args}),prior=requests.get(key);
    if(prior){if(prior.fingerprint!==fingerprint)fail('REQUEST_ID_CONFLICT');return prior.result;}
    if(requests.size>=128)fail('SESSION_REQUEST_LIMIT');
    const entry={fingerprint};requests.set(key,entry);
    try {entry.result=run();return entry.result;}catch(e){requests.delete(key);throw e;}
  }
  function sourceRows() {
    return (bridge.getCurrentModel().analysisCases||[]).flatMap(c=>{
      const published=bridge.getAnalysisCaseResult(c.id);if(!published?.runRecordId)return [];
      const r=bridge.getWorkflowAnalysisResult(published.runRecordId);if(!r.ok)return [];
      return [{caseId:c.id,kind:c.kind,analysisRunId:r.analysisRunId,comboId:c.settings?.comboId||null,method:c.settings?.pDeltaMethod||'off',executionStatus:r.executionStatus,stale:r.stale,qualification:r.qualification}];
    });
  }
  function reviewSummary(r){return {ok:true,designRunId:r.designRunId,inputIdentity:r.identity,stale:r.stale,summary:r.result.summary,sourceAnalysisRunIds:r.sourceAnalysisRunIds,designTransferAllowed:false};}
  function preview(args,commands) {
    current(args.inputHash);
    return once('preview',args,()=>{
      const value=good(agent.previewDesignInputChanges({requestId:args.requestId,units:DESIGN_INPUT_UNITS,commands}));
      return {ok:true,handle:save('changes',value),sourceIdentity:value.sourceIdentity,changed:value.changed,changeCount:value.changes.length,warnings:value.warnings.slice(0,20),warningCount:value.warnings.length,changes:page(value.changes,{})};
    });
  }
  const apply=args=>once('apply',args,()=>{const value=good(agent.applyDesignInputChanges(get(args.handle,'changes')));return {ok:true,changed:value.changed,transactionId:value.transactionId,inputIdentity:value.inputIdentity,changeCount:value.changes.length,warningCount:value.warnings.length};});
  const tools=[
    tool('get_workflow_context','Read current input identity, supported workflow and completed analysis records; never runs a solver.',object(pagination),true,args=>({ok:true,version:'p19-m4-webmcp-v2',...context(),inputIdentity:identity(),sources:page(sourceRows(),args),workflows:[...workflows].map(([handle,w])=>({handle,status:w.status})),designRuns:[...handles.values()].filter(h=>h.kind==='review').map(h=>{const r=agent.getDesignReview(h.value);return {designRunId:h.value,stale:r.stale};}),limits:{inputCharacters:64000,responseCharacters:48000,handles:128,requests:128,pageSize:20},scope:'Elastic preliminary review: static/Direct demands only. Candidate production Pushover/NLTH through common analysis tools; no final design transfer.'})),
    tool('get_design_context','Read a paginated typed model channel and missing input categories without solving.',object({channel:choice('nodes','members','loadCases','loadCombinations','analysisCases','materials','sections','massSources'),...pagination},['channel']),true,args=>{
      const model=bridge.getCurrentModel(),raw=model[args.channel]||[],rows=Array.isArray(raw)?raw:Object.entries(raw).map(([id,value])=>({id,...value}));
      const fields={nodes:['id','x','y','z','support','mass'],members:['id','n1','n2','type','matId','secId'],loadCases:['id','name','type'],loadCombinations:['id','name','type','factors'],analysisCases:['id','name','kind','settings','status'],materials:['id','name','kind'],sections:['id','name','type'],massSources:['id','entries']}[args.channel];
      return {ok:true,inputIdentity:identity(),units:model.units,channel:args.channel,...page(rows.map(row=>Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]))),args),missing:['nodes','members','loadCases','loadCombinations','analysisCases'].filter(k=>!model[k]?.length)};
    }),
    tool('preview_design_changes','Preview bounded typed design changes using M2. Does not apply changes or solve.',object({inputHash:hash,requestId:id,commands:array(command,20)},['inputHash','requestId','commands']),true,args=>preview(args,args.commands)),
    tool('get_design_changes','Read all preview changes by page before applying a stored handle.',object({handle:id,...pagination},['handle']),true,args=>({ok:true,...page(get(args.handle,'changes').changes,args)})),
    tool('apply_design_changes','Apply a previously previewed change handle atomically. Invalidates old results; does not run analysis.',object({handle:id,requestId:id},['handle','requestId']),false,apply),
    tool('preview_analysis_case','Preview creation or update of one typed elastic case.',object({inputHash:hash,requestId:id,command:caseCommand},['inputHash','requestId','command']),true,args=>preview(args,[args.command])),
    tool('apply_analysis_case','Apply a previously previewed case-only handle.',object({handle:id,requestId:id},['handle','requestId']),false,args=>{
      const p=get(args.handle,'changes');if(p.changes.some(c=>c.collection!=='analysisCases'&&!String(c.path||'').startsWith('analysisCases')))fail('CASE_PREVIEW_REQUIRED');return apply(args);
    }),
    tool('plan_elastic_workflow','Plan existing elastic cases in dependency order; no analysis.',object({inputHash:hash,caseIds:array(id,20)},['inputHash','caseIds']),true,args=>{current(args.inputHash);const plan=good(agent.planElasticWorkflow({caseIds:args.caseIds,computeTarget:'cpu'}));return {ok:true,handle:save('elastic',plan),inputIdentity:plan.inputIdentity,steps:plan.steps};}),
    tool('start_elastic_workflow','Start a stored elastic workflow plan; return a handle immediately. Poll workflow status.',object({handle:id,requestId:id},['handle','requestId']),false,args=>once('elastic',args,()=>{
      const plan=get(args.handle,'elastic');current(plan.inputIdentity.inputHash);
      if([...workflows.values()].some(x=>x.status==='running'))fail('WORKFLOW_BUSY');
      const state={status:'running',requestId:`webmcp-${args.requestId}`,result:null};const handle=save('workflow',state);workflows.set(handle,state);
      agent.runElasticWorkflow({plan,requestId:state.requestId}).then(result=>{state.result=result;state.status=result.ok?'completed':'failed';},e=>{state.result={ok:false,code:e.code||'WORKFLOW_FAILED'};state.status='failed';});
      return {ok:true,handle,status:state.status};
    })),
    tool('get_elastic_workflow','Read an existing workflow and source run IDs; never runs analysis.',object({handle:id},['handle']),true,args=>{const w=get(args.handle,'workflow');return {ok:true,status:w.status,result:w.result};}),
    tool('cancel_elastic_workflow','Cancel a session workflow and skip remaining cases.',object({handle:id},['handle']),false,args=>bridge.cancelElasticWorkflow(get(args.handle,'workflow').requestId)),
    tool('plan_design_review','Plan preliminary design from exact completed static/Direct combination records.',object({inputHash:hash,sources:array(object({analysisRunId:id,comboId:id},['analysisRunId','comboId']),20)},['inputHash','sources']),true,args=>{current(args.inputHash);const plan=good(agent.planDesignReview({sources:args.sources}));return {ok:true,handle:save('design',plan),inputIdentity:plan.inputIdentity,sources:plan.sources,designTransferAllowed:false};}),
    tool('start_design_review','Calculate and record preliminary design from a stored plan; does not rerun analysis.',object({handle:id,requestId:id},['handle','requestId']),false,args=>once('design',args,()=>{if(handles.size>=128)fail('SESSION_HANDLE_LIMIT');const r=good(agent.startDesignReview({plan:get(args.handle,'design'),requestId:`webmcp-${args.requestId}`}));save('review',r.designRunId);return reviewSummary(r);})),
    tool('get_design_result','Read summary or paginated checks/sources/rules from a stored design record.',object({designRunId:id,channel:choice('summary','checks','sources','rules'),...pagination},['designRunId','channel']),true,args=>{const r=good(agent.getDesignReview(args.designRunId));return {...reviewSummary(r),data:args.channel==='summary'?r.result.summary:page(r.result[args.channel==='rules'?'ruleSources':args.channel],args)};}),
    tool('plan_report_export','Plan report creation from a current design record. Does not create a report or export files.',object({designRunId:id},['designRunId']),true,args=>{const r=good(agent.getDesignReview(args.designRunId));if(r.stale)fail('STALE_INPUT');return {ok:true,handle:save('report-plan',{id:r.designRunId,inputHash:identity().inputHash}),formats:['html','json','csv'],automaticPdf:'requires-host-transport-figures-qualification'};}),
    tool('start_report_export','Create immutable HTML/JSON/CSV report artifacts in session; no external publication or automatic PDF.',object({handle:id,requestId:id},['handle','requestId']),false,args=>once('report',args,()=>{const p=get(args.handle,'report-plan');current(p.inputHash);if(handles.size>=128)fail('SESSION_HANDLE_LIMIT');const r=good(agent.createDesignReviewReport(p.id));return {ok:true,handle:save('artifact',p.id),reportSnapshotHash:r.reportSnapshotHash,summary:r.summary,capability:agent.getDesignReviewExportCapability(p.id)};})),
    tool('get_report_artifact','Read a bounded text chunk of an existing HTML/JSON/CSV artifact; no file paths accepted.',object({handle:id,format:choice('html','json','csv'),offset:{type:'integer',minimum:0,maximum:100000000}},['handle','format']),true,args=>{const r=good(agent.getDesignReviewReport(get(args.handle,'artifact')));const text=args.format==='html'?r.reports['ko-KR'].html:r[args.format],offset=args.offset||0;return {ok:true,stale:r.stale,reportSnapshotHash:r.reportSnapshotHash,format:args.format,totalCharacters:text.length,offset,nextOffset:offset+12000<text.length?offset+12000:null,content:text.slice(offset,offset+12000)};}),
    tool('set_workspace_view','Switch the shared workspace view only; does not calculate or edit the model.',object({view:choice('modeling','elastic','nonlinear','design-input','design-review')},['view']),false,args=>setView(args.view)),
  ];
  return {tools,dispose(){active=false;for(const w of workflows.values())if(w.status==='running')bridge.cancelElasticWorkflow(w.requestId);handles.clear();requests.clear();}};
}
