import { stableHash } from '../core/stableHash.js';
import { createWorkflowInputIdentity, sameWorkflowInput } from '../core/workflowIdentity.js';
import { validateModel } from '../core/validation.js';
import { canEditWorkflow } from '../platform/workflowLock.js';
import { commitModelTransaction } from './transaction.js';
import { DESIGN_INPUT_TYPES, DESIGN_INPUT_UNITS, MEMBER_DESIGN_FIELDS, fail, object, finiteJson, stageDesignInputCommand } from './designInputCommands.js';

export const DESIGN_INPUT_SERVICE_VERSION='p19-m2-design-input-v1';
const copy=x=>structuredClone(x);
const failure=e=>({ok:false,changed:false,status:'blocked',code:e.code||'DESIGN_INPUT_FAILED',message:e.message,details:copy(e.details||e.blockers||e.approvalBlockers||null)});

// One owner for UI and Agent transactions. No solver and no approval creation.
export function createDesignInputService(options) {
  const plans=new Map(), requests=new Map(), history=[];
  let epoch=0,sequence=0;
  const getIdentity=model=>options.getIdentity?.(model)||createWorkflowInputIdentity({model});
  function editable(model) {
    if(!model || !canEditWorkflow(model)) fail('WORKFLOW_LOCKED');
    if(options.canEdit && options.canEdit(model)!==true) fail('EDIT_FORBIDDEN');
  }
  function compile(model,request) {
    finiteJson(request);object(request,['requestId','units','commands']);
    if(typeof request.requestId!=='string'||!request.requestId.trim()||request.requestId.length>128) fail('REQUEST_ID_REQUIRED');
    if(stableHash(request.units)!==stableHash(DESIGN_INPUT_UNITS)||stableHash(model.units)!==stableHash(DESIGN_INPUT_UNITS)) fail('UNITS_MISMATCH');
    if(JSON.stringify(request).length>1024*1024) fail('REQUEST_TOO_LARGE');
    if(!Array.isArray(request.commands)||!request.commands.length||request.commands.length>100) fail('COMMAND_COUNT_INVALID');
    const next=copy(model),warnings=[];
    for(const command of copy(request.commands)) stageDesignInputCommand(next,command,options,warnings);
    const validation=validateModel(next);
    if(!validation.ok) fail('MODEL_VALIDATION_FAILED',validation.errors);
    warnings.push(...validation.warnings);
    const changes=diff(model,next);
    return {next,warnings,changes,changed:changes.length>0};
  }
  function preview(request) {
    try {
      const model=options.getModel();editable(model);
      const compiled=compile(model,request),requestHash=stableHash(request);
      const prior=requests.get(request.requestId);
      if(prior && prior.hash!==requestHash) fail('REQUEST_ID_CONFLICT');
      if(plans.size>=64) plans.delete(plans.keys().next().value);
      const id=`design-change-${++sequence}`;
      const affected=new Set();
      for(const c of request.commands) {
        if(c.memberIds) c.memberIds.forEach(id=>affected.add(id));
        else if(c.nodeIds) (model.members||[]).filter(m=>c.nodeIds.includes(m.n1)||c.nodeIds.includes(m.n2)).forEach(m=>affected.add(m.id));
        else (model.members||[]).forEach(m=>affected.add(m.id));
      }
      const value={version:DESIGN_INPUT_SERVICE_VERSION,ok:true,status:'ready',id,requestId:request.requestId,
        sourceIdentity:getIdentity(model),sourceRevision:{model:model.meta?.revisionId||model.meta?.revision||null,input:model.meta?.p19InputRevision||0,epoch},
        units:copy(request.units),memberDesignUnits:MEMBER_DESIGN_FIELDS,affectedMemberIds:[...affected].sort(),
        changed:compiled.changed,changes:compiled.changes,warnings:compiled.warnings};
      plans.set(id,{model,request:copy(request),requestHash,epoch,value:copy(value),nextHash:stableHash(compiled.next)});
      return copy(value);
    } catch(e) {return failure(e);}
  }
  function prepareCommit(model,next) {
    // Legacy model transactions require writable plain model containers. Detect
    // unsupported descriptors before the first mutation, including deletion.
    if(!Object.isExtensible(model)) fail('MODEL_NOT_WRITABLE');
    for(const descriptor of Object.values(Object.getOwnPropertyDescriptors(model))) {
      if(!descriptor.configurable||!ownValue(descriptor)||!descriptor.writable) fail('MODEL_NOT_WRITABLE');
    }
    next.meta={...(next.meta||{}),p19InputRevision:(model.meta?.p19InputRevision||0)+1};
    for(const row of next.analysisCases||[]) if(row.lastRun || !['not-run',undefined].includes(row.status)) {
      row.status='stale';row.staleReason='design-input-changed';
    }
  }
  function notify(receipt) {
    try {options.onCommitted?.(copy(receipt));} catch(e) {receipt.notificationWarning=e.message;}
    return copy(receipt);
  }
  function apply(previewValue) {
    try {
      const row=plans.get(previewValue?.id);
      if(!row||stableHash(row.value)!==stableHash(previewValue)) fail('PREVIEW_INVALID');
      const model=options.getModel();if(model!==row.model) fail('PROJECT_CHANGED');editable(model);
      const prior=requests.get(row.request.requestId);
      if(prior) {
        if(prior.hash!==row.requestHash) fail('REQUEST_ID_CONFLICT');
        return {...copy(prior.receipt),changed:false,replayed:true};
      }
      if(row.epoch!==epoch||!sameWorkflowInput(row.value.sourceIdentity,getIdentity(model))) fail('STALE_INPUT');
      // Re-evaluate rule-pack approval, workflow lock and model validation now.
      const compiled=compile(model,row.request);
      if(stableHash(compiled.next)!==row.nextHash) fail('PREVIEW_DEPENDENCY_CHANGED');
      if(requests.size>=256) fail('REQUEST_HISTORY_LIMIT');
      const before=copy(model);
      let inputIdentity=getIdentity(model);
      if(compiled.changed) {
        prepareCommit(model,compiled.next);
        inputIdentity=getIdentity(compiled.next);
        if(!commitModelTransaction(model,{ok:true,model:compiled.next})) fail('COMMIT_FAILED');
        epoch++;
      }
      const receipt={ok:true,version:DESIGN_INPUT_SERVICE_VERSION,changed:compiled.changed,requestId:row.request.requestId,
        transactionId:row.value.id,sourceIdentity:row.value.sourceIdentity,inputIdentity,
        affectedMemberIds:row.value.affectedMemberIds,changes:row.value.changes,warnings:compiled.warnings,undoDepth:history.length+(compiled.changed?1:0)};
      if(compiled.changed) {history.push({model,before,afterIdentity:receipt.inputIdentity,requestId:receipt.requestId});if(history.length>20) history.shift();receipt.undoDepth=history.length;}
      requests.set(receipt.requestId,{hash:row.requestHash,receipt:copy(receipt)});
      return compiled.changed?notify(receipt):receipt;
    } catch(e) {return failure(e);}
  }
  function undo() {
    try {
      const model=options.getModel();editable(model);
      const row=history.at(-1);if(!row) fail('UNDO_EMPTY');
      if(model!==row.model||!sameWorkflowInput(row.afterIdentity,getIdentity(model))) fail('UNDO_STALE');
      const next=copy(row.before);prepareCommit(model,next);
      const inputIdentity=getIdentity(next);
      if(!commitModelTransaction(model,{ok:true,model:next})) fail('COMMIT_FAILED');
      history.pop();epoch++;
      // Rebind the preceding entry only after a successful, contiguous undo.
      if(history.length) history.at(-1).afterIdentity=inputIdentity;
      requests.get(row.requestId).receipt.undone=true;
      return notify({ok:true,changed:true,undoneRequestId:row.requestId,inputIdentity,undoDepth:history.length});
    } catch(e) {return failure(e);}
  }
  return Object.freeze({preview,apply,undo,getContext() {
    const model=options.getModel();return {version:DESIGN_INPUT_SERVICE_VERSION,editable:!!model&&canEditWorkflow(model)&&(!options.canEdit||options.canEdit(model)===true),
      inputIdentity:model?getIdentity(model):null,types:DESIGN_INPUT_TYPES,units:DESIGN_INPUT_UNITS,memberDesignUnits:MEMBER_DESIGN_FIELDS,undoDepth:history.length};
  }});
}
const ownValue=x=>Object.prototype.hasOwnProperty.call(x,'value');
function diff(before,after,path='') {
  if((before===undefined)===(after===undefined) && stableHash(before??null)===stableHash(after??null)) return [];
  if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)) {
    return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(key=>diff(before[key],after[key],path?`${path}.${key}`:key));
  }
  if(Array.isArray(before)&&Array.isArray(after)&&[...before,...after].every(x=>x&&typeof x==='object'&&typeof x.id==='string')) {
    const a=new Map(before.map(x=>[x.id,x])),b=new Map(after.map(x=>[x.id,x]));
    return [...new Set([...a.keys(),...b.keys()])].sort().flatMap(id=>diff(a.get(id),b.get(id),`${path}[${id}]`));
  }
  return [{path,before:copy(before??null),after:copy(after??null)}];
}
