import {rcFrameDisplacementPolynomials} from '../../compute/product/rcSegmentDisplacementRecovery.js';
import {normalizedQuadraticRoots} from '../../core/normalizedQuadraticRoots.js';
// Numerical stage composition only. Stage chronology, source identity and
// constitutive applicability must be established by the workflow caller.
export function combineRcMemberServiceResponses(stages){
 if(!Array.isArray(stages)||!stages.length||stages.length>3||stages.some(s=>!Number.isFinite(s?.factor)))throw Error('RC_SERVICE_STAGE_INPUT_INVALID');
 const first=stages[0].response;
 for(const {response:r} of stages){
  if(!r?.memberId||r.memberId!==first?.memberId||r.length!==first.length||!Array.isArray(r.segments)||!r.segments.length||r.segments.length>20)throw Error('RC_SERVICE_STAGE_SOURCE_MISMATCH');
  const prepared=prepareRcMemberServiceResponses(r.segments);
  if(Object.keys(prepared).length!==1||prepared[r.memberId]?.length!==r.length)throw Error('RC_SERVICE_STAGE_SOURCE_MISMATCH');
 }
 const bounds=[...new Set(stages.flatMap(s=>s.response.segments.flatMap(r=>[r.startX,r.endX])))].sort((a,b)=>a-b);
 if(bounds.length>61)throw Error('RC_SERVICE_STAGE_FIELD_LIMIT');
 const segments=[];
 for(let i=1;i<bounds.length;i++){
  const startX=bounds[i-1],endX=bounds[i],mid=(startX+endX)/2;
  const fields=stages.map(({response,factor})=>{
   const row=response.segments.find(r=>r.startX<=mid&&r.endX>=mid);
   if(!row)throw Error('RC_SERVICE_STAGE_SOURCE_MISMATCH');
   return {row,factor,p:rcFrameDisplacementPolynomials(row.localDisplacements,row.endX-row.startX)};
  });
  const localDisplacements=[startX,endX].flatMap(x=>['u','v','w','rx','ry','rz'].map(key=>fields.reduce((sum,{row,factor,p})=>sum+factor*p[key].reduceRight((v,c)=>v*(x-row.startX)/(row.endX-row.startX)+c,0),0)));
  segments.push({memberId:first.memberId,startX,endX,localDisplacements});
 }
 return {...prepareRcMemberServiceResponses(segments)[first.memberId],basis:'explicit-weighted-stage-frame-trial-fields',stageCount:stages.length,stageFactors:stages.map(s=>s.factor),timeHistoryQualified:false};
}
// Recover relative deflection directly from the converged frame trial field.
// This is a numerical response, not a KDS acceptance or an effective-Ie model.
export function prepareRcMemberServiceResponses(segments){
 const groups=new Map(),result=Object.create(null);
 const fail=()=>{throw Error('RC_SERVICE_DISPLACEMENT_CONTINUITY_REQUIRED');};
 for(const s of segments){if(!s.memberId)fail();if(!groups.has(s.memberId))groups.set(s.memberId,[]);groups.get(s.memberId).push(s);}
 for(const [id,unsorted] of groups){
  const rows=[...unsorted].sort((a,b)=>a.startX-b.startX);
  const same=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
  const first=rows[0],last=rows.at(-1),L=last.endX;
  if(!same(first.startX,0)||!Number.isFinite(L)||L<=0)fail();
  const fields=rows.map((s,i)=>{
   const p=rcFrameDisplacementPolynomials(s.localDisplacements,s.endX-s.startX);
   if(i&&(!same(s.startX,rows[i-1].endX)||!s.localDisplacements.slice(0,6).every((v,j)=>same(v,rows[i-1].localDisplacements[j+6]))))fail();
   return {s,p};
  });
  const out={memberId:id,length:L,units:'m',basis:'converged-frame-trial-field-relative-displacement',loadParticularSolutionIncluded:false,designTransferAllowed:false,segments:rows.map(s=>({memberId:id,startX:s.startX,endX:s.endX,localDisplacements:[...s.localDisplacements]}))};
  // Axial trial fields are piecewise linear, so their exact extrema occur at
  // segment ends. Keep signed shortening relative to the first end, not origin.
  const axialStart=first.localDisplacements[0];
  const axialStations=[{x:0,value:0},...rows.map(s=>({x:s.endX,value:s.localDisplacements[6]-axialStart}))];
  if(axialStations.some(s=>!Number.isFinite(s.value)))fail();
  const minimum=axialStations.reduce((a,b)=>b.value<a.value?b:a);
  const maximum=axialStations.reduce((a,b)=>b.value>a.value?b:a);
  out.axialRelative={endChange:axialStations.at(-1).value,minimum,maximum,maximumAbsolute:Math.abs(minimum.value)>=Math.abs(maximum.value)?minimum:maximum,units:'m',signConvention:'positive-extension-negative-shortening',basis:'piecewise-linear-frame-trial-field-relative-to-first-end'};
  for(const boundary of ['chord','cantilever-start','cantilever-end']){
   out[boundary]={};
   for(const [axis,index,rotation,sign] of [['v',1,5,1],['w',2,4,-1]]){
    const a=first.localDisplacements[index],b=last.localDisplacements[index+6];
    const slope=boundary==='chord'?(b-a)/L:sign*(boundary==='cantilever-start'?first.localDisplacements[rotation]:last.localDisplacements[rotation+6]);
    const intercept=boundary==='cantilever-end'?b-slope*L:a;
    let best={maxAbs:0,value:0,x:0};
    for(const {s,p} of fields){
     const q=[...p[axis]],span=s.endX-s.startX;q[0]-=intercept+slope*s.startX;q[1]-=slope*span;
     const positions=[0,1,...normalizedQuadraticRoots(3*q[3],2*q[2],q[1]).filter(t=>Number.isFinite(t)&&t>0&&t<1)];
     for(const t of positions){const value=q.reduceRight((a,b)=>a*t+b,0);if(!Number.isFinite(value))fail();if(Math.abs(value)>best.maxAbs)best={maxAbs:Math.abs(value),value,x:s.startX+span*t};}
    }
    out[boundary][axis]=best;
   }
  }
  result[id]=out;
 }
 return result;
}

