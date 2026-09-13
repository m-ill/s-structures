import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {columnTransferSpliceProof} from './columnTransferSpliceProof.js';
import {interfaceBarSteelAllocation} from './interfaceBarSteelAllocation.js';
import {interfaceShearTorsionDistribution} from './interfaceShearTorsionDistribution.js';
import {interfaceSteelAllocation} from './interfaceSteelAllocation.js';
import {columnInterfaceShear} from './columnInterfaceShear.js';
import {memberAxes} from '../../core/memberAxes.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {columnTransferDevelopment} from './columnTransferDevelopment.js';
import {evaluateColumnBendingTransfer} from './columnBendingTransfer.js';
import {reinforcementRegionsAt} from '../rc/reinforcementRegions.js';
export function evaluateColumnTransfer(model,f,reaction,ledger){
 const result=evaluateColumnTransferReference(model,f,reaction,ledger),proof=columnTransferSpliceProof(model,f);
 if(proof.status==='N_A')return result;
 if(proof.status==='OK')return {...result,spliceLayoutProof:proof,spliceLayoutEvaluated:true};
 return {...result,status:result.status==='NG'?'NG':'NOT_CHECKED',incomplete:true,incompleteReasons:[...new Set([...(result.incompleteReasons||[]),'COLUMN_SPLICE_DEVELOPMENT_PATH_REQUIRED'])],reason:'COLUMN_SPLICE_DEVELOPMENT_PATH_REQUIRED',referenceLayoutResult:result,spliceLayoutProof:proof,spliceLayoutEvaluated:false,methodReviewRequired:true};
}
function evaluateColumnTransferReference(model,f,reaction,ledger){
 if(Number.isFinite(reaction?.rmz)&&Math.abs(reaction.rmz)>1e-8){
  const normalTransfer=evaluateColumnTransferWithoutTorsion(model,f,{...reaction,rmz:0},ledger,true);

  const transferMapping=normalTransfer.columnDetailId?normalTransfer:normalTransfer.normalTransfer;
  const detail=model.designDetails?.reinforcement?.find(d=>d.id===transferMapping?.columnDetailId&&d.version===transferMapping?.columnDetailVersion);
  const member=model.members?.find(m=>m.id===f.columnMemberId),nodes=member?[member.n1,member.n2].map(id=>model.nodes?.find(n=>n.id===id)):[];
  const axes=nodes.length===2&&nodes.every(Boolean)?memberAxes(nodes[0],nodes[1],member.localAxis):null;
  const torsionDistribution=detail&&axes?interfaceShearTorsionDistribution({bars:detail.bars.map(b=>({x:b.y*axes.y[0]+b.z*axes.z[0],y:b.y*axes.y[1]+b.z*axes.z[1],area:b.area})),Vx:reaction.rx,Vy:reaction.ry,T:reaction.rmz}):{status:'NOT_CHECKED',reason:'COLUMN_BAR_GROUP_MAPPING_REQUIRED',capacityCalculated:false,designTransferAllowed:false};
  const steel=detail?resolveMaterialRecord(model,detail.barMaterialId):null,footingMaterial=resolveMaterialRecord(model,f.materialId),columnMaterial=member?resolveMaterialRecord(model,member.matId):null;
  const section=member?resolveSectionRecord(model,member.secId):null;
  const shearDemand=torsionDistribution.status==='CALCULATED'?torsionDistribution.barForces.reduce((s,b)=>s+b.resultant,0):null;
  const torsionFrictionBasis=Number.isFinite(shearDemand)&&section&&detail?columnInterfaceShear({area:section.params.B*(section.params.H||section.params.B)/1e6,steelArea:detail.bars.reduce((s,b)=>s+b.area,0),fck:Math.min(footingMaterial?.strength?.concrete?.fck,columnMaterial?.strength?.concrete?.fck),fy:steel?.strength?.steel?.Fy,V:shearDemand,surface:f.columnInterfaceSurface,clean:f.columnInterfaceClean,reference:f.columnInterfacePreparationReference}):null;
  const torsionSteelAllocation=interfaceBarSteelAllocation({normal:normalTransfer.normalTransfer,distribution:torsionDistribution,friction:torsionFrictionBasis});
  const candidates=[normalTransfer,torsionSteelAllocation,...(torsionFrictionBasis?[torsionFrictionBasis]:[])].filter(r=>['NG','FAILED'].includes(r.status));
  const governing=candidates.reduce((a,b)=>!a||(b.ratio??-Infinity)>(a.ratio??-Infinity)?b:a,null),failed=!!governing;
  return {...normalTransfer,status:failed?governing.status:'NOT_CHECKED',ratio:failed?governing.ratio:null,
   governingCriterion:governing===torsionSteelAllocation?'local-interface-steel':governing===torsionFrictionBasis?'interface-friction-envelope':normalTransfer.governingCriterion,
   codeReferences:[...new Map([...(normalTransfer.codeReferences||[]),...(torsionFrictionBasis?.codeReferences||[])].map(r=>[r.id+' '+r.clause,r])).values()],

   reason:failed?(governing.reason||'COLUMN_TRANSFER_KNOWN_FAILURE_WITH_UNREVIEWED_TORSION'):'COLUMN_TRANSFER_TORSION_UNSUPPORTED',
   incomplete:true,methodReviewRequired:true,designTransferAllowed:false,
   incompleteReasons:[...new Set([...(normalTransfer.incompleteReasons||[]),'COLUMN_TRANSFER_TORSION_UNSUPPORTED'])],
   unreviewedActions:[{action:'torsion',value:reaction.rmz,unit:'kNm',reason:'COLUMN_TRANSFER_TORSION_UNSUPPORTED'}],
   normalTransfer,torsionDistribution,torsionSteelAllocation,torsionFrictionBasis,scope:'partial interface review with torsion excluded; known failures preserved, combined acceptance unavailable'};
 }
 return evaluateColumnTransferWithoutTorsion(model,f,reaction,ledger);
}
function evaluateColumnTransferWithoutTorsion(model,f,reaction,ledger,forceBarNormal=false){
 const base={codeReferences:getKcscRuleSources(['142010','142020','142052','142070']).map(r=>({...r,clause:({142010:'4.2.3(2)',142020:'4.7',142052:'4.1.3; Eq.4.1-3',142070:'4.2.3.1, 4.2.3.2'})[r.id]})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(f.columnTransferType!=='cast-in-place-continuous-straight-bars'||f.concreteWeight!=='normal')return nc('COLUMN_CONTINUOUS_BAR_TRANSFER_INPUT_REQUIRED');
 if(![f.columnEmbedmentLength,f.columnDevelopmentAbove].every(x=>Number.isFinite(x)&&x>0))return nc('COLUMN_BAR_DEVELOPMENT_BOTH_SIDES_REQUIRED');
 if(!ledger?.ok||!Number.isFinite(ledger.columnN)||!['rx','ry','rmx','rmy','rmz'].every(k=>Number.isFinite(reaction[k])))return nc('COLUMN_TRANSFER_CONCURRENT_ACTIONS_REQUIRED');
 const horizontal=Math.hypot(reaction.rx,reaction.ry);
 const incident=model.members.filter(m=>m.n1===f.nodeId||m.n2===f.nodeId),m=incident[0];
 if(incident.length!==1||m.id!==f.columnMemberId||m.type!=='frame'||requiresOffsetAwareDesign(m))return nc('SINGLE_COLUMN_TRANSFER_MAPPING_REQUIRED');
 const nodes=[m.n1,m.n2].map(id=>model.nodes.find(n=>n.id===id)),s=resolveSectionRecord(model,m.secId);
 if(!nodes.every(Boolean)||Math.abs(nodes[0].x-nodes[1].x)>1e-9||Math.abs(nodes[0].y-nodes[1].y)>1e-9||!['RECT','SQUARE'].includes(s?.shape))return nc('VERTICAL_RECTANGULAR_COLUMN_TRANSFER_REQUIRED');
 const B=s.params.B/1000,H=(s.params.H||s.params.B)/1000,Ag=B*H;
 const axes=memberAxes(nodes[0],nodes[1],m.localAxis);
 if(!axes.y.some(x=>Math.abs(x)>1-1e-9)||!axes.z.some(x=>Math.abs(x)>1-1e-9))return nc('ORTHOGONAL_COLUMN_TRANSFER_REQUIRED');
 const width=Math.abs(axes.y[0])*H+Math.abs(axes.z[0])*B,depth=Math.abs(axes.y[1])*H+Math.abs(axes.z[1])*B;
 if(![f.columnWidth,f.columnDepth].every(Number.isFinite)||Math.abs(width-f.columnWidth)>1e-9||Math.abs(depth-f.columnDepth)>1e-9)return nc('COLUMN_CONTACT_DIMENSION_MISMATCH');
 const latest=new Map();for(const r of model.designDetails?.reinforcement||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const selected=reinforcementRegionsAt([...latest.values()].filter(r=>r.memberId===m.id),m.n1===f.nodeId?0:1),d=selected[0];
 if(selected.length!==1||d.reinforcementForm!=='single-deformed'||d.barCoating!=='uncoated'||d.lapRequired!==false)return nc('CONTINUOUS_UNCOATED_COLUMN_BAR_DETAILS_REQUIRED');
 const fc=resolveMaterialRecord(model,f.materialId)?.strength?.concrete?.fck,columnFc=resolveMaterialRecord(model,m.matId)?.strength?.concrete?.fck,fy=resolveMaterialRecord(model,d.barMaterialId)?.strength?.steel?.Fy;
 if(![fc,columnFc,fy].every(x=>Number.isFinite(x)&&x>0)||Math.max(fc,columnFc)>90||fy>600)return nc('COLUMN_TRANSFER_MATERIAL_RANGE_REQUIRED');
 const As=d.bars.reduce((n,b)=>n+b.area,0),minimumArea=.005*Ag,capacity=.65*.85*Math.min(fc,columnFc)*Ag*1000;
 if(forceBarNormal||Math.hypot(reaction.rmx,reaction.rmy)>1e-8)return evaluateColumnBendingTransfer({model,footing:f,detail:d,member:m,reaction,ledger,axes,section:{B,H},forceTensionDevelopment:forceBarNormal});
 const interfaceShear=horizontal>1e-8?columnInterfaceShear({area:Ag,steelArea:As,fck:Math.min(fc,columnFc),fy,V:horizontal,surface:f.columnInterfaceSurface,clean:f.columnInterfaceClean,reference:f.columnInterfacePreparationReference}):null;
 if(interfaceShear?.status==='NOT_CHECKED')return {...nc(interfaceShear.reason),interfaceShear};
 const steelAllocation=interfaceSteelAllocation({steelArea:As,fy,columnN:ledger.columnN,horizontal,shear:interfaceShear});
 if(steelAllocation.status==='NOT_CHECKED')return {...nc(steelAllocation.reason),steelAllocation,interfaceShear};
 if(ledger.columnN<0&&['y','z'].some(axis=>Math.abs(d.bars.reduce((sum,bar)=>sum+bar[axis]*bar.area,0)/As)>1e-9))return {...nc('COLUMN_AXIAL_STEEL_CENTROID_REQUIRED'),status:steelAllocation.status==='NG'?'NG':'NOT_CHECKED',steelAllocation};
 const tensionAnchorage=ledger.columnN<0||!!interfaceShear;
 const development=columnTransferDevelopment({detail:d,footing:f,B,H,axes,fc,columnFc,fy,tensionAt:tensionAnchorage,tensionMode:ledger.columnN<0?(interfaceShear?'tension-for-interface-axial-and-shear':'tension-for-interface-axial'):'tension-for-interface-shear'});
 if(development.some(row=>[row.above,row.below].some(x=>x.status!=='CALCULATED')))return {...nc('COLUMN_BAR_TRANSFER_DEVELOPMENT_REQUIRED'),status:steelAllocation.status==='NG'||development.some(row=>[row.above,row.below].some(x=>x.status==='NG'))?'NG':'NOT_CHECKED',development,interfaceShear,steelAllocation};
 const length=Math.abs(nodes[1].z-nodes[0].z)*(d.end-d.start),availableBelow=f.thickness-f.cover-Math.max(...d.bars.map(b=>b.diameter))/2;
 const requiredBelow=Math.max(...development.map(r=>r.below.requiredMm))/1000,requiredAbove=Math.max(...development.map(r=>r.above.requiredMm))/1000;
 const ratio=Math.max(Math.max(0,ledger.columnN)/capacity,steelAllocation.ratio,minimumArea/As,requiredBelow/f.columnEmbedmentLength,requiredAbove/f.columnDevelopmentAbove,f.columnEmbedmentLength/availableBelow,f.columnDevelopmentAbove/length,interfaceShear?.ratio??0);
 if(!(availableBelow>0&&As>0)||!Number.isFinite(ratio))return nc('COLUMN_BAR_TRANSFER_GEOMETRY_REQUIRED');
 const criteria=[
  {id:'concrete-bearing',demand:Math.max(0,ledger.columnN),capacity,unit:'kN'},
  ...(tensionAnchorage?[{id:'combined-steel-demand',demand:steelAllocation.totalRequiredArea,capacity:As,unit:'m2'}]:[]),
  {id:'minimum-continuous-bars',demand:minimumArea,capacity:As,unit:'m2'},
  {id:'development-below',demand:requiredBelow,capacity:f.columnEmbedmentLength,unit:'m'},
  {id:'development-above',demand:requiredAbove,capacity:f.columnDevelopmentAbove,unit:'m'},
  {id:'embedment-envelope',demand:f.columnEmbedmentLength,capacity:availableBelow,unit:'m'},
  {id:'column-region-envelope',demand:f.columnDevelopmentAbove,capacity:length,unit:'m'},
  ...(interfaceShear?[{id:'interface-shear',demand:horizontal,capacity:interfaceShear.capacity,unit:'kN'}]:[]),
 ].map(row=>({...row,ratio:row.demand/row.capacity,status:row.demand<=row.capacity*(1+1e-10)?'OK':'NG'}));
 const governing=criteria.reduce((a,b)=>b.ratio>a.ratio?b:a);

 return {...base,...(tensionAnchorage?{codeReferences:[...base.codeReferences,...steelAllocation.codeReferences,...(interfaceShear?.codeReferences??[]),...development.flatMap(r=>[r.above.source,r.below.source])]}:{}),status:ratio<=1+1e-10?'OK':'NG',interfaceShear,steelAllocation,reason:steelAllocation.status==='NG'?steelAllocation.reason:ratio>1&&tensionAnchorage&&Math.max(requiredBelow/f.columnEmbedmentLength,requiredAbove/f.columnDevelopmentAbove)>1?'COLUMN_INTERFACE_TENSION_DEVELOPMENT_INSUFFICIENT':null,ratio,governingCriterion:governing.id,demand:governing.demand,capacity:governing.capacity,unit:governing.unit,criteria,columnAxialDemand:ledger.columnN,columnCompressionDemand:Math.max(0,ledger.columnN),columnTensionDemand:Math.max(0,-ledger.columnN),bearingCapacity:capacity,minimumArea,providedArea:As,requiredBelow,requiredAbove,providedBelow:f.columnEmbedmentLength,providedAbove:f.columnDevelopmentAbove,availableBelow,development,columnMemberId:m.id,columnDetailId:d.id,columnDetailVersion:d.version,momentReference:'column-interface-at-footing-top',columnInterfaceHeightAboveBase:f.thickness,scope:tensionAnchorage?'axial compression/tension and interface shear; additive tension/shear steel; full-yield tension development both sides; no moment/torsion/laps':'pure compression, unreduced bearing, minimum continuous bars and development; no moment/shear/laps',bearingEnhancementApplied:false,excessBearingSteelCredit:false,units:{force:'kN',area:'m2',length:'m'}};
}
