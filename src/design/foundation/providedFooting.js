import {hasFootprintLimits} from '../../metadata/footprintLimits.js';
import {evaluateFootprintFit} from './footprintFit.js';
import {evaluateGroundSettlement} from './groundSettlement.js';
import {evaluateGroundSliding} from './groundSliding.js';
import {baseFrictionBounds} from './baseFrictionBounds.js';
import {evaluateFootingDepth} from './footingDepth.js';
import {evaluateFootingSpacing} from './footingSpacing.js';
import {footingColumnGeometry} from './footingColumnGeometry.js';
import {footingBarLayout,footingDistribution} from './footingBarLayout.js';
import {evaluateColumnTransfer} from './columnTransfer.js';
import {evaluateGroundReview} from './groundReview.js';
import {resolveFootingLoadLedger,netFootingCut} from './footingLoadLedger.js';
import {evaluateFootingSections} from './footingSectionReview.js';
import {evaluateFootingBarAnchorage} from './footingAnchorage.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {compressionContact,clipPolygon,pressureIntegral} from './compressionContact.js';
import {evaluateFootingPunching} from './kdsPunching.js';
const missing=reason=>({status:'NOT_CHECKED',ratio:null,reason});
export function footingContact({B,L,N,Mx,My}) {
 if(![B,L,N,Mx,My].every(Number.isFinite)||B<=0||L<=0)throw new Error('FOOTING_CONTACT_INPUT_INVALID');
 if(N<=0)return {ok:false,reason:'NO_COMPRESSION_CONTACT',contact:'none'};
 const ex=-My/N,ey=Mx/N,q0=N/(B*L),qmax=q0*(1+6*Math.abs(ex)/B+6*Math.abs(ey)/L),qmin=q0*(1-6*Math.abs(ex)/B-6*Math.abs(ey)/L);
 const polygon=[[-B/2,-L/2],[B/2,-L/2],[B/2,L/2],[-B/2,L/2]];
 if(qmin>=-1e-10)return {ok:true,contact:'full',ex,ey,q0,qmax,qmin:Math.max(0,qmin),area:B*L,polygon,pressurePlane:[q0,12*N*ex/(L*B**3),12*N*ey/(B*L**3)]};
 if(Math.abs(ex)>=B/2||Math.abs(ey)>=L/2)return {ok:false,contact:'none',reason:'RESULTANT_OUTSIDE_FOOTING',ex,ey};
 if(Math.abs(ey)<1e-10){const width=3*(B/2-Math.abs(ex)),max=2*N/(width*L),plane=[max*(width-B/2)/width,Math.sign(ex)*max/width,0];return {ok:true,contact:'partial-x',ex,ey,qmax:max,qmin:0,contactWidth:width,area:width*L,pressurePlane:plane,polygon:clipPolygon(polygon,...plane)};}
 if(Math.abs(ex)<1e-10){const width=3*(L/2-Math.abs(ey)),max=2*N/(width*B),plane=[max*(width-L/2)/width,0,Math.sign(ey)*max/width];return {ok:true,contact:'partial-y',ex,ey,qmax:max,qmin:0,contactWidth:width,area:width*B,pressurePlane:plane,polygon:clipPolygon(polygon,...plane)};}
 return compressionContact(B,L,N,ex,ey);
}
export function evaluateProvidedFooting(model,footing,set,law,{preparedFoundation}={}) {
 const result={...(hasFootprintLimits(footing)?{'foundation-footprint-fit':evaluateFootprintFit(footing)}:{}),'foundation-anchorage':evaluateFootingBarAnchorage(model,footing),'foundation-distribution':footingDistribution(footing),'foundation-depth':evaluateFootingDepth(footing),'foundation-spacing':evaluateFootingSpacing(footing)},reaction=set?.reactions?.[footing.nodeId],combo=model.loadCombinations?.find(x=>x.id===set?.combo?.id);
 const [groundId,version]=String(footing.groundId||'').split('@'),ground=model.designDetails?.ground?.find(x=>x.id===groundId&&x.version===Number(version));
 if(!reaction||!['rx','ry','rz','rmx','rmy'].every(k=>Number.isFinite(reaction[k]))){for(const id of ['foundation-bearing','foundation-ground-review','foundation-sliding','foundation-overturning','foundation-flexure','foundation-one-way-shear','foundation-punching','foundation-settlement','foundation-column-transfer','foundation-reinforcement'])result[id]=missing('CONCURRENT_REACTION_REQUIRED');return result;}
 const geometry=footingColumnGeometry(footing);
 if(!geometry.ok&&(footing.columnWidth!==undefined||footing.columnDepth!==undefined||footing.columnOffsetX||footing.columnOffsetY))return {...result,...Object.fromEntries(['foundation-bearing','foundation-flexure','foundation-one-way-shear','foundation-punching','foundation-anchorage'].map(id=>[id,missing(geometry.reason)]))};
 const ledger=resolveFootingLoadLedger(model,footing,reaction,combo);
 if(!ledger.ok){for(const id of ['foundation-bearing','foundation-sliding','foundation-overturning','foundation-flexure','foundation-one-way-shear','foundation-punching','foundation-settlement','foundation-column-transfer','foundation-reinforcement'])result[id]=missing(ledger.reason);return result;}
 if(combo?.type==='strength')result['foundation-column-transfer']=evaluateColumnTransfer(model,footing,{...reaction,rmx:ledger.columnMx,rmy:ledger.columnMy,rmz:ledger.columnMz},ledger);
 const N=ledger.totalN,contact=footingContact({B:footing.B,L:footing.L,N,Mx:ledger.totalMx,My:ledger.totalMy});
 const trace={reaction:structuredClone(reaction),loadLedger:ledger,contact,detailId:footing.id,detailVersion:footing.version,comboId:set.combo.id};
 const checked=(demand,capacity,extra={})=>({status:capacity>0?(demand<=capacity?'OK':'NG'):demand>0?'NG':'OK',ratio:capacity>0?demand/capacity: demand>0?null:0,demand,capacity,reason:capacity<=0&&demand>0?'ZERO_RESISTANCE':null,qualification:'provided-input-mechanics',...trace,...extra});
 if(!contact.ok){const failure={...missing(contact.reason),...trace,status:contact.contact==='none'?'NG':'NOT_CHECKED',stabilityMode:'compression-contact-equilibrium'};result['foundation-bearing']={...failure};result['foundation-overturning']={...failure};return result;}
 const accounting=ledger.ok,service=combo?.type==='service';
 result['foundation-overturning']={...checked(Math.max(2*Math.abs(contact.ex)/footing.B,2*Math.abs(contact.ey)/footing.L),1),reason:'COMPRESSION_RESULTANT_POSITION_ONLY; CODE_STABILITY_FACTORS_PENDING'};
 if(!ground){
  for(const id of ['foundation-ground-review','foundation-bearing','foundation-sliding','foundation-settlement'])result[id]={...missing('GROUND_REFERENCE_REQUIRED'),...trace};
 }else{
 result['foundation-ground-review']=evaluateGroundReview(footing,ground,set,{loadLedger:ledger,contact});
 const net=ground.bearingBasis==='net',netKnown=!net||Number.isFinite(ground.overburdenPressure);
 result['foundation-bearing']=!accounting?{...missing('REACTION_WEIGHT_ACCOUNTING_REQUIRED'),...trace}:!service?{...missing('SERVICE_REACTION_REQUIRED'),...trace}:!netKnown?{...missing('NET_BEARING_REFERENCE_REQUIRED'),...trace}:checked(Math.max(0,contact.qmax-(net?ground.overburdenPressure:0)),ground.allowableBearing);
 const horizontal=Math.hypot(reaction.rx,reaction.ry);
 result['foundation-sliding']=accounting&&Number.isFinite(ground.friction)?checked(horizontal,ground.friction*N):missing('FRICTION_AND_WEIGHT_ACCOUNTING_REQUIRED');
 if(!Number.isFinite(ledger.totalMz)||Math.abs(ledger.totalMz)>1e-8){
  const translationCheck=result['foundation-sliding'],baseFriction=baseFrictionBounds({contact,normal:N,friction:ground.friction,Hx:reaction.rx,Hy:reaction.ry,torsion:ledger.totalMz});
  const failed=translationCheck.status==='NG'||baseFriction.mechanicsStatus==='NG';
  result['foundation-sliding']={...missing(failed?'FOUNDATION_BASE_FRICTION_NECESSARY_BOUND_EXCEEDED':'FOUNDATION_BASE_TORSION_SLIDING_REQUIRED'),status:failed?'NG':'NOT_CHECKED',incomplete:true,incompleteReasons:['FOUNDATION_BASE_FRICTION_METHOD_REVIEW_REQUIRED'],methodReviewRequired:true,torsionDemand:Number.isFinite(ledger.totalMz)?Math.abs(ledger.totalMz):null,translationCheck,baseFriction,...trace};
 }
 if(ground.slidingMethod!==undefined)result['foundation-sliding']={...evaluateGroundSliding({ground,combo,ledger,reaction,contact}),...trace};
 result['foundation-settlement']={...evaluateGroundSettlement({ground,combo,contact,footing,ledger}),...trace};
 }
 const rb=footing.reinforcement,fc=resolveMaterialRecord(model,footing.materialId)?.strength?.concrete?.fck,fy=rb&&resolveMaterialRecord(model,rb.materialId)?.strength?.steel?.Fy;
 result['foundation-punching']=evaluateFootingPunching(model,footing,footing.punchingMomentMethod==='conservative-perimeter-shear'?set:{...set,reactions:{...set.reactions,[footing.nodeId]:{...reaction,rz:Math.max(ledger.totalN,ledger.columnN)}}},{ledger,contact,preparedPerimeter:preparedFoundation?.punchingPerimeter});
 const useKds=footing.flexureStandard==='KDS-142020-2022'&&footing.concreteWeight==='normal';
 if((!law&&!useKds)||!rb||!fc||!fy||!footing.columnWidth||!footing.columnDepth)return result;
 if(useKds&&(!Number.isFinite(fc)||fc<=0||fc>90||!Number.isFinite(fy)||fy<=0||fy>600)){
  result['foundation-flexure']=missing('KDS_SECTION_MATERIAL_RANGE_UNSUPPORTED');result['foundation-one-way-shear']=missing('KDS_SECTION_MATERIAL_RANGE_UNSUPPORTED');return result;
 }
 if(!accounting||service){result['foundation-flexure']=missing(!accounting?'REACTION_WEIGHT_ACCOUNTING_REQUIRED':'STRENGTH_REACTION_REQUIRED');return result;}
 if(useKds)return {...result,...evaluateFootingSections(model,footing,contact,ledger),'foundation-anchorage':result['foundation-anchorage'],'foundation-column-transfer':result['foundation-column-transfer']??evaluateColumnTransfer(model,footing,{...reaction,rmx:ledger.columnMx,rmy:ledger.columnMy,rmz:ledger.columnMz},ledger)};
 const dB=footing.thickness-footing.cover-rb.bottomB.diameter/2,dL=footing.thickness-footing.cover-rb.bottomB.diameter-rb.bottomL.diameter/2;
 if(Math.min(dB,dL)<=0)return result;
 let worstFlexure=null,worstShear=null;
 for(const [axis,span,width,column,d,bar] of [['B',footing.B,footing.L,footing.columnWidth,dB,rb.bottomB],['L',footing.L,footing.B,footing.columnDepth,dL,rb.bottomL]]) {
  if(column>=span){result['foundation-flexure']=missing('COLUMN_OUTSIDE_FOOTING');return result;}
  const face=column/2,edge=span/2;
  const cuts=[-1,1].map(sign=>netFootingCut(contact,footing,ledger,axis,sign,geometry.axes[axis].cut(sign)));
  if(cuts.some(x=>x.moment< -1e-9)){result['foundation-flexure']=missing('TOP_REINFORCEMENT_REQUIRED_FOR_REVERSE_MOMENT');result['foundation-one-way-shear']=missing('TOP_REINFORCEMENT_REQUIRED_FOR_REVERSE_MOMENT');return result;}
  const moment=Math.max(...cuts.map(x=>x.moment));
  const shear=Math.max(...[-1,1].map(sign=>Math.abs(netFootingCut(contact,footing,ledger,axis,sign,Math.min(edge,geometry.axes[axis].cut(sign)+d)).force)));
  const layout=footingBarLayout(footing,'bottom',axis);if(layout.status!=='OK'){result['foundation-flexure']=missing(layout.reason);return result;}
  const count=layout.count,As=layout.area;
  let flexure,shearCheck;
  {
   const a=As*fy/(law.alpha*fc*width),capacity=law.phiSection*As*fy*1000*(d-a/2);
   flexure=a<d?checked(moment,capacity,{axis,effectiveDepth:d,barCount:count,steelArea:As}):{status:'NG',ratio:null,reason:'COMPRESSION_BLOCK_EXCEEDS_EFFECTIVE_DEPTH',axis};
   shearCheck=checked(shear,law.phiShear*law.vcCoefficient*Math.sqrt(fc)*1000*width*d,{axis,effectiveDepth:d});
  }
  const priority={OK:0,NG:1,NOT_CHECKED:2,FAILED:3};
  const worse=(a,b)=>!b||priority[a.status]>priority[b.status]||priority[a.status]===priority[b.status]&&(a.ratio||0)>(b.ratio||0);
  if(worse(flexure,worstFlexure))worstFlexure=flexure;
  if(worse(shearCheck,worstShear))worstShear=shearCheck;
 }
 result['foundation-flexure']=worstFlexure;result['foundation-one-way-shear']=worstShear;
 result['foundation-anchorage']=missing('COLUMN_REINFORCEMENT_AND_ANCHORAGE_RULE_REQUIRED');
 return result;
}
