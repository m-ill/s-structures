import {parseBarLayerGroups} from '../../metadata/barLayerGroups.js';
import {createSpliceLayoutResolver} from './spliceStationLayout.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';

// Single deformed bars, metres. Aggregate clearance is the restriction
// explicitly referred to by 14 20 50 §4.2.2, not a compaction exception.
export const minimumFlexuralBarClearSpacing=(diameter,aggregate=0)=>Math.max(.025,diameter,4*aggregate/3);
export function kdsBarSpacing({B,H,bars,role,aggregate,barLayerGroups}) {
 const base={codeReferences:getKcscRuleSources(['142050','142001']).map(x=>({...x,clause:x.id==='142001'?'3.1.1(2)':'4.2.2(1),(2),(3),(4)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(![B,H,aggregate].every(x=>Number.isFinite(x)&&x>0)||!['flexural-member','compression-member'].includes(role)||!Array.isArray(bars)||bars.length<2||bars.some(b=>![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0))return nc('ROLE_AGGREGATE_AND_BAR_GEOMETRY_REQUIRED');
 let declared;try{declared=parseBarLayerGroups(barLayerGroups,bars);}catch{return nc('EXPLICIT_BAR_LAYER_GEOMETRY_REQUIRED');}
 const sideIndices=new Set((declared||[]).filter(g=>g.face==='side').flatMap(g=>g.indices.map(i=>i-1)));
 const checks=[{kind:'aggregate-form-size',provided:Math.min(B,H)/5,required:aggregate}],epsilon=1e-9;
 for(let i=0;i<bars.length;i++)for(let j=0;j<i;j++){
  const a=bars[i],b=bars[j],db=Math.max(a.diameter,b.diameter),clear=Math.hypot(a.y-b.y,a.z-b.z)-(a.diameter+b.diameter)/2;
  const sameRow=Math.abs(a.y-b.y)<epsilon;
  checks.push({kind:'aggregate-clearance',bars:[j,i],provided:clear,required:4*aggregate/3});
  if(role==='compression-member'||sameRow||sideIndices.has(i)||sideIndices.has(j))checks.push({kind:role==='compression-member'?'compression-clearance':'horizontal-clearance',bars:[j,i],provided:clear,required:role==='compression-member'?Math.max(.04,1.5*db):minimumFlexuralBarClearSpacing(db)});
 }
 if(role==='flexural-member')for(const sign of [-1,1]){
  const face=bars.map((b,i)=>({...b,index:i})).filter(b=>Math.sign(b.y)===sign);
  const ys=declared?declared.filter(g=>g.face===(sign<0?'bottom':'top')).sort((a,b)=>a.level-b.level).map(g=>g.y):[...new Set(face.map(b=>b.y))].sort((a,b)=>Math.abs(b)-Math.abs(a));
  for(let k=1;k<ys.length;k++){
   const inner=face.filter(b=>(declared?Math.abs(b.y-ys[k])<1e-9:b.y===ys[k])&&!sideIndices.has(b.index)),outer=face.filter(b=>(declared?Math.abs(b.y-ys[k-1])<1e-9:b.y===ys[k-1])&&!sideIndices.has(b.index));
   for(const a of inner){const aligned=outer.filter(b=>Math.abs(a.z-b.z)<epsilon);
    checks.push({kind:'layer-alignment',bar:a.index,provided:aligned.length?1:0,required:1});
    for(const b of aligned)checks.push({kind:'vertical-clearance',bars:[b.index,a.index],provided:Math.abs(a.y-b.y)-(a.diameter+b.diameter)/2,required:.025});
   }
  }
 }
 for(const c of checks){
  const quantitative=c.kind!=='layer-alignment',value=quantitative&&c.provided>0?c.required/c.provided:null;
  c.ratio=Number.isFinite(value)?value:null;
  c.status=c.provided*(1+1e-10)<c.required?'NG':'OK';
  c.basis=quantitative?'required-clearance / provided-clearance':'categorical layer alignment';
 }
 const numeric=checks.filter(c=>c.kind!=='layer-alignment'&&c.ratio!==null).map(c=>c.ratio);
 const maximumClearanceRatio=numeric.length?Math.max(...numeric):null,failed=checks.some(c=>c.status==='NG');
 const ratio=checks.some(c=>c.status==='NG'&&c.ratio===null)?null:maximumClearanceRatio;
 return {...base,status:failed?'NG':'OK',ratio,maximumClearanceRatio,reason:failed?'BAR_SPACING_OR_LAYER_ALIGNMENT_NOT_SATISFIED':null,checks,aggregate,role,layerMembership:declared?{basis:'explicit-design-input',groups:declared,automaticRoleSelection:false}:{basis:'coordinate-inference'},units:{length:'m'},aggregateBasis:{document:'KDS 14 20 01',clause:'3.1.1(2)④',editionStatus:'PUBLIC_CAPTURE_EDITION_REVIEW_REQUIRED'},scope:'single-bars; no bundles or lap congestion; aggregate rule edition requires source review'};
}

export function evaluateProvidedKdsSpacing(model,member,details,tuples,layoutResolver){
 if(!details.some(d=>d.spacingStandard==='KDS-142050-2022'))return {};
 const section=resolveSectionRecord(model,member.secId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!['RECT','SQUARE'].includes(section?.shape)||!nodes.every(Boolean))return {};
 const L=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z);let worst;
 const resolveLayout=layoutResolver||createSpliceLayoutResolver(model,member,details);
 for(const t of tuples){const found=reinforcementRegionsAt(details,t.x/L,t.side),layout=found.length===1?resolveLayout(found[0],t.x,t.side):null,d=layout?.detail||found[0];
  if(layout&&layout.status!=='OK'){worst=mergeLocatedCheck(worst,{...layout,concurrentDemand:t});continue;}
  const r=found.length===1&&d.spacingStandard==='KDS-142050-2022'&&d.reinforcementForm==='single-deformed'&&(d.lapRequired===false||layout?.changed)?{...kdsBarSpacing({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,bars:d.bars,role:d.memberRole,aggregate:d.aggregateMaxSize,barLayerGroups:d.barLayerGroups}),detailId:d.id,detailVersion:d.version}:{status:'NOT_CHECKED',ratio:null,reason:'UNIQUE_SINGLE_BAR_REGION_WITHOUT_LAP_REQUIRED'};
  worst=mergeLocatedCheck(worst,{...r,...(layout?.changed?{spliceLayoutEvaluated:true,pieceMarks:layout.pieceMarks}:{}),concurrentDemand:t});
 }
 return worst?{'rc-spacing':worst}:{};
}
