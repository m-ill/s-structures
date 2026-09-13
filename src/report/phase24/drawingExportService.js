import {workerBudgetObservers} from '../../core/workerBudgetObservers.js';
import {BudgetMap} from '../../core/resourceBudget.js';
import {sha256Bytes} from '../../core/stableHash.js';
import {createModuleWorker,runBoundedWorkerTask} from '../../core/boundedWorkerTask.js';
const reject=code=>{throw Object.assign(new Error(code),{code});};
export function createDrawingExportService({bridge,workflow,budget,loadFont,timeoutMs=10000,workerFactory=()=>createModuleWorker(new URL('./drawingWorker.js',import.meta.url))}) {
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>10000)reject('EXPORT_TIMEOUT_INVALID');
 const evaluationStatus=args=>(workflow.getEvaluationStatus||workflow.getEvaluation).call(workflow,args);
 const artifacts=new BudgetMap(budget,'practical-drawing-artifacts',{maxEntries:8,maxBytes:32*1024*1024});
 let controller=null,activeOwner=null,disposed=false;
 async function exportDrawing({evaluationId,format='pdf',page=0,volume=0}) {
  if(disposed)reject('SESSION_DISPOSED');if(controller)reject('EXPORT_BUSY');
  if(!Number.isInteger(volume)||volume<0||volume>9||format!=='pdf'&&volume!==0)reject('DRAWING_VOLUME_INVALID');
  if(!['pdf','pdf-bundle','svg','json','csv'].includes(format)||!Number.isInteger(page)||page<0)reject('ARTIFACT_FORMAT_INVALID');
  const state=evaluationStatus({evaluationId});if(state.stale)reject('STALE_INPUT');
  const owner=budget.nextOwner('practical-drawing-staging');budget.reserve(owner,(workflow.drawingSnapshotBytes?workflow.drawingSnapshotBytes(evaluationId):workflow.snapshotBytes(evaluationId))*3+(format==='pdf-bundle'?128:['pdf','csv'].includes(format)?64:32)*1024*1024);
  const activeController=new AbortController();controller=activeController;activeOwner=owner;const signal=controller.signal;
  // Abort ends the user's wait, not necessarily an injected/streaming loader.
  // Keep admission charged until both the export and the font task settle.
  let fontPending=false,exportFinished=false;
  const releaseWhenSettled=()=>{if(exportFinished&&!fontPending)budget.release(owner);};
  const started=performance.now();let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;activeController.abort();},timeoutMs);
  try {
   const snapshot=workflow.readDrawingSnapshot?workflow.readDrawingSnapshot(evaluationId):workflow.readSnapshot(evaluationId);
   let font=null,fontSha256=null;
   if(format==='pdf'||format==='pdf-bundle'){
    fontPending=true;
    const pending=Promise.resolve().then(()=>{if(signal.aborted)reject('EXPORT_CANCELLED');return loadFont(signal);}).then(
     value=>{fontPending=false;releaseWhenSettled();return value;},
     error=>{fontPending=false;releaseWhenSettled();throw error;}
    );
    font=await waitForAbort(pending,signal);if(signal.aborted)reject('EXPORT_CANCELLED');if(!(font instanceof Uint8Array)||font.byteLength>8*1024*1024)reject('DRAWING_FONT_SIZE_LIMIT');fontSha256=sha256Bytes(font);
   }
   if(evaluationStatus({evaluationId}).stale)reject('STALE_INPUT');
   const remaining=timeoutMs-(performance.now()-started);if(remaining<=0)reject('EXPORT_TIMEOUT');
   const drawing=await runBoundedWorkerTask({...workerBudgetObservers(budget,owner),payload:{snapshot,format,page,font,volume},signal,timeoutMs:remaining,workerFactory}).catch(error=>{if(error.code==='CANCELLED')reject('EXPORT_CANCELLED');if(error.code==='TASK_TIMEOUT')reject('EXPORT_TIMEOUT');throw error;});
   const {bytes,mime}=drawing;
   if(bytes.byteLength>32*1024*1024)reject('DRAWING_ARTIFACT_SIZE_LIMIT');
   if(signal.aborted||disposed)reject('EXPORT_CANCELLED');if(bridge.getWorkflowInputIdentity().inputHash!==snapshot.inputHash)reject('STALE_INPUT');
   // A same-input analysis rerun can replace source result hashes. Model identity
   // alone does not prove that the evaluation is still publishable.
   if(evaluationStatus({evaluationId}).stale)reject('STALE_INPUT');
   const sha256=sha256Bytes(bytes),artifactId=`drawing-${sha256}`,manifest={artifactId,evaluationId,format,mime,spliceGeometryIssueCount:drawing.spliceGeometryIssueCount||0,byteLength:bytes.length,sha256,fontSha256,inputHash:snapshot.inputHash,evaluatorVersion:snapshot.evaluatorVersion||null,rulePackHash:snapshot.rulePackHash||null,preparedGeometryHash:drawing.preparedGeometryHash,detailHash:drawing.detailHash,...(drawing.designComparison?{designComparison:drawing.designComparison}:{}),analysisSources:drawing.analysisSources,sourceAnalysisRunIds:drawing.sourceAnalysisRunIds,pages:format==='svg'?1:drawing.pages,totalPages:drawing.totalPages,retainedPages:drawing.retainedPages,volume:drawing.volume,volumeCount:drawing.volumeCount,pageStart:drawing.pageStart,pageEnd:drawing.pageEnd,nextVolume:drawing.nextVolume,...(drawing.volumes?{volumes:drawing.volumes}:{}),reviewOnly:true,designTransferAllowed:false};
   artifacts.set(artifactId,{manifest,bytes});return {ok:true,...manifest};
  }catch(error){if(timedOut)reject('EXPORT_TIMEOUT');throw error;}
  finally{clearTimeout(timer);if(controller===activeController){controller=null;activeOwner=null;}exportFinished=true;releaseWhenSettled();}
 }
 function getArtifact({artifactId,offset=0,limit=12288}) {
  const row=artifacts.get(artifactId);if(!row)reject('ARTIFACT_REQUIRED');
  if(!Number.isInteger(offset)||offset<0||offset>row.bytes.length||!Number.isInteger(limit)||limit<1||limit>12288)reject('ARTIFACT_RANGE_INVALID');
  const chunk=row.bytes.subarray(offset,offset+limit),base64=btoa(String.fromCharCode(...chunk));
  let sourceStale=true;try{sourceStale=evaluationStatus({evaluationId:row.manifest.evaluationId}).stale!==false;}catch{}
  return {ok:true,...row.manifest,stale:sourceStale||row.manifest.inputHash!==bridge.getWorkflowInputIdentity().inputHash,offset,nextOffset:offset+chunk.length<row.bytes.length?offset+chunk.length:null,encoding:'base64',content:base64};
 }
 function listArtifacts() {
  const currentHash=bridge.getWorkflowInputIdentity().inputHash;
  return {ok:true,retainedBytes:artifacts.bytes,rows:[...artifacts].map(([artifactId,{manifest}])=>{
   let stale=true;try{stale=evaluationStatus({evaluationId:manifest.evaluationId}).stale!==false;}catch{}
   return {artifactId,evaluationId:manifest.evaluationId,format:manifest.format,byteLength:manifest.byteLength,sha256:manifest.sha256,inputHash:manifest.inputHash,detailHash:manifest.detailHash,preparedGeometryHash:manifest.preparedGeometryHash,stale:stale||manifest.inputHash!==currentHash};
  })};
 }
 function releaseArtifact({artifactId}) {
  if(typeof artifactId!=='string'||!artifactId)reject('ARTIFACT_ID_REQUIRED');
  const before=artifacts.bytes,released=artifacts.delete(artifactId);
  return {ok:true,artifactId,released,releasedBytes:before-artifacts.bytes,remainingArtifactCount:artifacts.size};
 }
 return {exportDrawing,getArtifact,listArtifacts,releaseArtifact,cancel(){controller?.abort();return {ok:true};},resume(){disposed=false;},dispose(){disposed=true;controller?.abort();artifacts.clear();}};
}
export async function loadBundledDrawingFont(signal) {
 const response=await fetch(new URL('../../../assets/fonts/phase24/SStructuresSans.ttf',import.meta.url),{signal});
 if(!response.ok||Number(response.headers.get('content-length'))>8*1024*1024)reject('DRAWING_FONT_UNAVAILABLE');
 if(!response.body?.getReader)reject('DRAWING_FONT_STREAM_REQUIRED');
 const reader=response.body.getReader();let total=0,finished=false;
 const maxBytes=8*1024*1024;
 let buffer=new Uint8Array(0);
 try{
  while(true){
   if(signal?.aborted)reject('EXPORT_CANCELLED');
   const {done,value}=await reader.read();
   if(signal?.aborted)reject('EXPORT_CANCELLED');
   if(done){finished=true;break;}
   if(!(value instanceof Uint8Array))reject('DRAWING_FONT_STREAM_INVALID');
   const required=total+value.byteLength;
   if(required>maxBytes)reject('DRAWING_FONT_SIZE_LIMIT');
   if(required>buffer.length){
    let capacity=Math.max(65536,buffer.length);
    while(capacity<required)capacity=Math.min(maxBytes,capacity*2);
    const grown=new Uint8Array(capacity);grown.set(buffer.subarray(0,total));buffer=grown;
   }
   buffer.set(value,total);total=required;
  }
  return total===buffer.length?buffer:buffer.slice(0,total);

 }finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function waitForAbort(promise,signal){
 return new Promise((resolve,rejectPromise)=>{
  const abort=()=>{cleanup();rejectPromise(Object.assign(new Error('EXPORT_CANCELLED'),{code:'EXPORT_CANCELLED'}));},cleanup=()=>signal.removeEventListener('abort',abort);
  Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();rejectPromise(error);});
  if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});
 });
}
