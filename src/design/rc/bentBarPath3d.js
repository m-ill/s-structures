const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const vector=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const distance=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const unit=p=>vector(p)&&Math.abs(dot(p,p)-1)<=1e-10;
const position=(p,t)=>p.center.map((x,i)=>x+p.radius*(p.u[i]*Math.cos(t)+p.v[i]*Math.sin(t)));
const tangent=(p,t)=>p.u.map((x,i)=>Math.sign(p.sweep)*(-x*Math.sin(t)+p.v[i]*Math.cos(t)));
// Geometry only, in local (x,y,z) metres. Arc bases must be orthonormal.
// Length and extrema are analytic; samples carry conservative chord errors.
// A valid geometric path is not a KDS or fabrication approval.
export function bentBarPath3d(segments,{maxAngle=Math.PI/24,closed=false}={}){
 const base={units:{length:'m'},fabricationApproved:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,centerlineLength:null,points:[],segmentErrors:[],checks:[]});
 if(typeof closed!=='boolean')return nc('BAR_PATH_CLOSED_FLAG_INVALID');
 if(!Array.isArray(segments)||!segments.length)return nc('BAR_PATH_SEGMENTS_REQUIRED');
 if(segments.length>128)return nc('BAR_PATH_PRIMITIVE_LIMIT');
 if(!Number.isFinite(maxAngle)||maxAngle<=0||maxAngle>Math.PI/2)return nc('BAR_PATH_SAMPLE_ANGLE_INVALID');
 const primitives=[];let count=1,total=0;
 for(const segment of segments){
  if(!segment||typeof segment!=='object')return nc('BAR_PATH_PRIMITIVE_INVALID');
  let p;
  if(segment.kind==='line'){
   if(!vector(segment.start)||!vector(segment.end))return nc('BAR_PATH_LINE_REQUIRED');
   const length=distance(segment.start,segment.end);
   if(!Number.isFinite(length)||length<=1e-12)return nc('BAR_PATH_ZERO_OR_INVALID_LINE');
   const direction=segment.end.map((x,i)=>(x-segment.start[i])/length);
   p={kind:'line',start:[...segment.start],end:[...segment.end],startTangent:direction,endTangent:[...direction],length,steps:1};
  }else if(segment.kind==='arc'){
   const {center,radius,u,v,sweep}=segment;
   if(!vector(center)||!Number.isFinite(radius)||radius<=0||!unit(u)||!unit(v)||Math.abs(dot(u,v))>1e-10||!Number.isFinite(sweep)||Math.abs(sweep)<=1e-12||Math.abs(sweep)>2*Math.PI)return nc('BAR_PATH_ARC_REQUIRED');
   p={kind:'arc',center:[...center],radius,u:[...u],v:[...v],sweep,length:radius*Math.abs(sweep),steps:Math.ceil(Math.abs(sweep)/maxAngle)};
   p.start=position(p,0);p.end=position(p,sweep);p.startTangent=tangent(p,0);p.endTangent=tangent(p,sweep);
   if(!Number.isFinite(p.length)||!vector(p.start)||!vector(p.end))return nc('BAR_PATH_ARC_REQUIRED');
  }else return nc('BAR_PATH_PRIMITIVE_INVALID');
  count+=p.steps;total+=p.length;
  if(!Number.isFinite(total))return nc('BAR_PATH_LENGTH_OVERFLOW');
  if(count>4096)return nc('BAR_PATH_POINT_LIMIT');
  primitives.push(p);
 }
 const checks=[];
 for(let i=1;i<primitives.length+(closed?1:0);i++){
  const a=primitives[i-1],b=primitives[i%primitives.length],gap=distance(a.end,b.start),alignment=dot(a.endTangent,b.startTangent);
  checks.push({join:i,gap,tangentDot:alignment,status:gap<=1e-9&&alignment>=1-1e-10?'OK':'NG',...(gap>1e-9?{reason:'BAR_PATH_DISCONNECTED'}:alignment<1-1e-10?{reason:'BAR_PATH_TANGENT_DISCONTINUITY'}:{})});
 }
 // Do not join disconnected primitives with invented line segments.
 if(checks.some(c=>c.status==='NG'))return {...base,status:'NG',reason:checks.find(c=>c.status==='NG').reason,centerlineLength:null,primitives,checks,points:[],segmentErrors:[]};
 const points=[],segmentErrors=[],primitiveIndices=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 const include=p=>{for(let i=0;i<3;i++){bounds.min[i]=Math.min(bounds.min[i],p[i]);bounds.max[i]=Math.max(bounds.max[i],p[i]);}};
 for(const [index,p] of primitives.entries()){
  include(p.start);include(p.end);
  if(!points.length)points.push([...p.start]);
  if(p.kind==='line'){
   points.push([...p.end]);segmentErrors.push(0);primitiveIndices.push(index);
  }else{
   for(let j=1;j<=p.steps;j++){
    points.push(position(p,p.sweep*j/p.steps));
    // 2 sin짼(a/4) avoids cancellation in 1-cos(a/2) for small arcs.
    segmentErrors.push(2*p.radius*Math.sin(p.sweep/p.steps/4)**2);primitiveIndices.push(index);
   }
   const lo=Math.min(0,p.sweep),hi=Math.max(0,p.sweep);
   for(let axis=0;axis<3;axis++)for(let k=-3;k<=3;k++){
    const t=Math.atan2(p.v[axis],p.u[axis])+k*Math.PI;
    if(t>=lo&&t<=hi)include(position(p,t));
   }
  }
 }
 return {...base,status:'OK',geometryKind:'bent-bar-path-3d-v1',reportSummary:{status:'OK',centerlineLength:total,units:{length:'m'},primitiveCount:primitives.length,joinCount:checks.length,joinStatus:'OK',bounds,fabricationApproved:false},centerlineLength:total,primitives,checks,points,segmentErrors,primitiveIndices,bounds};
}
