// Nominal support topology only. Hook fabrication and cage collision are
// independent checks; declaring a pair does not approve a fabrication drawing.
export function crossTieSupports({bars,cornerIndices,orderedIndices,pairs,diameter,insideRadius,tail,perimeterPositions,perimeterLength}){
 const nc=reason=>({status:'NOT_CHECKED',reason,checks:[],fabricationApproved:false});
 if(!Array.isArray(pairs)||pairs.length>20||!Array.isArray(bars)||bars.length>100||!Array.isArray(orderedIndices)||orderedIndices.length!==bars.length||new Set(orderedIndices).size!==bars.length)return nc('CROSS_TIE_SUPPORT_INPUT_REQUIRED');
 if(![diameter,insideRadius,tail,perimeterLength].every(v=>Number.isFinite(v)&&v>0)||!Array.isArray(cornerIndices)||cornerIndices.length!==4||new Set(cornerIndices).size!==4||cornerIndices.some(i=>!bars[i])||orderedIndices.some(i=>!Number.isInteger(i)||!bars[i])||bars.some(b=>![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0)||!Array.isArray(perimeterPositions)||perimeterPositions.length!==bars.length||perimeterPositions.some(v=>!Number.isFinite(v)||v<0||v>=perimeterLength))return nc('CROSS_TIE_PERIMETER_GEOMETRY_REQUIRED');
 if(diameter>.0254||diameter>.016&&diameter<.019)return nc('KDS_BAR_SIZE_CLASS_REQUIRED');
 const perimeterOrder=orderedIndices.map(i=>perimeterPositions[i]);
 if(perimeterOrder.some((s,i)=>i>0&&s<=perimeterOrder[i-1]))return nc('CROSS_TIE_PERIMETER_ORDER_INVALID');
 const supported=new Set(cornerIndices),checks=[],segments=[],seen=new Set();
 for(const pair of pairs){
  if(typeof pair!=='string'||!/^\d+:\d+$/.test(pair))return nc('CROSS_TIE_PAIR_FORMAT_REQUIRED');
  const [a,b]=pair.split(':').map(x=>Number(x)-1),key=[a,b].sort((x,y)=>x-y).join(':');
  if(a===b||!bars[a]||!bars[b]||seen.has(key))return nc('CROSS_TIE_PAIR_INDICES_INVALID');seen.add(key);
  const length=Math.hypot(bars[a].y-bars[b].y,bars[a].z-bars[b].z);
  const body=length-(insideRadius-bars[a].diameter/2)-(insideRadius-bars[b].diameter/2);
  checks.push({kind:'cross-tie-hook-and-body',bars:[a,b],status:body>0&&tail>=6*diameter&&insideRadius>=(diameter<=.016?2:3)*diameter&&insideRadius>=Math.max(bars[a].diameter,bars[b].diameter)/2?'OK':'NG',bodyLength:body,requiredInsideRadius:(diameter<=.016?2:3)*diameter,requiredTail:6*diameter,providedTail:tail});
  supported.add(a);supported.add(b);segments.push({bars:[a,b],length,bodyLength:body,hookAngle:135});
 }
 const order=orderedIndices;
 for(let i=0;i<order.length;i++){
  const a=order[i],b=order[(i+1)%order.length];
  if(!supported.has(a)&&!supported.has(b))checks.push({kind:'alternate-bar-support',bars:[a,b],status:'NG'});
 }
 const supportedOrder=order.filter(i=>supported.has(i));
 for(let i=0;i<supportedOrder.length;i++){
  const a=supportedOrder[i],b=supportedOrder[(i+1)%supportedOrder.length],distance=(perimeterPositions[b]-perimeterPositions[a]+perimeterLength)%perimeterLength,clear=distance-(bars[a].diameter+bars[b].diameter)/2;
  checks.push({kind:'supported-bar-clearance',bars:[a,b],provided:clear,maximumExclusive:.15,status:clear<.15-1e-12?'OK':'NG'});
 }
 return {status:checks.some(c=>c.status==='NG')?'NG':'OK',checks,supportedBarIndices:[...supported].map(i=>i+1),segments,fabricationApproved:false,methodReviewRequired:true,scope:'declared paired 135-degree cross-tie support topology; full cage geometry separate'};
}
