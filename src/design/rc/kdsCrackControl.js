import {toRcSectionDemand,RC_FRAME_CONVENTION_VERSION} from '../../core/rcFrameConvention.js';
import {createSpliceLayoutResolver} from './spliceStationLayout.js';
import {mergeLocatedCheck} from '../evaluation/locationCoverage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {reinforcementRegionsAt} from './reinforcementRegions.js';
import {evaluateCrackWidthStation} from './providedCrackWidth.js';
// mm and MPa. Source HTML retains exact MathType data-script for both equations.
export function kdsCrackSpacing({spacing,cover,fy,environment}){
 const base={codeReferences:getKcscRuleSources(['142020']).map(r=>({...r,clause:'4.2.3(4); Eq.4.2-3; Eq.4.2-4'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![spacing,cover,fy].every(x=>Number.isFinite(x)&&x>0)||fy>600||!['dry','other'].includes(environment))return {...base,status:'NOT_CHECKED',ratio:null,reason:'CRACK_SPACING_INPUT_REQUIRED'};
 const fs=2*fy/3,kappa=environment==='dry'?280:210,first=375*kappa/fs-2.5*cover,second=300*kappa/fs,capacity=Math.min(first,second),ratio=capacity>0?spacing/capacity:null;
 return {...base,status:capacity>0&&spacing<=capacity+1e-9?'OK':'NG',ratio,demand:spacing,capacity,fs,kappa,cover,first,second,environment,stressBasis:'KDS-permitted-two-thirds-fy-approximation',units:{spacing:'mm',cover:'mm',fs:'MPa'}};
}
export function evaluateProvidedCrackControl(model,member,details,tuples,layoutResolver,sourceSets){
 if(!details.some(d=>['KDS-142020-2022','KDS-142030-2021-appendix'].includes(d.crackControlStandard)))return {};
 const nc=reason=>({'rc-serviceability':{status:'NOT_CHECKED',ratio:null,reason}}),section=resolveSectionRecord(model,member.secId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 if(!['RECT','SQUARE'].includes(section?.shape)||!nodes.every(Boolean))return nc('RECTANGULAR_CRACK_CONTROL_SCOPE_REQUIRED');
 const B=section.params.B,H=section.params.H||B,L=Math.hypot(nodes[0].x-nodes[1].x,nodes[0].y-nodes[1].y,nodes[0].z-nodes[1].z);
 const resolveLayout=layoutResolver||createSpliceLayoutResolver(model,member,details);
 const rows=[];
 for(const t of tuples){const selected=reinforcementRegionsAt(details,t.x/L,t.side),layout=selected.length===1?resolveLayout(selected[0],t.x,t.side):null,d=layout?.detail||selected[0];
  if(layout&&layout.status!=='OK'){rows.push({...layout,concurrentDemand:t});continue;}
  const missing=reason=>rows.push({...nc(reason)['rc-serviceability'],concurrentDemand:t});
  if(selected.length===1&&d.crackControlStandard==='KDS-142030-2021-appendix'){
   rows.push({...evaluateCrackWidthStation(model,member,d,t,{B,H},sourceSets),...(layout?.changed?{spliceLayoutEvaluated:true,pieceMarks:layout.pieceMarks}:{})});continue;
  }
  if(H>900){missing('SIDE_FACE_REINFORCEMENT_REQUIRED');continue;}
  if(selected.length!==1||d.crackControlStandard!=='KDS-142020-2022'||d.memberRole!=='flexural-member'||d.reinforcementForm!=='single-deformed'||d.crackSpecialRequirements!=='ordinary-no-special-water-or-appearance'||d.temperatureReinforcementRequired!==false){missing('ORDINARY_FLEXURAL_CRACK_REQUIREMENTS_REQUIRED');continue;}
  if(Math.abs(t.N)>1e-8||Math.abs(t.My)>1e-8){missing('UNIAXIAL_FLEXURAL_CRACK_CONTROL_REQUIRED');continue;}
  const fy=resolveMaterialRecord(model,d.barMaterialId)?.strength?.steel?.Fy;
  let sectionDemand;try{sectionDemand=toRcSectionDemand(t);}catch(error){missing(error.code);continue;}
  for(const sign of sectionDemand.Mz===0?[-1,1]:[Math.sign(sectionDemand.Mz)]){
   const face=d.bars.filter(b=>b.y*sign>0);if(!face.length){missing('TENSION_FACE_REINFORCEMENT_REQUIRED');continue;}
   const extreme=Math.max(...face.map(b=>b.y*sign)),bars=face.filter(b=>Math.abs(b.y*sign-extreme)<1e-9).sort((a,b)=>a.z-b.z);
   const spacing=bars.length===1?B:Math.max(...bars.slice(1).map((b,i)=>(b.z-bars[i].z)*1000));
   const cover=Math.max(...bars.map(b=>Math.min(H/2-Math.abs(b.y)*1000,B/2-Math.abs(b.z)*1000)-b.diameter*500));
   rows.push({...kdsCrackSpacing({spacing,cover,fy,environment:d.crackEnvironment}),...(layout?.changed?{spliceLayoutEvaluated:true,pieceMarks:layout.pieceMarks}:{}),detailId:d.id,detailVersion:d.version,station:t.station,side:t.side,comboId:t.comboId,concurrentDemand:t,sectionDemand:{N:sectionDemand.N,My:sectionDemand.My,Mz:sectionDemand.Mz},frameConventionVersion:RC_FRAME_CONVENTION_VERSION,tensionFace:sign>0?'positive-y':'negative-y'});
  }
 }
 const worst=rows.reduce(mergeLocatedCheck,null);
 return worst?{'rc-serviceability':{...worst,scope:worst.scope||'ordinary-uniaxial-flexural-spacing; no special crack width or thermal reinforcement requirement',checks:rows}}:nc('CRACK_CONTROL_DEMAND_REQUIRED');
}
