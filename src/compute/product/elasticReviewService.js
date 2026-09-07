import { stableHash } from '../../core/stableHash.js';
import { sameWorkflowInput } from '../../core/workflowIdentity.js';
import { runDesignChecks } from '../../design/steel.js';
import { buildDesignDemandPackage } from '../../design/designDemandPackage.js';
import { buildServiceabilityDriftReport } from '../../design/serviceability.js';
import { buildConnectionFoundationReport } from '../../design/connectionFoundation.js';
import { createDesignReviewReport } from '../../report/phase19/designReviewReport.js';
import { finiteJson, object } from '../../modeling/designInputCommands.js';

export const ELASTIC_REVIEW_VERSION = 'p19-m3-elastic-review-v1';
const clone = value => structuredClone(value);
const problem = (code, details = null) => ({ ok: false, code, details, designTransferAllowed: false });
const reject = (code, details) => { throw Object.assign(new Error(code), { code, details }); };
const guard = fn => { try { return fn(); } catch (e) { return problem(e.code || e.message, e.details); } };
const kinds = ['static','modal','responseSpectrum','buckling','linearTha'];

export function createElasticReviewService({ bridge, store, reportExportWorkflow, getPdfContext = () => ({}) }) {
  const reviewPlans = new Map(), workflowPlans = new Map(), requests = new Map(), reports = new Map();
  let busy = false;
  const identity = () => bridge.getWorkflowInputIdentity();
  function currentSources(sources) {
    const currentIdentities = {}, rows = [], combinations = new Set();
    for (const source of sources) {
      object(source, ['analysisRunId','comboId']);
      if (typeof source.analysisRunId !== 'string' || typeof source.comboId !== 'string') reject('SOURCE_IDS_REQUIRED');
      if (combinations.has(source.comboId)) reject('DUPLICATE_COMBINATION');
      combinations.add(source.comboId);
      const row = bridge.getWorkflowAnalysisResult(source.analysisRunId);
      if (!row.ok) reject(row.code);
      if (row.stale) reject('STALE_INPUT');
      if (row.kind !== 'static') reject('DESIGN_DEMAND_MAPPING_UNSUPPORTED');
      if (row.executionStatus !== 'completed') reject('ANALYSIS_NOT_COMPLETED');
      const payload = row.result.payload;
      const method = row.legacyRecord.provenance?.analysisCase?.settings?.pDeltaMethod || 'off';
      if (!['off','direct','legacy'].includes(method)) reject('PDELTA_METHOD_UNSUPPORTED');
      if (method === 'legacy') reject('PDELTA_COMPARISON_ONLY');
      // The selected result must belong to this exact combination. Never read a
      // convenient envelope or fall back to a different analysis method.
      const set = payload?.byCombo?.[source.comboId];
      if (!set?.ok || !set.anyOk || !set.memberResults || !(set.disp || set.nodeDisplacements)) reject('COMBINATION_RESULT_REQUIRED');
      if (method === 'direct' && payload.pDeltaMethod !== 'direct') reject('PDELTA_RESULT_MAPPING_REQUIRED');
      currentIdentities[source.analysisRunId] = row.identity;
      rows.push({ source, row, set, method });
    }
    return { currentIdentities, rows };
  }
  function planReview(input = {}) { return guard(() => {
    finiteJson(input);object(input, ['sources']);
    if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > 100) reject('RESULT_REQUIRED');
    const { rows, currentIdentities } = currentSources(input.sources);
    const demandContract = { kind: rows.some(x=>x.method!=='off') ? 'elastic-pdelta':'elastic-static',
      units: clone(bridge.getCurrentModel().units), axes:'member-local', signConvention:'solver-native', comboIds:input.sources.map(x=>x.comboId) };
    const plan = store.planDesign({ sources:input.sources, currentIdentities, demandContract });
    if (!plan.ok) return plan;
    const value = { ...plan, version:ELASTIC_REVIEW_VERSION, inputIdentity:identity() };
    if (reviewPlans.size >= 64) reviewPlans.delete(reviewPlans.keys().next().value);
    reviewPlans.set(plan.planHash, clone(value));
    return clone(value);
  }); }
  function startReview(input = {}) { return guard(() => {
    finiteJson(input);object(input, ['plan','requestId']);
    const { plan, requestId } = input; requestKey(requestId);
    const issued = reviewPlans.get(plan?.planHash);
    if (!issued || stableHash(issued) !== stableHash(plan)) reject('DESIGN_PLAN_INVALID');
    if (!sameWorkflowInput(plan.inputIdentity, identity())) reject('STALE_INPUT');
    const key = `review:${requestId}`, hash = stableHash(plan);
    if (requests.has(key)) { const prior=requests.get(key);if(prior.hash!==hash) reject('REQUEST_ID_CONFLICT');return getReview(prior.id); }
    if (requests.size >= 128) reject('SESSION_REQUEST_LIMIT');
    const model = clone(bridge.getCurrentModel()), {rows,currentIdentities} = currentSources(plan.sources);
    const result = calculateReview(model, rows);
    if (!sameWorkflowInput(plan.inputIdentity, identity())) reject('STALE_INPUT');
    const { version, inputIdentity, ...storePlan } = plan;
    const recorded = store.recordDesign({identity:inputIdentity,plan:storePlan,currentIdentities,result});
    requests.set(key, {hash,id:recorded.designRunId});
    return recorded;
  }); }
  function getReview(id) { return guard(() => store.getDesign(id, identity())); }
  function createReport(id) { return guard(() => {
    const record = getReview(id);
    if (!record.ok) return record;
    if (record.stale) return problem('STALE_INPUT');
    if (!reports.has(id)) reports.set(id, createDesignReviewReport(clone(bridge.getCurrentModel()), record));
    return getReport(id);
  }); }
  function getReport(id) { return guard(() => {
    const value = reports.get(id);if (!value) return problem('RESULT_REQUIRED');
    const record = getReview(id);if (!record.ok) return record;
    return {ok:true,...clone(value),stale:record.stale};
  }); }
  function exportContext(id) {
    const report = getReport(id);if(!report.ok) reject(report.code);if(report.stale) reject('STALE_INPUT');
    return { ...getPdfContext(id), snapshot:report.snapshot, reports:report.reports,
      currentReportSnapshotHash:report.reportSnapshotHash, projectId:report.snapshot.project.id, source:'p19-m3' };
  }
  function getExportCapability(id) { return guard(() => {
    const input = exportContext(id), pdf = reportExportWorkflow.preflight(input);
    return {ok:true,formats:['html','json','csv'],manualPrint:true,automaticPdf:pdf.ready,pdf};
  }); }
  async function exportPdf(id) {
    try {
      const input = exportContext(id), ready = reportExportWorkflow.preflight(input);
      if(!ready.ready) return problem('PDF_EXPORT_BLOCKED',ready.issues);
      const plan = await reportExportWorkflow.plan(input);
      exportContext(id); // Recheck after asynchronous transport planning.
      const result = await reportExportWorkflow.run(plan.jobId);
      const current = getReview(id);
      return {ok:result.status==='completed',...result,stale:current.stale,designTransferAllowed:false};
    } catch(e) {return problem(e.code||e.message);}
  }
  function planWorkflow(input = {}) { return guard(() => {
    finiteJson(input);object(input,['caseIds','computeTarget']);
    const model=bridge.getCurrentModel(), ids=input.caseIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length) reject('CASE_IDS_REQUIRED');
    if(input.computeTarget && !['auto','cpu','gpu'].includes(input.computeTarget)) reject('COMPUTE_TARGET_INVALID');
    const cases=ids.map(id=>{const row=model.analysisCases.find(x=>x.id===id);if(!row) reject('CASE_NOT_FOUND',id);if(!kinds.includes(row.kind)) reject('ELASTIC_CASE_REQUIRED',id);return row;});
    const rank = row => row.kind==='static' ? (row.settings?.pDeltaMethod && row.settings.pDeltaMethod!=='off' ? 1:0) : kinds.indexOf(row.kind)+1;
    cases.sort((a,b)=>rank(a)-rank(b)||a.id.localeCompare(b.id));
    const steps=cases.map(row=>{
      const settings={...row.settings,...row.input};
      const combinationId=settings.gravityCombinationId||settings.preloadCombinationId||null;
      const prerequisites=combinationId?cases.filter(x=>x.kind==='static' && x.settings?.comboId===combinationId && rank(x)<rank(row)).map(x=>x.id):[];
      if(combinationId && !model.loadCombinations.some(x=>x.id===combinationId)) reject('COMBINATION_NOT_FOUND',combinationId);
      return {caseId:row.id,kind:row.kind,prerequisites,combinationId,
        internalPreprocessing:row.kind==='responseSpectrum'||(row.kind==='linearTha'&&settings.integration!=='direct')?'solver-owned modal preparation':combinationId?'solver-owned preload preparation':null,
        designDemandMapping:row.kind==='static'&&settings.comboId?'elastic-static-or-pdelta':'not-mapped'};
    });
    const core={ok:true,version:ELASTIC_REVIEW_VERSION,inputIdentity:identity(),steps,computeTarget:input.computeTarget||'cpu'};
    const value={...core,planHash:stableHash(core)};
    if(workflowPlans.size>=64) workflowPlans.delete(workflowPlans.keys().next().value);
    workflowPlans.set(value.planHash,clone(value));return value;
  }); }
  async function runWorkflow(input={}) {
    try {
      finiteJson(input);object(input,['plan','requestId']);requestKey(input.requestId);
      const plan=input.plan, issued=workflowPlans.get(plan?.planHash);
      if(!issued||stableHash(issued)!==stableHash(plan)) reject('WORKFLOW_PLAN_INVALID');
      if(!sameWorkflowInput(plan.inputIdentity,identity())) reject('STALE_INPUT');
      const key=`workflow:${input.requestId}`,hash=stableHash(plan);
      if(requests.has(key)) {const prior=requests.get(key);if(prior.hash!==hash) reject('REQUEST_ID_CONFLICT');return clone(prior.result);}
      if(busy) reject('WORKFLOW_BUSY');if(requests.size>=128) reject('SESSION_REQUEST_LIMIT');
      busy=true;
      const result={ok:true,status:'running',version:ELASTIC_REVIEW_VERSION,steps:[],sourceAnalysisRunIds:[],inputIdentity:plan.inputIdentity};
      requests.set(key,{hash,result});
      try {
        for(const step of plan.steps) {
          if(!sameWorkflowInput(plan.inputIdentity,identity())) {result.ok=false;result.code='STALE_INPUT';break;}
          if(step.prerequisites.some(id=>!result.steps.find(x=>x.caseId===id)?.ok)) {result.steps.push({...step,ok:false,code:'DEPENDENCY_FAILED'});result.ok=false;continue;}
          const previousId=bridge.getAnalysisCaseResult(step.caseId,{latestAttempt:true})?.runRecordId;
          const job=bridge.startAnalysisRun({caseId:step.caseId,computeTarget:plan.computeTarget});
          const finished=await bridge.getProductAnalysisService().wait(job.id);
          const published=bridge.getAnalysisCaseResult(step.caseId,{latestAttempt:true});
          const row=published?.runRecordId?bridge.getWorkflowAnalysisResult(published.runRecordId):null;
          const ok=finished.status==='completed'&&published?.runRecordId!==previousId&&!!row?.ok&&!row.stale&&row.executionStatus==='completed';
          result.steps.push({...step,ok,jobId:job.id,analysisRunId:row?.analysisRunId||null,code:ok?null:row?.stale?'STALE_INPUT':'ANALYSIS_NOT_COMPLETED'});
          if(ok) result.sourceAnalysisRunIds.push(row.analysisRunId);
          if(!ok) result.ok=false;
        }
      } catch(e) {result.ok=false;result.code=e.code||e.message;}
      finally {busy=false;result.status=result.ok?'completed':'failed';}
      return clone(result);
    } catch(e) {return problem(e.code||e.message,e.details);}
  }
  return Object.freeze({planReview,startReview,getReview,createReport,getReport,getExportCapability,exportPdf,planWorkflow,runWorkflow});
}
function requestKey(value) {if(typeof value!=='string'||!value.trim()||value.length>128) reject('REQUEST_ID_REQUIRED');}
function status(value) {return value==='OK'||value==='PASS'?'OK':value==='NG'||value==='FAIL'?'NG':value==='WARN'?'WARN':'NOT_CHECKED';}
function number(value) {return typeof value==='number'&&Number.isFinite(value)?value:null;}

