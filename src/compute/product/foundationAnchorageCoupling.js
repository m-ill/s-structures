import {evaluateFootingBarAnchorage} from '../../design/foundation/footingAnchorage.js';
import {footingMinimumSteel} from '../../design/foundation/footingMinimumSteel.js';
import {footingBarLayout} from '../../design/foundation/footingBarLayout.js';
import {minimumFlexuralBarClearSpacing} from '../../design/rc/kdsSpacing.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {rebarCatalogProduct} from '../../materials/rebarProductCatalog.js';
import {readFootprintLimits} from '../../metadata/footprintLimits.js';
import {evaluateFootingPlanClearance} from '../../design/foundation/footingPlanClearance.js';
export function coupleFootingAnchorage(model,footing,inputEdit){
 const edit={...inputEdit},reinforcement={...footing.reinforcement},candidate={...footing,...edit,reinforcement};
 let lastAnchorage=null;
 const unresolved=reason=>({status:'UNRESOLVED',reason,edit:{...inputEdit},codeReferences:lastAnchorage?.codeReferences||[],requiresFullReevaluation:true});
 for(const face of ['bottom','top'])for(const axis of ['B','L']){
  const key=face+axis,bar=reinforcement[key];if(!bar)continue;
  const mm=edit[`${face}Diameter${axis}`],spacing=edit[`${face}Spacing${axis}`];
  const product=mm!==undefined&&footing.barCatalogId?rebarCatalogProduct({diameter:mm}):null;
  reinforcement[key]={...bar,...(mm===undefined?{}:{diameter:(product?.diameterMm??mm)/1000,area:product?product.areaMm2/1e6:Math.PI*(mm/1000)**2/4}),...(spacing===undefined?{}:{spacing:spacing/1000})};
 }
 let limits;try{limits=readFootprintLimits(footing);}catch{return unresolved('FOOTPRINT_LIMIT_INPUT_REQUIRED');}
 const caps=Object.fromEntries(['B','L'].map(axis=>[axis,Math.min(100,footing[axis]*1.5,limits?.[axis]??Infinity)]));
 const nodes=new Map((model.nodes||[]).map(n=>[n.id,n])),peers=new Map(),budget={remaining:100000};
 for(const f of model.designDetails?.foundations||[])if(!peers.has(f.id)||peers.get(f.id).footing.version<f.version)peers.set(f.id,{footing:f,node:nodes.get(f.nodeId)});
 const selected=f=>f.footprintClearance!==undefined||f.footprintClearanceReference!==undefined;
 let adjusted=false,clearanceUnverified=false;
 for(let iteration=0;iteration<3;iteration++){
  const anchorage=evaluateFootingBarAnchorage(model,candidate);lastAnchorage=anchorage;
  if(anchorage.status!=='NG')return {status:adjusted?'ADJUSTED':'UNCHANGED',edit,anchorageStatus:anchorage.status,codeReferences:anchorage.codeReferences||[],iterations:iteration+1,clearanceUnverified,requiresFullReevaluation:true};
  let changed=false;
  // All row deficits were evaluated against the same geometry.
  const evaluatedSpans={B:candidate.B,L:candidate.L};
  for(const row of anchorage.checks||[]){if(row.status!=='NG'||!['B','L'].includes(row.axis)||![row.required,row.available].every(Number.isFinite))continue;
   const target=Math.ceil((evaluatedSpans[row.axis]+2*(row.required-row.available)-1e-10)/.05)/20;
   if(target>caps[row.axis]+1e-10)return unresolved('FINAL_ANCHORAGE_FOOTPRINT_LIMIT');
   if(target>candidate[row.axis]+1e-10){candidate[row.axis]=target;edit[row.axis]=target;changed=true;}
  }
  if(!changed)return unresolved('FINAL_ANCHORAGE_GEOMETRY_REQUIRED');
  const current={footing:candidate,node:nodes.get(candidate.nodeId)};let clearanceFailed=false;
  const record=r=>{clearanceFailed ||= r.status==='NG';clearanceUnverified ||= r.incomplete===true||r.status==='NOT_CHECKED';};
  if(selected(candidate))record(evaluateFootingPlanClearance({current,peers,comparisonBudget:budget}));
  for(const [id,peer] of peers)if(id!==candidate.id&&selected(peer.footing))record(evaluateFootingPlanClearance({current:peer,peers:new Map([[candidate.id,current]]),comparisonBudget:budget}));
  if(clearanceFailed)return unresolved('FINAL_ANCHORAGE_CLEARANCE_LIMIT');
  const fy=resolveMaterialRecord(model,reinforcement.materialId)?.strength?.steel?.Fy;
  for(const face of ['bottom','top'])for(const axis of ['B','L']){
   const key=face+axis,bar=reinforcement[key];if(!bar)continue;
   const values=[bar.spacing*1000];for(let mm=Math.min(500,Math.floor((bar.spacing*1000-1e-7)/25)*25);mm>=25;mm-=25)values.push(mm);
   let found=false;
   for(const mm of values){const trial={...candidate,reinforcement:{...reinforcement,[key]:{...bar,spacing:mm/1000}}},layout=footingBarLayout(trial,face,axis);
    if(layout.status!=='OK'||layout.minimumSpacing-bar.diameter<minimumFlexuralBarClearSpacing(bar.diameter,footing.aggregateMaxSize||0)-1e-10)continue;
    const minimum=footingMinimumSteel({width:trial[axis==='B'?'L':'B'],thickness:trial.thickness,fy,area:layout.area,spacing:layout.maximumSpacing});if(minimum.status!=='OK')continue;
    if(mm!==bar.spacing*1000)edit[`${face}Spacing${axis}`]=mm;reinforcement[key]={...bar,spacing:mm/1000};found=true;break;
   }
   if(!found)return unresolved('FINAL_ANCHORAGE_MINIMUM_STEEL_REQUIRED');
  }
  adjusted=true;
 }
 return unresolved('FINAL_ANCHORAGE_ITERATION_LIMIT');
}