// Compare fields before taking extrema. Subtracting maxima loses both location
// and sign, and is invalid when independently refined meshes differ.
export function subtractRcMemberServiceResponses(total,baseline){
 if(!total?.memberId||total.memberId!==baseline?.memberId||total.length!==baseline.length)throw Error('RC_SERVICE_DIFFERENCE_SOURCE_MISMATCH');
 const a=total.segments,b=baseline.segments;
 if(!Array.isArray(a)||!Array.isArray(b)||!a.length||!b.length||a.length>20||b.length>20)throw Error('RC_SERVICE_DIFFERENCE_FIELD_REQUIRED');
 // Revalidate fields, including full coverage and continuity, before interpolation.
 prepareRcMemberServiceResponses(a);prepareRcMemberServiceResponses(b);
 const bounds=[...new Set([...a,...b].flatMap(s=>[s.startX,s.endX]))].sort((x,y)=>x-y);
 if(bounds.length>41)throw Error('RC_SERVICE_DIFFERENCE_FIELD_LIMIT');
 const at=(s,x)=>{
  const L=s.endX-s.startX,t=(x-s.startX)/L,p=rcFrameDisplacementPolynomials(s.localDisplacements,L);
  return ['u','v','w','rx','ry','rz'].map(key=>p[key].reduceRight((a,b)=>a*t+b,0));
 };
 const segments=[];
 for(let i=1;i<bounds.length;i++){
  const startX=bounds[i-1],endX=bounds[i],mid=(startX+endX)/2;
  const x=a.find(s=>s.startX<=mid&&s.endX>=mid),y=b.find(s=>s.startX<=mid&&s.endX>=mid);
  if(!x||!y)throw Error('RC_SERVICE_DIFFERENCE_SOURCE_MISMATCH');
  const localDisplacements=[startX,endX].flatMap(pos=>{const first=at(x,pos),second=at(y,pos);return first.map((v,j)=>v-second[j]);});
  segments.push({memberId:total.memberId,startX,endX,localDisplacements});
 }
 return {...prepareRcMemberServiceResponses(segments)[total.memberId],basis:'total-minus-baseline-frame-trial-field'};
}
