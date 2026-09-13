import {createSpliceLayoutResolver} from './spliceStationLayout.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';
export function kdsRectangularCover({B,H,fck,cover,stirrupDiameter=0,bars,exposure,chloride,fireCover,abrasionCover,externalReference}){
 const base={codeReferences:getKcscRuleSources(['142050']).map(x=>({...x,clause:'4.3.1(1); 4.3.6(1),(2),(3)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(![B,H,fck,cover].every(x=>Number.isFinite(x)&&x>0)||!Number.isFinite(stirrupDiameter)||stirrupDiameter<0||!Array.isArray(bars)||!bars.length||!['indoor','earth-weather','cast-against-earth','underwater'].includes(exposure)||!['none','ES1','ES2','ES3','ES4'].includes(chloride)||![fireCover,abrasionCover].every(x=>Number.isFinite(x)&&x>=0))return nc('COVER_EXPOSURE_AND_EXTERNAL_CONDITIONS_REQUIRED');
 if((fireCover>0||abrasionCover>0)&&!externalReference?.trim())return nc('EXTERNAL_COVER_REFERENCE_REQUIRED');
 const special={none:0,ES1:0.06,ES2:0.06,ES3:0.07,ES4:0.08}[chloride];
 const required=db=>{const standard=exposure==='underwater'?0.1:exposure==='cast-against-earth'?0.075:exposure==='indoor'?(fck>=40?0.03:0.04):db<=0.016?0.04:db>=0.019?0.05:null;return standard===null?null:Math.max(standard,special,fireCover,abrasionCover);};
 const checks=[];
 for(const [index,b] of bars.entries()){
  if(![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0)return nc('COVER_BAR_GEOMETRY_REQUIRED');
  const limit=required(b.diameter);if(limit===null)return nc('KDS_BAR_SIZE_CLASS_REQUIRED');
  checks.push({bar:index,provided:Math.min(B/2-Math.abs(b.z),H/2-Math.abs(b.y))-b.diameter/2,required:limit});
 }
 if(stirrupDiameter){const limit=required(stirrupDiameter);if(limit===null)return nc('KDS_BAR_SIZE_CLASS_REQUIRED');checks.push({bar:'ties',provided:cover,required:limit});}
 const ratio=Math.max(...checks.map(x=>x.required/Math.max(1e-12,x.provided)));
 return {...base,status:ratio>1+1e-12?'NG':'OK',ratio,reason:ratio>1+1e-12?'MINIMUM_COVER_NOT_SATISFIED':null,checks,exposure,chloride,externalReference:externalReference||null,units:{length:'m'},scope:'cast-in-place-nonprestressed-beam-column-cover; exposure and fire/abrasion classifications are supplied inputs'};
}
export function evaluateProvidedKdsCover(model,member,details,tuples,layoutResolver){
 const section=resolveSectionRecord(model,member.secId),mat=resolveMaterialRecord(model,member.matId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!['RECT','SQUARE'].includes(section?.shape)||!nodes.every(Boolean)||!details.some(x=>x.coverStandard==='KDS-142050-2022'))return {};
 const L=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z);let worst;
 const resolveLayout=layoutResolver||createSpliceLayoutResolver(model,member,details);
 for(const t of tuples){const found=reinforcementRegionsAt(details,t.x/L,t.side),layout=found.length===1?resolveLayout(found[0],t.x,t.side,'physical-cover-only'):null,d=layout?.detail||found[0];
  if(layout&&layout.status!=='OK'){worst=mergeLocatedCheck(worst,{...layout,concurrentDemand:t});continue;}
  const result=found.length===1&&d.coverStandard==='KDS-142050-2022'?{...kdsRectangularCover({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,fck:mat?.strength?.concrete?.fck,cover:d.cover,stirrupDiameter:d.stirrups?.diameter||0,bars:d.bars,exposure:d.coverExposure,chloride:d.chlorideExposure,fireCover:d.fireCoverRequired,abrasionCover:d.abrasionCoverRequired,externalReference:d.coverExternalReference}),detailId:d.id,detailVersion:d.version}:{status:'NOT_CHECKED',ratio:null,reason:'UNIQUE_COVER_REGION_REQUIRED'};
  worst=mergeLocatedCheck(worst,{...result,...(layout?.changed?{spliceLayoutEvaluated:true,pieceMarks:layout.pieceMarks,layoutPurpose:layout.layoutPurpose,additionalStrengthCredit:false}:{}),concurrentDemand:t});
 }return worst?{'rc-cover':worst}:{};
}
