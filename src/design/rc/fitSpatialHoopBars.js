import {resizeSpatialHoopCoordinates} from './resizeSpatialHoopCoordinates.js';
import {parseBarLayerGroups} from '../../metadata/barLayerGroups.js';
import {outerHoopClosure} from './outerHoopClosure.js';
import {roundedHoopPerimeterLayout} from './roundedHoopPerimeterLayout.js';
import {closureHookContactCoverage} from './closureHookContactCoverage.js';
import {spatialHoopSupportCoverage} from './spatialHoopSupportCoverage.js';
import {lineBarContactCoverage} from './lineBarContactCoverage.js';
import {spatialHoopPerimeterLayout} from './spatialHoopPerimeterLayout.js';
// Proposal generator only. Approximate projected distances guide a bounded
// Newton search; the shared conservative contact kernel must certify the result.
// All coordinates and diameters in this numerical module are metres.
function projectedDistance(arc,p){
 const f=t=>Math.hypot(arc.center[1]+arc.radius*(arc.u[1]*Math.cos(t)+arc.v[1]*Math.sin(t))-p[0],arc.center[2]+arc.radius*(arc.u[2]*Math.cos(t)+arc.v[2]*Math.sin(t))-p[1]);
 const step=arc.sweep/32;let best=0;
 for(let i=1;i<=32;i++)if(f(i*step)<f(best*step))best=i;
 let lo=Math.max(0,best-1)*step,hi=Math.min(32,best+1)*step;
 const ratio=(Math.sqrt(5)-1)/2;let a=hi-ratio*(hi-lo),b=lo+ratio*(hi-lo),fa=f(a),fb=f(b);
 for(let i=0;i<60;i++){if(fa<fb){hi=b;b=a;fb=fa;a=hi-ratio*(hi-lo);fa=f(a);}else{lo=a;a=b;fa=fb;b=lo+ratio*(hi-lo);fb=f(b);}}
 return Math.min(f(0),f(arc.sweep),fa,fb);
}
function solve(arcs,bar,db,fixedY){
 const origin=[bar.y,bar.z],required=(bar.diameter+db)/2;
 const residual=p=>arcs.map(a=>projectedDistance(a,p)-required),norm=v=>Math.hypot(...v);
 let p=[fixedY??origin[0],origin[1]];
 for(let iteration=0;iteration<40;iteration++){
  const r=residual(p);if(norm(r)<1e-11)return p;
  const h=1e-7,dy=fixedY===undefined?residual([p[0]+h,p[1]]).map((v,i)=>(v-r[i])/h):r.map(()=>0),dz=residual([p[0],p[1]+h]).map((v,i)=>(v-r[i])/h);
  // Damping also permits coincident closure arcs without a singular inverse.
  let a=1e-10,b=0,c=1e-10,u=0,v=0;
  for(let i=0;i<r.length;i++){a+=dy[i]**2;b+=dy[i]*dz[i];c+=dz[i]**2;u+=dy[i]*r[i];v+=dz[i]*r[i];}
  const det=a*c-b*b;if(!Number.isFinite(det)||det<=0)return null;
  const delta=[(-c*u+b*v)/det,(b*u-a*v)/det];let accepted=false;
  for(let k=0;k<16;k++){
   const q=p.map((x,i)=>x+delta[i]*2**-k);
   if(Math.hypot(q[0]-origin[0],q[1]-origin[1])>2*arcs[0].radius)continue;
   if(norm(residual(q))<norm(r)){p=q;accepted=true;break;}
  }
  if(!accepted)return null;
 }
 return null;
}
function transversePreparation(detail,closure){
 const reach=Math.max(...closure.path.bounds.min.map(Math.abs),...closure.path.bounds.max.map(Math.abs))+1;
 const prepared={stirrupDistribution:{status:'OK',explicitEnds:true,count:1,first:0,last:0,spacing:1},outerHoop:{closureGeometry:closure},bars:detail.bars.map(b=>({cutLength:2*reach,points:[[-reach,b.y],[reach,b.y]],segmentErrors:[0]}))};
 closure.contactCoverage=closureHookContactCoverage(detail,prepared);
 closure.supportCoverage=spatialHoopSupportCoverage(detail,prepared);
 return prepared;
}
export function fitSpatialHoopBars(detail,section,{source,transfer}={}){
 const base={fabricationApproved:false,methodReviewRequired:true,scope:'constant longitudinal corner coordinates fitted to spatial hoop bends; full candidate re-evaluation required'};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 if(transfer!==undefined&&transfer!=='section-resize')return nc('SPATIAL_FIT_SOURCE_MAPPING_REQUIRED');
 if(transfer==='section-resize'&&(!source?.detail||!source?.section))return nc('SPATIAL_FIT_SOURCE_MAPPING_REQUIRED');
 const {B,H}=section||{},db=detail?.stirrups?.diameter;
 let declared;try{declared=parseBarLayerGroups(detail?.barLayerGroups,detail?.bars);}catch{return nc('SPATIAL_FIT_LAYER_GROUPS_REQUIRED');}
 const layerRows=(declared||[]).filter(g=>g.face!=='side'),rowY=new Map();
 const nominal=roundedHoopPerimeterLayout({B,H,cover:detail?.cover,tieDiameter:db,insideRadius:detail?.tieBendInsideRadius,bars:detail?.bars});
 let cornerBarIndices=nominal.status==='OK'&&nominal.cornerBarIndices.length===4?nominal.cornerBarIndices:null;
 if(!cornerBarIndices||transfer==='section-resize'){
  const prior=source?.detail||detail,priorSection=source?.section||section;
  // Only transfer support IDs when positions and ordering still match the
  // source, or the exact declared section-resize coordinate mapping.
  let expected=prior?.bars;
  if(transfer==='section-resize'){
   if(['cover','tieBendInsideRadius','tieHookTail','tieClosure','tieClosureCorner','tieClosureSeparation'].some(k=>detail[k]!==prior[k])||detail.stirrups?.diameter!==prior.stirrups?.diameter)return nc('SPATIAL_FIT_SOURCE_MAPPING_REQUIRED');
   try{expected=resizeSpatialHoopCoordinates(prior,priorSection,section);}catch{return nc('SPATIAL_FIT_SOURCE_MAPPING_REQUIRED');}
  }else if(transfer!==undefined)return nc('SPATIAL_FIT_SOURCE_MAPPING_REQUIRED');
  if(!Array.isArray(detail?.bars)||detail.bars.length>100||!Array.isArray(expected)||detail.bars.length!==expected.length||detail.bars.some((b,i)=>b.y!==expected[i].y||b.z!==expected[i].z||transfer==='section-resize'&&b.diameter!==expected[i].diameter))return nc('SPATIAL_FIT_SOURCE_MAPPING_REQUIRED');
  const priorClosure=outerHoopClosure(prior,priorSection||{});
  if(priorClosure.path?.status!=='OK')return nc('SPATIAL_FIT_SOURCE_GEOMETRY_REQUIRED');
  const prepared=transversePreparation(prior,priorClosure),lines=priorClosure.path.primitives.filter(p=>p.kind==='line').slice(1,-1);
  priorClosure.faceContactCoverage=lineBarContactCoverage(prior,prepared,{lines,diameter:prior.stirrups.diameter});
  const layout=spatialHoopPerimeterLayout(prior,prepared);
  if(layout.status!=='OK')return nc('SPATIAL_FIT_SOURCE_SUPPORT_REQUIRED');
  cornerBarIndices=layout.cornerBarIndices;
 }
 const closure=outerHoopClosure(detail,{B,H});
 if(closure.path?.status!=='OK')return nc('SPATIAL_FIT_CLOSURE_PATH_REQUIRED');
 const arcs=closure.path.primitives.filter(p=>p.kind==='arc');if(arcs.length!==5)return nc('SPATIAL_FIT_BEND_ASSIGNMENT_REQUIRED');
 const groups=[[arcs[0],arcs[4]],[arcs[1]],[arcs[2]],[arcs[3]]],used=new Set(),bars=detail.bars.map(b=>({...b})),moves=[];
 for(const group of groups){
  const center=group[0].center,indices=cornerBarIndices.filter(i=>Math.sign(bars[i-1].y)===Math.sign(center[1])&&Math.sign(bars[i-1].z)===Math.sign(center[2]));
  if(indices.length!==1||used.has(indices[0]))return nc('SPATIAL_FIT_BEND_ASSIGNMENT_REQUIRED');
  const i=indices[0]-1,row=layerRows.find(g=>g.indices.includes(i+1)),p=solve(group,bars[i],db,row?rowY.get(row.name):undefined);if(!p)return nc(row?'SPATIAL_FIT_LAYER_CONTACT_INCOMPATIBLE':'SPATIAL_FIT_DID_NOT_CONVERGE');
  used.add(i+1);bars[i].y=p[0];bars[i].z=p[1];
  if(row){rowY.set(row.name,p[0]);for(const index of row.indices)bars[index-1].y=p[0];}

 }
 // Infinite-length proxy is used only for transverse support certification.
 // Real axial ends, splices, cover and all collisions remain in normal review.
 transversePreparation({...detail,bars},closure);
 const support=closure.supportCoverage;
 if(support.status!=='OK')return nc('SPATIAL_FIT_CONTACT_NOT_CERTIFIED');
 for(const [i,b] of bars.entries())if(b.y!==detail.bars[i].y||b.z!==detail.bars[i].z)moves.push({barIndex:i+1,from:[detail.bars[i].y,detail.bars[i].z],to:[b.y,b.z]});
 if(declared){try{parseBarLayerGroups(detail.barLayerGroups,bars);}catch{return nc('SPATIAL_FIT_LAYER_GEOMETRY_INVALID');}}
 return {...base,status:'OK',bars,moves,support,layerRowsPreserved:!!declared};
}
