import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
function rectangle(context){
 const f=context?.footing,n=context?.node,x=f?.columnOffsetX??0,y=f?.columnOffsetY??0;
 if(![f?.B,f?.L,n?.x,n?.y,x,y].every(Number.isFinite)||f.B<=0||f.L<=0)return null;
 const cx=n.x-x,cy=n.y-y;if(![cx,cy].every(Number.isFinite))return null;
 return {x:cx,y:cy,B:f.B,L:f.L};
}
export function evaluateFootingPlanClearance({current,peers,comparisonBudget={remaining:100000}}){
 const f=current.footing,required=f.footprintClearance,base={qualification:'explicit-project-plan-constraint',siteFitVerified:false,methodReviewRequired:true,designTransferAllowed:false,codeReferences:getKcscRuleSources(['142070']).map(r=>({...r,clause:'4.2.1'})),scope:'axis-aligned global X/B and Y/L rectangular projections of registered footings; minimum plan clearance applies regardless of elevation; not a 3D collision, cadastral or excavation check'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,incomplete:true,reason});
 if(!Number.isFinite(required)||required<0||typeof f.footprintClearanceReference!=='string'||!f.footprintClearanceReference.trim())return {...nc('FOOTPRINT_CLEARANCE_INPUT_REQUIRED'),blockerKind:'input-required',requiredInputFields:['footprintClearance','footprintClearanceReference'],inputTargets:[{type:'foundation-record',id:f.id,version:f.version}]};
 const own=rectangle(current);if(!own)return nc('FOOTPRINT_PLAN_GEOMETRY_REQUIRED');
 if(!Number.isSafeInteger(comparisonBudget.remaining)||comparisonBudget.remaining<0)return nc('FOOTPRINT_COMPARISON_BUDGET_INVALID');
 let compared=0,missing=0,violations=0,minimumClearance=null,governing=null;const pairs=[];
 for(const [id,peer] of peers){
  if(id===f.id)continue;if(comparisonBudget.remaining===0)break;comparisonBudget.remaining--;compared++;
  const other=rectangle(peer),entry={peerId:id,peerVersion:peer.footing?.version??null};
  if(!other){missing++;if(pairs.length<50)pairs.push({...entry,status:'NOT_CHECKED',reason:'FOOTPRINT_PLAN_GEOMETRY_REQUIRED'});continue;}
  const gapX=Math.abs(own.x-other.x)-(own.B+other.B)/2,gapY=Math.abs(own.y-other.y)-(own.L+other.L)/2;
  if(![gapX,gapY].every(Number.isFinite)){missing++;if(pairs.length<50)pairs.push({...entry,status:'NOT_CHECKED',reason:'FOOTPRINT_PLAN_NUMERIC_RANGE_UNSUPPORTED'});continue;}
  const clearance=Math.hypot(Math.max(0,gapX),Math.max(0,gapY)),overlap=gapX<0&&gapY<0;
  if(!Number.isFinite(clearance)){missing++;if(pairs.length<50)pairs.push({...entry,status:'NOT_CHECKED',reason:'FOOTPRINT_PLAN_NUMERIC_RANGE_UNSUPPORTED'});continue;}
  const failed=overlap||clearance<required,ratio=!overlap&&clearance>0&&Number.isFinite(required/clearance)?required/clearance:!failed?0:null;
  const row={...entry,status:failed?'NG':'OK',clearance,required,overlap,gapX,gapY,ratio};
  if(failed)violations++;
  minimumClearance=minimumClearance===null?clearance:Math.min(minimumClearance,clearance);
  if(!governing||row.overlap&&!governing.overlap||row.status==='NG'&&governing.status!=='NG'||row.overlap===governing.overlap&&row.clearance<governing.clearance)governing=row;
  if(pairs.length<50)pairs.push(row);
 }
 const expected=Math.max(0,peers.size-(peers.has(f.id)?1:0)),notComparedCount=expected-compared,incomplete=missing>0||notComparedCount>0;
 return {...base,status:violations?'NG':incomplete?'NOT_CHECKED':'OK',ratio:governing?.ratio??null,incomplete,reason:violations?'FOOTPRINT_PLAN_CLEARANCE_VIOLATION':incomplete?'FOOTPRINT_PLAN_COVERAGE_INCOMPLETE':null,pairs,governing,minimumClearance,required,comparedCount:compared,violationCount:violations,missingGeometryCount:missing,notComparedCount,detailsTruncated:compared>pairs.length,reference:f.footprintClearanceReference,units:{clearance:'m'}};
}
