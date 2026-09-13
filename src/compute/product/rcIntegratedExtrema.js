import {evaluateRcIntegratedDisplacement} from './rcIntegratedDisplacements.js';
const value=(p,x)=>p.reduceRight((a,b)=>a*x+b,0);
function roots(p){
 const scale=Math.max(...p.map(Math.abs));if(!scale)return [];
 p=p.map(v=>v/scale);while(p.length>1&&Math.abs(p.at(-1))<1e-13)p.pop();
 if(p.length===1)return [];
 if(p.length===2){const x=-p[0]/p[1];return x>=0&&x<=1?[x]:[];}
 const critical=roots(p.slice(1).map((v,i)=>v*(i+1))),bounds=[0,...critical,1].sort((a,b)=>a-b),out=[];
 for(const x of bounds)if(Math.abs(value(p,x))<1e-12)out.push(x);
 for(let i=1;i<bounds.length;i++){
  let a=bounds[i-1],b=bounds[i],fa=value(p,a),fb=value(p,b);if(fa*fb>=0)continue;
  for(let k=0;k<60;k++){const m=(a+b)/2,fm=value(p,m);if(fa*fm<=0){b=m;fb=fm;}else{a=m;fa=fm;}}
  out.push((a+b)/2);
 }
 return [...new Set(out)];
}
function interpolate(values){
 const p=Array(6).fill(0);
 for(let i=0;i<6;i++){
  let basis=[1],den=1;
  for(let j=0;j<6;j++)if(i!==j){const q=Array(basis.length+1).fill(0);basis.forEach((v,k)=>{q[k]-=v*j/5;q[k+1]+=v;});basis=q;den*=(i-j)/5;}
  basis.forEach((v,k)=>p[k]+=values[i]*v/den);
 }
 return p;
}

// On constant-compliance intervals the supported loads give displacement
// polynomials of degree at most five. Locate derivative roots, then evaluate
// the original integral at those points. No sampled-maximum substitution.
export function integratedStageExtrema(stages,{boundary='chord'}={}){
 if(!Array.isArray(stages)||!stages.length||stages.length>3||!['chord','cantilever-start','cantilever-end'].includes(boundary))throw Error('RC_EXTREMA_STAGE_INPUT_INVALID');
 const first=stages[0].response,L=first?.length,bounds=new Set([0,L]);
 for(const {response:r,factor} of stages){
  if(!Number.isFinite(factor)||!r?.memberId||r.memberId!==first.memberId||r.length!==L||r.field?.taper?.profile!=='segments')throw Error('RC_EXTREMA_SOURCE_SCOPE_REQUIRED');
  if(r.field.spanLoads.some(l=>!['point','moment','udl','distributed-linear','initial-strain'].includes(l.type)))throw Error('RC_EXTREMA_LOAD_SCOPE_REQUIRED');
  for(const s of r.field.taper.segments){bounds.add(s.start*L);bounds.add(s.end*L);}
  for(const load of r.field.spanLoads)for(const x of [load.a,load.b])if(Number.isFinite(x)&&x>0&&x<L)bounds.add(x);
 }
 const xs=[...bounds].sort((a,b)=>a-b);if(xs.length>129)throw Error('RC_EXTREMA_INTERVAL_LIMIT');
 const at=x=>stages.reduce((out,s)=>evaluateRcIntegratedDisplacement(s.response,x).map((v,i)=>out[i]+s.factor*v),[0,0,0,0,0,0]);
 const start=at(0),end=at(L),slopes=[0,0,0],intercepts=[start[0],start[1],start[2]];
 for(const [axis,rotation,sign] of [[1,5,1],[2,4,-1]]){
  slopes[axis]=boundary==='chord'?(end[axis]-start[axis])/L:sign*(boundary==='cantilever-start'?start[rotation]:end[rotation]);
  if(boundary==='cantilever-end')intercepts[axis]=end[axis]-slopes[axis]*L;
 }
 const relative=x=>at(x).slice(0,3).map((v,i)=>v-intercepts[i]-slopes[i]*x);
 const best=Array.from({length:3},()=>({value:0,maxAbs:0,x:0}));let residual=0;
 for(let n=1;n<xs.length;n++){
  const a=xs[n-1],h=xs[n]-a,samples=Array.from({length:6},(_,i)=>relative(a+h*i/5));
  for(let axis=0;axis<3;axis++){
   const p=interpolate(samples.map(v=>v[axis]));
   for(const t of [.13,.43,.87]){const exact=relative(a+h*t)[axis],error=Math.abs(value(p,t)-exact);residual=Math.max(residual,error);if(error>1e-10+1e-8*Math.abs(exact))throw Error('RC_EXTREMA_POLYNOMIAL_RESIDUAL');}
   for(const t of [0,1,...roots(p.slice(1).map((v,i)=>v*(i+1)))]){
    const x=a+h*t,v=relative(x)[axis];if(Math.abs(v)>best[axis].maxAbs)best[axis]={value:v,maxAbs:Math.abs(v),x};
   }
  }
 }
 return {memberId:first.memberId,length:L,boundary,u:best[0],v:best[1],w:best[2],units:'m',intervalCount:xs.length-1,polynomialResidual:residual,method:'piecewise-degree-five-integral-extrema',globalExtremaEvaluated:true,designTransferAllowed:false,timeHistoryQualified:false};
}
