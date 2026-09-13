import {materialOf} from '../../core/catalogs.js';
import {taperedForceDisplacement} from '../../solver/memberForceField.js';

export function evaluateRcIntegratedDisplacement(response,x){
 const f=response?.field;
 if(!f||response.length!==f.L||!(f.L>0)||!Number.isFinite(x)||x<0||x>f.L)throw Error('RC_INTEGRATED_POSITION_INVALID');
 const {dl,endForces,spanLoads,L,material,taper,shear}=f;
 if(dl?.length!==12||!dl.every(Number.isFinite)||endForces?.length!==12||!endForces.every(Number.isFinite)||!Array.isArray(spanLoads)||!(material?.E>0&&material?.G>0)||!taper)throw Error('RC_INTEGRATED_FIELD_INVALID');
 const values=taperedForceDisplacement(endForces,spanLoads,L,x,material,taper,shear);
 values[0]+=dl[0];values[1]+=dl[1]+dl[5]*x;values[2]+=dl[2]-dl[4]*x;
 for(let i=3;i<6;i++)values[i]+=dl[i];
 if(!values.every(Number.isFinite))throw Error('RC_INTEGRATED_DISPLACEMENT_INVALID');
 return values;
}

export function combineRcIntegratedDisplacements(stages,positions){
 if(!Array.isArray(positions)||!positions.length||positions.length>64||positions.some((x,i)=>!Number.isFinite(x)||i>0&&x<=positions[i-1]))throw Error('RC_INTEGRATED_POSITIONS_REQUIRED');
 const first=stages[0]?.response;
 if(!stages.length||stages.length>3||stages.some(s=>!Number.isFinite(s.factor)||!first?.memberId||s.response?.memberId!==first.memberId||s.response.length!==first.length))throw Error('RC_INTEGRATED_STAGE_SOURCE_MISMATCH');
 const samples=positions.map(x=>({x,values:stages.reduce((sum,s)=>evaluateRcIntegratedDisplacement(s.response,x).map((v,i)=>sum[i]+s.factor*v),[0,0,0,0,0,0])}));
 return {memberId:first.memberId,length:first.length,basis:'weighted-section-interval-force-integration',components:['u','v','w','rx','ry','rz'],translationUnit:'m',rotationUnit:'rad',samples,globalExtremaEvaluated:false,designTransferAllowed:false};
}

// Keep the force-based recovery law, including coupled compliance and initial
// strains. Samples are not a claim of continuous-field extrema or qualification.
export function prepareRcIntegratedDisplacements(model,set){
 const out=Object.create(null);
 for(const member of model.members||[]){
  const r=set.memberResults?.[member.id],input=r?.forceRecoveryInput;
  if(!r?.taper||!input)continue;
  const {L,endForces,spanLoads}=input,dl=r.dl;
  if(!(L>0)||!dl||dl.length!==12||!Array.from(dl).every(Number.isFinite))throw Error('RC_INTEGRATED_DISPLACEMENT_INPUT_REQUIRED');
  const xs=[...new Set([0,L/2,L,...Array.from(r.xs||[]),...(r.taper.segments||[]).flatMap(s=>[s.start*L,s.end*L])])].sort((a,b)=>a-b);
  if(xs.length>620||xs.some(x=>!Number.isFinite(x)||x<0||x>L))throw Error('RC_INTEGRATED_DISPLACEMENT_STATION_LIMIT');
  const material=materialOf(model,member.matId),shear=r.timoshenko?.enabled===true;
  const {stationSections,...taper}=r.taper;
  const field={L,endForces,spanLoads,dl:Array.from(dl),material:{E:material.E,G:material.G},taper,shear};
  const samples=xs.map(x=>({x,values:evaluateRcIntegratedDisplacement({length:L,field},x)}));
  const endResidual=Math.max(...samples.at(-1).values.map((v,i)=>Math.abs(v-dl[6+i])));
  out[member.id]={memberId:member.id,length:L,basis:'section-interval-force-integration',components:['u','v','w','rx','ry','rz'],translationUnit:'m',rotationUnit:'rad',samples,endResidual,globalExtremaEvaluated:false,designTransferAllowed:false,
   field};
 }
 return out;
}
