import {workerBudgetObservers} from '../../core/workerBudgetObservers.js';
import {runCandidateEvaluation} from './candidateAnalysisClient.js';
import {practicalResultCacheKey} from './practicalResultCache.js';
import {requireCurrentDesignSources} from './designSourceGuard.js';
import { freezeCheckpointValue } from './workflowResults.js';
import {ELASTIC_REVIEW_VERSION} from '../../metadata/elasticReviewVersion.js';
import {calculateReview} from './elasticReviewCalculation.js';
import {createModuleWorker,runBoundedWorkerTask} from '../../core/boundedWorkerTask.js';
import {retainedBytes} from '../../core/resourceBudget.js';
import {PRACTICAL_DESIGN_LIMITS as limits} from '../../metadata/practicalDesignLimits.js';
import { validateReportSnapshot } from '../../report/phase11/reportSnapshot.js';
import {selectDesignCombination} from './designCombinationSource.js';
import { BudgetMap, createResourceBudget } from '../../core/resourceBudget.js';
import { stableHash, sha256 } from '../../core/stableHash.js';
import { sameWorkflowInput } from '../../core/workflowIdentity.js';
import { createDesignReviewReport } from '../../report/phase19/designReviewReport.js';
import { finiteJson, object } from '../../modeling/designInputCommands.js';

export {ELASTIC_REVIEW_VERSION} from '../../metadata/elasticReviewVersion.js';
const clone = value => structuredClone(value);
const problem = (code, details = null) => ({ ok: false, code, details, designTransferAllowed: false });
const reject = (code, details) => { throw Object.assign(new Error(code), { code, details }); };
const guard = fn => { try { return fn(); } catch (e) { return problem(e.code || e.message, e.details); } };
const kinds = ['static','modal','responseSpectrum','buckling','linearTha'];