function calculateReview(model, rows) {
  const checks=[],sources=[],demandPackages=[];
  for(const {source,set,method,row} of rows) {
    const analysis={ok:true,byCombo:{[source.comboId]:set},envelope:set};
    const demandPackage=buildDesignDemandPackage(model,analysis), design=runDesignChecks(model,analysis,{resultSet:set,demandPackage});
    const serviceCombo=model.loadCombinations.find(x=>x.id===source.comboId)?.type==='service';
    const completeDisplacements=(model.nodes||[]).every(node=>{const d=set.disp?.[node.id]||set.nodeDisplacements?.[node.id];return d&&[0,1,2].every(i=>number(d[i])!==null);});
    const serviceability=serviceCombo&&completeDisplacements?buildServiceabilityDriftReport(model,analysis):{rows:[],criteria:{driftLimitRatio:1/200}};
    const connectionFoundation=buildConnectionFoundationReport(model,analysis,{resultSet:set,demandPackage});
    const before=checks.length;
    for(const member of model.members||[]) {
      const found=design.steel.memberResults[member.id]||design.concrete.memberResults[member.id];
      if(!found) checks.push({...source,memberId:member.id,category:'member',checkId:'unsupported-or-missing',status:'NOT_CHECKED',ratio:null,expression:'No supported member design result'});
      for(const item of found?.checks||[]) {
        const interaction=item.id.includes('interaction'),applicable=item.id!=='rc-column-interaction'||found.role==='column';
        const unit=interaction||item.id.includes('slenderness')?'-':item.id.includes('deflection')?'m':item.id.includes('flexure')||item.id.includes('ltb')?'kN.m':'kN';
        checks.push({...source,memberId:member.id,category:found.type,checkId:item.id,
          status:!applicable||number(item.ratio)===null?'NOT_CHECKED':status(item.status),ratio:applicable?number(item.ratio):null,
          demand:interaction?number(item.ratio):number(item.demand),capacity:interaction?1:number(item.capacity),unit,
          expression:item.expression||'',x:number(item.x),method:found.method});
      }
      for(const message of found?.messages||[]) checks.push({...source,memberId:member.id,category:found.type,checkId:message.code||'input-review',status:message.level==='error'?'NG':'WARN',ratio:null,unit:'-',expression:message.message||'Input review required'});
    }
    for(const item of serviceability.rows) checks.push({...source,memberId:`story-${item.storyIndex||item.story||''}`,category:'serviceability',checkId:'story-drift',status:status(item.status),ratio:number(item.driftRatio/serviceability.criteria.driftLimitRatio),demand:number(item.driftRatio),capacity:serviceability.criteria.driftLimitRatio,expression:'story drift / drift limit'});
    if(!serviceability.rows.length) checks.push({...source,memberId:null,category:'serviceability',checkId:'story-drift',status:'NOT_CHECKED',ratio:null,expression:'No applicable story drift rows'});
    for(const item of connectionFoundation.connectionRows) checks.push({...source,memberId:item.memberId,category:'connection',checkId:'preliminary-force-screen',status:status(item.status),ratio:number(item.utilization),demand:number(item.equivalentDemand),capacity:connectionFoundation.assumptions.nominalConnectionCapacity,expression:'equivalent force / assumed nominal connection capacity'});
    for(const item of connectionFoundation.foundationRows) {
      checks.push({...source,memberId:item.nodeId,category:'foundation',checkId:'required-bearing-area',status:'NOT_CHECKED',ratio:null,demand:number(item.requiredArea),capacity:null,expression:'required area = vertical reaction / assumed allowable bearing; actual footing area not checked'});
      const unavailable=item.reaction.vertical<=0;
      checks.push({...source,memberId:item.nodeId,category:'foundation',checkId:'slidingRatio',status:item.uplift?'NG':unavailable?'NOT_CHECKED':status(item.status),ratio:unavailable?null:number(item.slidingRatio),expression:'horizontal reaction / (vertical reaction × assumed friction); uplift retains NG'});
    }
    for(const item of checks.slice(before)) item.unit ||= item.category==='serviceability'||item.checkId==='slidingRatio'?'-':item.checkId==='required-bearing-area'?'m2':item.category==='connection'?'kN':'-';
    const own=checks.slice(before), governing=own.filter(x=>x.ratio!==null).sort((a,b)=>b.ratio-a.ratio)[0]||null;
    sources.push({...source,caseId:row.caseId,method,maxDisplacement:number(set.dmax),maxUtilization:governing?.ratio??null,governing,qualification:row.qualification});
    demandPackages.push({...source,package:demandPackage});
  }
  const counts=Object.fromEntries(['OK','WARN','NG','NOT_CHECKED'].map(key=>[key,checks.filter(x=>x.status===key).length]));
  const governing=checks.filter(x=>x.ratio!==null).sort((a,b)=>b.ratio-a.ratio)[0]||null;
  return {version:ELASTIC_REVIEW_VERSION,units:clone(model.units),axes:'member-local',signConvention:'solver-native',checks,sources,demandPackages,
    summary:{status:counts.NG?'NG':counts.NOT_CHECKED?'NOT_CHECKED':counts.WARN?'WARN':'OK',counts,maxUtilization:governing?.ratio??null,governing,checkCount:checks.length},
    ruleSources:[{module:'src/design/steel.js',method:'steel_allowable_preliminary + elastic LTB',status:'preliminary'},{module:'src/design/concrete.js',method:'rc_preliminary_strength',status:'preliminary'},{module:'src/design/serviceability.js',method:'story drift H/200 default',status:'project criterion required'},{module:'src/design/connectionFoundation.js',method:'force / bearing / sliding screening',status:'assumed capacities; preliminary'}],
    limitations:['Final design transfer is blocked; computed OK is not engineering approval.','Only explicitly bound completed first-order/Direct P–Delta combinations are mapped. Legacy P–Delta is comparison-only and blocked. Modal, RSA, buckling, THA and nonlinear results are not mapped to member design demand.','Steel checks are preliminary allowable-stress screens, not a complete strength-code implementation. RC uses simplified section/rebar assumptions.','LTB, missing members, warnings and unchecked items retain their own status.','Connection bolt/weld/anchorage and foundation settlement, punching, reinforcement and soil qualification are NOT_CHECKED.','Selected combinations only; required code combination coverage is not certified.']};
}
