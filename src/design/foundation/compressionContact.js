// Rigid footing on compression-only linear springs: q=max(0,a+b*x+c*y).
// Exact polygon moments; normalized coordinates avoid metre/mm conditioning.
import {clipPolygon,polygonMoments} from '../../core/polygonMoments.js';
export {clipPolygon,polygonMoments} from '../../core/polygonMoments.js';
export function pressureIntegral(contact,axis,sign,cut) {
 const [a,b,c]=contact.pressurePlane;
 const polygon=clipPolygon(contact.polygon,-cut,axis==='B'?sign:0,axis==='L'?sign:0),m=polygonMoments(polygon);
 const force=a*m.A+b*m.X+c*m.Y;
 const first=axis==='B'?a*m.X+b*m.XX+c*m.XY:a*m.Y+b*m.XY+c*m.YY;
 return {force:Math.max(0,force),moment:Math.max(0,sign*first-cut*force)};
}
function solve(matrix,rhs) {
 const a=matrix.map((r,i)=>[...r,rhs[i]]);
 for(let k=0;k<3;k++){let p=k;for(let i=k+1;i<3;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;if(Math.abs(a[p][k])<1e-14)return null;[a[p],a[k]]=[a[k],a[p]];const v=a[k][k];for(let j=k;j<4;j++)a[k][j]/=v;for(let i=0;i<3;i++)if(i!==k){const f=a[i][k];for(let j=k;j<4;j++)a[i][j]-=f*a[k][j];}}
 return a.map(r=>r[3]);
}
export function compressionContact(B,L,N,ex,ey) {
 const target=[1,2*ex/B,2*ey/L],box=[[-1,-1],[1,-1],[1,1],[-1,1]];
 const evaluate=p=>{const polygon=clipPolygon(box,...p),m=polygonMoments(polygon),J=[[m.A,m.X,m.Y],[m.X,m.XX,m.XY],[m.Y,m.XY,m.YY]],r=J.map((row,i)=>row.reduce((s,x,k)=>s+x*p[k],0)-target[i]);return {polygon,m,J,r,norm:Math.hypot(...r)};};
 let p=[0.25,0.75*target[1],0.75*target[2]],state=evaluate(p),iteration=0;
 for(;iteration<80&&state.norm>1e-11;iteration++) {
  const step=solve(state.J,state.r.map(x=>-x));if(!step)break;
  let accepted=false;
  for(let scale=1;scale>=1/4096;scale/=2){const next=p.map((x,i)=>x+scale*step[i]),candidate=evaluate(next);if(candidate.norm<state.norm){p=next;state=candidate;accepted=true;break;}}
  if(!accepted)break;
 }
 if(state.norm>1e-9)return {ok:false,contact:'partial-biaxial',reason:'CONTACT_EQUILIBRIUM_NOT_CONVERGED',residual:state.norm,iterations:iteration};
 const factor=4*N/(B*L),plane=[p[0]*factor,p[1]*factor*2/B,p[2]*factor*2/L];
 const polygon=state.polygon.map(([u,v])=>[u*B/2,v*L/2]);
 return {ok:true,contact:'partial-biaxial',ex,ey,qmin:0,qmax:Math.max(...polygon.map(([x,y])=>plane[0]+plane[1]*x+plane[2]*y)),area:state.m.A*B*L/4,pressurePlane:plane,polygon,residual:state.norm,iterations:iteration};
}
