import {clipPolygon,polygonMoments} from './compressionContact.js';
const square=[[-1,-1],[1,-1],[1,1],[-1,1]];
function solve3(matrix,rhs){
 const a=matrix.map((r,i)=>[...r,rhs[i]]),scale=Math.max(...matrix.flat().map(Math.abs));
 for(let k=0;k<3;k++){
  let p=k;for(let i=k+1;i<3;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
  if(!Number.isFinite(a[p][k])||Math.abs(a[p][k])<1e-13*scale)return null;
  [a[p],a[k]]=[a[k],a[p]];const v=a[k][k];for(let j=k;j<4;j++)a[k][j]/=v;
  for(let i=0;i<3;i++)if(i!==k){const t=a[i][k];for(let j=k;j<4;j++)a[i][j]-=t*a[k][j];}
 }
 return a.map(r=>r[3]);
}
// Bounded design-stress traction model, not a concrete constitutive code rule.
// Concrete polygon integrals are exact; bars use point fibres with concrete
// displacement, as in the shared RC section kernel. Coordinates are normalized.
export function solveInterfaceTraction({section,bars,material,demand}){
 const nc=reason=>({status:'NOT_CHECKED',reason,ratio:null});
 const {B,H}=section??{},m=material??{},h=H/2,b=B/2,Ag=B*H;
 if(![B,H,m.Ec,m.Es,m.concreteLimit,m.steelCompressionLimit,m.steelTensionLimit].every(x=>Number.isFinite(x)&&x>0)||!['N','My','Mz'].every(k=>Number.isFinite(demand?.[k])))return nc('INTERFACE_TRACTION_INPUT_REQUIRED');
 if(!Array.isArray(bars)||!bars.length||bars.length>100||bars.some(r=>![r.y,r.z,r.area].every(Number.isFinite)||r.area<=0||Math.abs(r.y)>=h||Math.abs(r.z)>=b))return nc('INTERFACE_TRACTION_BAR_GEOMETRY_REQUIRED');
 const As=bars.reduce((n,r)=>n+r.area,0);if(As>=Ag)return nc('INTERFACE_TRACTION_STEEL_AREA_INVALID');
 const tensionCapacity=As*m.steelTensionLimit*1000,compressionCapacity=((Ag-As)*m.concreteLimit+As*m.steelCompressionLimit)*1000;
 if(demand.N>tensionCapacity*(1+1e-10)||-demand.N>compressionCapacity*(1+1e-10))return {status:'NG',reason:'INTERFACE_AXIAL_STRESS_BOUND_EXCEEDED',ratio:demand.N>0?demand.N/tensionCapacity:-demand.N/compressionCapacity,demand:Math.abs(demand.N),capacity:demand.N>0?tensionCapacity:compressionCapacity,unit:'kN'};
 const target=[demand.N,demand.Mz/h,-demand.My/b],forceScale=Math.max(1,Math.hypot(...target));
 function response(e){
  let elastic=clipPolygon(square,-e[0],-e[1],-e[2]);elastic=clipPolygon(elastic,e[0]+m.concreteLimit/m.Ec,e[1],e[2]);
  const cap=polygonMoments(clipPolygon(square,-e[0]-m.concreteLimit/m.Ec,-e[1],-e[2])),p=polygonMoments(elastic);
  const mm=[[p.A,p.X,p.Y],[p.X,p.XX,p.XY],[p.Y,p.XY,p.YY]],factor=h*b*1000;
  const values=mm.map((row,i)=>factor*(m.Ec*row.reduce((n,x,j)=>n+x*e[j],0)-m.concreteLimit*[cap.A,cap.X,cap.Y][i]));
  const J=mm.map(row=>row.map(x=>x*m.Ec*factor)),out=[];
  for(const bar of bars){
   const v=[1,bar.y/h,bar.z/b],strain=v.reduce((n,x,i)=>n+x*e[i],0),trial=m.Es*strain,stress=Math.max(-m.steelCompressionLimit,Math.min(m.steelTensionLimit,trial));
   const cTrial=m.Ec*strain,cStress=Math.max(-m.concreteLimit,Math.min(0,cTrial));
   const tangent=(trial> -m.steelCompressionLimit&&trial<m.steelTensionLimit?m.Es:0)-(cTrial>=-m.concreteLimit&&cTrial<=0?m.Ec:0);
   const force=bar.area*(stress-cStress)*1000;
   for(let i=0;i<3;i++){values[i]+=force*v[i];for(let j=0;j<3;j++)J[i][j]+=bar.area*tangent*1000*v[i]*v[j];}
   out.push({y:bar.y,z:bar.z,area:bar.area,strain,stress,force:bar.area*stress*1000,displacedConcreteForce:bar.area*cStress*1000});
  }
  const residual=values.map((v,i)=>v-target[i]);return {J,values,bars:out,residual,norm:Math.hypot(...residual)/forceScale};
 }
 let e=[0,0,0],state=response(e),iterations=0;
 for(;iterations<60&&state.norm>1e-9;iterations++){
  const step=solve3(state.J,state.residual.map(x=>-x));if(!step)break;
  let accepted=false;
  for(let scale=1;scale>=1/65536;scale/=2){const next=e.map((x,i)=>x+scale*step[i]),candidate=response(next);if(candidate.norm<state.norm){e=next;state=candidate;accepted=true;break;}}
  if(!accepted)break;
 }
 if(state.norm>1e-8)return {...nc('INTERFACE_TRACTION_EQUILIBRIUM_NOT_CONVERGED'),iterations,residual:state.norm};
 return {status:'OK',strain:e,strainCoordinates:'1, y/(H/2), z/(B/2)',bars:state.bars,recovered:{N:state.values[0],My:-state.values[2]*b,Mz:state.values[1]*h},demand,iterations,residual:state.norm,limits:{...m},model:'compression-only capped concrete and capped elastic steel point fibres',methodReviewRequired:true,designTransferAllowed:false};
}
