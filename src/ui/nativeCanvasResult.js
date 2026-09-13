import {retainedBytes} from '../core/resourceBudget.js';
import {normalizeIndexResult} from './indexResultCompatibility.js';
import {selectStaticResult,resultCanDisplay} from './resultSelectionProjection.js';

// Own a single isolated legacy drawing projection. Never solve or mutate a record.
export function createNativeCanvasResult({runtime,budget}){
 const owner=budget.nextOwner('native-canvas-result');let source=null,selectedId=null;
 function clear(){source=null;selectedId=null;runtime?.clearAnalysisView?.();budget.release(owner);}
 return {clear,dispose:clear,sync(record,comboId,current){
  if(!runtime?.publishAnalysisView)return;
  if(!current||!resultCanDisplay(record)||record.kind!=='static'){clear();return;}
  const selected=selectStaticResult(record.payload,comboId||record.settings?.comboId);
  if(!selected.available){clear();return;}
  if(source===record&&selectedId===selected.comboId)return;
  clear();
  try{
   // Reserve clone and compatibility aliases before allocating the projection.
   budget.reserve(owner,retainedBytes(selected.result)*3+16384);
   const result=structuredClone(selected.result),id=selected.comboId;
   const analysis=normalizeIndexResult({ok:true,combos:[{id,name:id}],byCombo:{[id]:result},envelope:result});
   budget.reserve(owner,retainedBytes(analysis));
   runtime.publishAnalysisView(analysis,result,id);
   source=record;selectedId=id;
  }catch(error){clear();throw error;}
 }};
}