export function createElasticReviewService({ bridge, store, reportExportWorkflow, browserPdfExporter=null, sharedPracticalCache=null, getPdfContext = () => ({}), budget = createResourceBudget() }) {
  const reviewPlans = new BudgetMap(budget,'review-plans',{maxEntries:64}), workflowPlans = new BudgetMap(budget,'workflow-plans',{maxEntries:64}), requests = new BudgetMap(budget,'review-requests'), reports = new BudgetMap(budget,'reports',{maxEntries:32});
  let busy = false, reviewController=null, reviewGeneration=0;
  const pendingReviews=new Map();
  const identity = () => bridge.getWorkflowInputIdentity();
  function currentSources(sources,admissionOwner=null) {
    const currentIdentities = {}, rows = [], combinations = new Set();
    let admissionBytes=retainedBytes(bridge.getCurrentModel())*3;
    for (const source of sources) {
      object(source, ['analysisRunId','comboId']);
      if (typeof source.analysisRunId !== 'string' || typeof source.comboId !== 'string') reject('SOURCE_IDS_REQUIRED');
      if (combinations.has(source.comboId)) reject('DUPLICATE_COMBINATION');
      combinations.add(source.comboId);
      if(admissionOwner){
        const meta=bridge.getWorkflowAnalysisMetadata(source.analysisRunId);
        if(!meta.ok)reject(meta.code);
        if(!Number.isSafeInteger(meta.retainedSizeEstimateBytes)||meta.retainedSizeEstimateBytes<0)reject('SOURCE_MEMORY_ESTIMATE_REQUIRED');
        admissionBytes+=meta.retainedSizeEstimateBytes*3;budget.reserve(admissionOwner,admissionBytes);
      }
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
      const set = selectDesignCombination(payload,source.comboId,method);
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
    const result = calculateReview(model, rows,sharedPracticalCache?.get(practicalResultCacheKey(plan.inputIdentity.inputHash,rows)));
    if (!sameWorkflowInput(plan.inputIdentity, identity())) reject('STALE_INPUT');
    requireCurrentDesignSources(bridge,rows);
    const { version, inputIdentity, ...storePlan } = plan;
    const recorded = store.recordDesign({identity:inputIdentity,plan:storePlan,currentIdentities,result});
    requests.set(key, {hash,id:recorded.designRunId});
    return recorded;
  }); }
  function startReviewAsync(input={}) {
    let hash,key;
    try{
      finiteJson(input);object(input,['plan','requestId']);requestKey(input.requestId);
      key=`review:${input.requestId}`;hash=stableHash(input.plan);
      const pending=pendingReviews.get(key);
      if(pending){if(pending.hash!==hash)reject('REQUEST_ID_CONFLICT');return pending.promise;}
      if(reviewController)reject('DESIGN_REVIEW_BUSY');
      const issued=reviewPlans.get(input.plan?.planHash);
      if(!issued||stableHash(issued)!==hash)reject('DESIGN_PLAN_INVALID');
      if(!sameWorkflowInput(input.plan.inputIdentity,identity()))reject('STALE_INPUT');
      if(requests.has(key)){const prior=requests.get(key);if(prior.hash!==hash)reject('REQUEST_ID_CONFLICT');return Promise.resolve(getReview(prior.id));}
      if(requests.size>=128)reject('SESSION_REQUEST_LIMIT');
    }catch(e){return Promise.resolve(problem(e.code||e.message,e.details));}
    const controller=new AbortController(),generation=reviewGeneration,owner=budget.nextOwner('design-review-transient');
    reviewController=controller;
    const reviewStarted=performance.now();let reviewTimedOut=false;
    const reviewTimer=setTimeout(()=>{reviewTimedOut=true;controller.abort();},limits.maxEvaluationMillis);
    const promise=(async()=>{
      try{
        const model=bridge.getCurrentModel();
        if((model.members||[]).length>limits.maxMembers||input.plan.sources.length>limits.maxSources)reject('FOCUSED_DESIGN_SIZE_LIMIT');
        budget.reserve(owner,retainedBytes(model)*3);
        const {rows}=currentSources(input.plan.sources,owner);
        if(rows.some(x=>Object.values(x.set.memberResults||{}).reduce((n,r)=>n+(r.xs?.length||0),0)>limits.maxStationsPerSet))reject('FOCUSED_DESIGN_SIZE_LIMIT');
        const compactRows=rows.map(({source,set,method,row})=>({source,set,method,row:{caseId:row.caseId,qualification:row.qualification,identity:row.identity,resultHash:row.resultHash}}));
        budget.reserve(owner,retainedBytes({model,rows:compactRows})*3);
        const sharedKey=practicalResultCacheKey(input.plan.inputIdentity.inputHash,rows);
        let prepared=sharedPracticalCache?.get(sharedKey),freshPractical=null;
        if(!prepared&&sharedPracticalCache){freshPractical=await sharedPracticalCache.compute(sharedKey,signal=>runCandidateEvaluation({budget,workerReservationBytes:budget.snapshot().owners[owner],model,sets:compactRows,timeoutMs:limits.maxEvaluationMillis,signal}),controller.signal);prepared=freshPractical;}
        if(controller.signal.aborted||generation!==reviewGeneration)reject('CANCELLED');
        const remaining=limits.maxEvaluationMillis-(performance.now()-reviewStarted);if(remaining<=0)reject('TASK_TIMEOUT');
        if(prepared)budget.reserve(owner,retainedBytes({model,rows:compactRows,prepared})*3);
        const computed=await runBoundedWorkerTask({...workerBudgetObservers(budget,owner),payload:{model,rows:compactRows,prepared},timeoutMs:remaining,signal:controller.signal,workerFactory:()=>createModuleWorker(new URL('./elasticReviewWorker.js',import.meta.url))});
        const result=computed.review;
        if(controller.signal.aborted||generation!==reviewGeneration)reject('CANCELLED');
        if(!sameWorkflowInput(input.plan.inputIdentity,identity()))reject('STALE_INPUT');
        const current=requireCurrentDesignSources(bridge,rows);
        // Account for returned data and the immutable result-store copy before publication.
        budget.reserve(owner,retainedBytes({model,rows:compactRows})*2+retainedBytes({computed,freshPractical})*2);
        const {version,inputIdentity,...storePlan}=input.plan;
        requests.set(key,{hash,id:null});
        try{
          const recorded=store.recordDesign({identity:inputIdentity,plan:storePlan,currentIdentities:current.currentIdentities,result});
          if(!recorded.ok){requests.delete(key);return recorded;}
          requests.get(key).id=recorded.designRunId;requests.refresh(key);
          if(freshPractical||computed.practical)sharedPracticalCache?.put(sharedKey,freshPractical||computed.practical);
          return recorded;
        }catch(error){requests.delete(key);throw error;}
      }catch(e){return problem(reviewTimedOut?'TASK_TIMEOUT':e.code||e.message,e.details);}
      finally{clearTimeout(reviewTimer);budget.release(owner);if(reviewController===controller)reviewController=null;pendingReviews.delete(key);}
    })();
    pendingReviews.set(key,{hash,promise});
    // A pre-Worker admission failure can finish synchronously before registration.
    promise.finally(()=>{if(pendingReviews.get(key)?.promise===promise)pendingReviews.delete(key);});
    return promise;
  }
  function cancelReview(){const active=!!reviewController;reviewController?.abort();return {ok:true,cancelRequested:active};}
  function getReviewExecution(){return {mode:'module-worker',active:!!reviewController,compatibilityMode:'synchronous',timeoutMs:limits.maxEvaluationMillis};}
  function getReview(id) { return guard(() => store.getDesign(id, identity())); }
  function createReport(id) { return guard(() => {
    const record = getReview(id);
    if (!record.ok) return record;
    if (record.stale) return problem('STALE_INPUT');
    if (!reports.has(id)) reports.set(id, createDesignReviewReport(clone(bridge.getCurrentModel()), record, getPdfContext(id)));
    return getReport(id);
  }); }
  function getReport(id) { return guard(() => {
    const value = reports.get(id);if (!value) return problem('RESULT_REQUIRED');
    const record = getReview(id);if (!record.ok) return record;
    return {ok:true,...clone(value),stale:record.stale};
  }); }
  function getArtifact(id, {format,offset=0} = {}) { return guard(() => {
    const report=reports.get(id);if(!report)return problem('RESULT_REQUIRED');
    if(!['html','json','csv'].includes(format))return problem('ARTIFACT_FORMAT_INVALID');
    const record=store.getDesignMetadata(id,identity());if(!record.ok)return record;
    const text=format==='html'?report.reports['ko-KR'].html:report[format];
    if(!Number.isSafeInteger(offset)||offset<0||offset>text.length)return problem('ARTIFACT_RANGE_INVALID');
    const end=Math.min(offset+12000,text.length), content=text.slice(offset,end);
    return {ok:true,...clone(report.artifactManifest[format]),stale:record.stale,
      offset,nextOffset:end<text.length?end:null,content,chunkSha256:sha256(content)};
  }); }
  function exportContext(id) {
    const report = getReport(id);if(!report.ok) reject(report.code);if(report.stale) reject('STALE_INPUT');
    return { ...getPdfContext(id), snapshot:report.snapshot, reports:report.reports,
      currentReportSnapshotHash:report.reportSnapshotHash, projectId:report.snapshot.project.id, source:'p19-m3' };
  }
  function getExportCapability(id) { return guard(() => {
    if(browserPdfExporter?.supported()){
      const record=store.getDesignMetadata(id,identity());if(!record.ok)return record;
      if(!reports.has(id))return problem('RESULT_REQUIRED');
      return {ok:true,formats:['html','json','csv','pdf'],automaticPdf:!record.stale,automaticFinalPdf:false,scope:'preliminary-review-record',textSearchable:false,designTransferAllowed:false,stale:record.stale};
    }
    const input = exportContext(id), pdf = reportExportWorkflow.preflight(input);
    return {ok:true,formats:['html','json','csv'],manualPrint:true,automaticPdf:pdf.ready,pdf};
  }); }
  async function exportPdf(id) {
    try {
      if(browserPdfExporter?.supported()){
        const report=reports.get(id);if(!report)return problem('RESULT_REQUIRED');
        const assertCurrent=()=>{const current=store.getDesignMetadata(id,identity());if(!current.ok||current.stale||reports.get(id)!==report)reject('STALE_INPUT');};
        assertCurrent();return await browserPdfExporter.export(report,{assertCurrent});
      }
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
          if(result.cancelled){result.ok=false;result.code='WORKFLOW_CANCELLED';break;}
          if(!sameWorkflowInput(plan.inputIdentity,identity())) {result.ok=false;result.code='STALE_INPUT';break;}
          if(step.prerequisites.some(id=>!result.steps.find(x=>x.caseId===id)?.ok)) {result.steps.push({...step,ok:false,code:'DEPENDENCY_FAILED'});result.ok=false;continue;}
          const previousId=bridge.getAnalysisCaseResult(step.caseId,{latestAttempt:true})?.runRecordId;
          const job=bridge.startAnalysisRun({caseId:step.caseId,computeTarget:plan.computeTarget});
          result.currentJobId=job.id;
          const finished=await bridge.getProductAnalysisService().wait(job.id);
          result.currentJobId=null;
          const published=bridge.getAnalysisCaseResult(step.caseId,{latestAttempt:true});
          const row=published?.runRecordId?bridge.getWorkflowAnalysisResult(published.runRecordId):null;
          const ok=finished.status==='completed'&&published?.runRecordId!==previousId&&!!row?.ok&&!row.stale&&row.executionStatus==='completed';
          result.steps.push({...step,ok,jobId:job.id,analysisRunId:row?.analysisRunId||null,code:ok?null:row?.stale?'STALE_INPUT':finished.error?.code||'ANALYSIS_NOT_COMPLETED',
            ...(!ok&&finished.error?{error:clone(finished.error)}:{})});
          if(ok) result.sourceAnalysisRunIds.push(row.analysisRunId);
          if(!ok) result.ok=false;
        }
      } catch(e) {result.ok=false;result.code=e.code||e.message;}
      finally {busy=false;if(result.cancelled){result.ok=false;result.code='WORKFLOW_CANCELLED';}result.status=result.ok?'completed':'failed';}
      return clone(result);
    } catch(e) {return problem(e.code||e.message,e.details);}
  }
  function cancelWorkflow(requestId) {const result=requests.get(`workflow:${requestId}`)?.result;if(!result)return problem('WORKFLOW_NOT_FOUND');if(result.status==='running'){result.cancelled=true;if(result.currentJobId)bridge.cancelAnalysisRun(result.currentJobId);}return {ok:true,status:result.status,cancelRequested:!!result.cancelled};}
  function dispose(){reviewGeneration++;reviewController?.abort();for(const value of requests.values())if(value.result?.status==='running'){value.result.cancelled=true;if(value.result.currentJobId)bridge.cancelAnalysisRun(value.result.currentJobId);}reviewPlans.clear();workflowPlans.clear();requests.clear();reports.clear();}
  function exportState({shareImmutable=false}={}){const rows=[...reports.entries()];return shareImmutable?freezeCheckpointValue(rows):clone(rows);}
  function restoreState(rows,{shareImmutable=false}={}) {
    if(!Array.isArray(rows))throw new Error('CHECKPOINT_REPORTS_INVALID');
    for(const [id,value] of rows) {
      const record=store.getDesignMetadata(id,identity());if(!record.ok)throw new Error('CHECKPOINT_REPORT_SOURCE_MISSING');
      if(value.snapshot?.designReview?.resultHash!==record.resultHash||!validateReportSnapshot(value.snapshot).ok)throw new Error('CHECKPOINT_REPORT_SOURCE_MISMATCH');
      if(stableHash(JSON.parse(value.json))!==stableHash(value.snapshot)||!['html','json','csv'].every(format=>value.artifactManifest?.[format]))throw new Error('CHECKPOINT_REPORT_SNAPSHOT_MISMATCH');
      for(const [format,manifest] of Object.entries(value.artifactManifest||{})) {
        const text=format==='html'?value.reports?.['ko-KR']?.html:value[format];
        if(typeof text!=='string'||sha256(text)!==manifest.sha256||text.length!==manifest.totalCharacters||new TextEncoder().encode(text).byteLength!==manifest.byteLength||manifest.reportSnapshotHash!==value.reportSnapshotHash)throw new Error('CHECKPOINT_ARTIFACT_HASH_INVALID');
      }
    }
    for(const [id,value] of rows)if(shareImmutable)reports.set(id,freezeCheckpointValue(value));else reports.setCopy(id,value);
    return {ok:true,reports:reports.size};
  }
  return Object.freeze({dispose,exportState,restoreState,cancelWorkflow,planReview,startReview,startReviewAsync,cancelReview,getReviewExecution,getReview,createReport,getReport,getArtifact,getExportCapability,exportPdf,planWorkflow,runWorkflow});
}
function requestKey(value) {if(typeof value!=='string'||!value.trim()||value.length>128) reject('REQUEST_ID_REQUIRED');}
