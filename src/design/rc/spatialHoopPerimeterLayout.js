export function spatialHoopPerimeterLayout(detail,prepared){
 const base={metric:'longitudinal-center-polygon',units:{length:'m'},fabricationQuantity:false,methodReviewRequired:true,scope:'station-invariant cyclic bar order proven by actual corner/face contacts; polygon distances are not hoop steel lengths'};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,positions:[],gaps:[],failures:[]});
 const closure=prepared?.outerHoop?.closureGeometry,support=closure?.supportCoverage,faces=closure?.faceContactCoverage,ends=closure?.contactCoverage,bars=detail?.bars;
 if(support?.status!=='OK'||faces?.status!=='OK'||ends?.status!=='OK'||!Array.isArray(bars)||bars.length<4||bars.length>100||bars.some(b=>![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0))return nc('SPATIAL_PERIMETER_CONTACT_REQUIRED');
 const corners=support.supportedBarIndices;
 if(!Array.isArray(corners)||corners.length!==4||new Set(corners).size!==4||corners.some(i=>!Number.isInteger(i)||!bars[i-1])||faces.checks?.length!==4)return nc('SPATIAL_PERIMETER_CORNER_MAPPING_REQUIRED');
 const stable=(rows,id)=>rows?.some(c=>c.bar===id&&c.status==='OK'&&c.recordPositionMatches===true);
 if(ends.checks?.length!==2||support.bodyContact?.checks?.length!==3)return nc('SPATIAL_PERIMETER_CORNER_MAPPING_REQUIRED');
 if(!ends.checks?.every(c=>stable(c.candidates,corners[0]))||!support.bodyContact?.checks?.every((c,i)=>stable(c.candidates,corners[i+1])))return nc('SPATIAL_PERIMETER_STATION_INVARIANCE_REQUIRED');
 const members=Array.from({length:4},()=>[]);
 for(let id=1;id<=bars.length;id++){
  if(corners.includes(id))continue;
  const matches=[];
  for(const [i,face] of faces.checks.entries())for(const c of face.candidates||[])if(c.bar===id&&c.status==='OK')matches.push({face:i,c});
  if(matches.length!==1)return nc('SPATIAL_PERIMETER_FACE_AMBIGUOUS_OR_MISSING');
  const {face,c}=matches[0],range=c.parameterRange;
  if(c.recordPositionMatches!==true||!Array.isArray(range)||range.length!==2||!range.every(Number.isFinite)||range[0]<0||range[1]>1||range[0]>range[1]||range[1]-range[0]>1e-10)return nc('SPATIAL_PERIMETER_STATION_INVARIANCE_REQUIRED');
  members[face].push({id,parameter:range[0]});
 }
 const order=[];
 for(let i=0;i<4;i++){
  members[i].sort((a,b)=>a.parameter-b.parameter);
  if(members[i].some((r,j)=>j&&r.parameter-members[i][j-1].parameter<=1e-10))return nc('SPATIAL_PERIMETER_ORDER_AMBIGUOUS');
  order.push(corners[i],...members[i].map(r=>r.id));
 }
 const gaps=[],positions=[];let perimeter=0;
 for(let i=0;i<order.length;i++){
  const a=bars[order[i]-1],b=bars[order[(i+1)%order.length]-1],length=Math.hypot(b.y-a.y,b.z-a.z);
  if(!Number.isFinite(length)||length<=1e-12)return nc('SPATIAL_PERIMETER_COINCIDENT_BARS');
  positions.push({barIndex:order[i],s:perimeter});gaps.push({from:order[i],to:order[(i+1)%order.length],length});perimeter+=length;
 }
 return {...base,status:'OK',reason:null,cornerCount:4,cornerBarIndices:corners,positions,gaps,perimeter,maximumGap:Math.max(...gaps.map(g=>g.length)),failures:[]};
}
