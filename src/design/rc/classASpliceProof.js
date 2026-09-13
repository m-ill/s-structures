import {RC_LAP_DESIGN_LIMITS} from '../../metadata/rcLapDesignCapabilities.js';
import {classAStrengthStations} from './classAStrengthStations.js';
import {proportionalBending} from '../../compute/product/proportionalBending.js';
import {classAActualPieceLayouts} from './classAActualPieceLayouts.js';
import {classAMomentEnvelope} from '../../compute/product/classAMomentEnvelope.js';
import {classASpliceFaces} from './classASpliceFaces.js';
import {evaluateKdsSection} from './kdsStrength.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
export function classASpliceProof(model,member,detail,splices,tuples,source){
 const nc=reason=>({status:'NOT_CHECKED',reason});
 // A sufficient proof for prismatic, nodally loaded, proportionally loaded flexural members.
 // No use of demand/capacity ratio as a surrogate for required steel area.
 if(!Array.isArray(tuples)||tuples.length<3||tuples.length>RC_LAP_DESIGN_LIMITS.maxStations)return nc('CLASS_A_ANALYSIS_ENVELOPE_REQUIRED');
 if(detail.start!==0||detail.end!==1||detail.strengthStandard!=='KDS-142020-2022')return nc('CLASS_A_PRISMATIC_NODAL_LOAD_SCOPE_REQUIRED');
 if(tuples.some(t=>!['x','N','My','Mz','T'].every(k=>Number.isFinite(t[k]))||Math.abs(t.T)>1e-9))return nc('CLASS_A_TORSION_FREE_FLEXURE_REQUIRED');
 const axial=tuples[0].N,axialTolerance=1e-9*Math.max(1,Math.abs(axial));
 const constantAxial=tuples.every(t=>Math.abs(t.N-axial)<=axialTolerance);
 if(tuples.some(t=>t.N < -1e-9)||!constantAxial&&!source)return nc('CLASS_A_CONSTANT_TENSION_REQUIRED');
 if(!detail.bars?.length||detail.bars.some(b=>!Number.isFinite(b.area)||b.area<=0))return nc('CLASS_A_SINGLE_TENSION_LAYER_REQUIRED');
 const nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id)),length=Math.hypot(nodes[1].x-nodes[0].x,nodes[1].y-nodes[0].y,nodes[1].z-nodes[0].z);
 if(Math.abs(Math.min(...tuples.map(t=>t.x)))>1e-8||Math.abs(Math.max(...tuples.map(t=>t.x))-length)>1e-8)return nc('CLASS_A_FULL_MEMBER_DEMAND_REQUIRED');
 let envelope;
 if(!constantAxial||source?.forceRecoveryInput?.version==='member-force-recovery-v3-piecewise'||model.loads?.some(l=>l.member===member.id||l.memberId===member.id)){
  if(!source)return nc('CLASS_A_PRISMATIC_NODAL_LOAD_SCOPE_REQUIRED');
  envelope=classAMomentEnvelope(source.forceRecoveryInput,tuples,length,source.loadRecoveryIssues||[]);if(envelope.status!=='OK')return {...nc(envelope.reason),envelope};tuples=envelope.tuples;
 }
 const first=tuples.reduce((a,b)=>a.x<b.x?a:b),last=tuples.reduce((a,b)=>a.x>b.x?a:b),scale=Math.max(1,...tuples.map(t=>Math.hypot(t.My,t.Mz)));
 if(!envelope&&tuples.some(t=>['My','Mz'].some(k=>Math.abs(t[k]-(first[k]+(last[k]-first[k])*t.x/length))>1e-8*scale)))return nc('CLASS_A_LINEAR_MOMENT_ENVELOPE_REQUIRED');
 const axialValues=[];for(const t of tuples)if(!axialValues.some(n=>Math.abs(n-t.N)<=1e-9*Math.max(1,Math.abs(n))))axialValues.push(t.N);
 const bendingEnvelope=proportionalBending(tuples);if(bendingEnvelope.status!=='OK')return bendingEnvelope;
 const section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId),steel=resolveMaterialRecord(model,detail.barMaterialId);
 if(!['RECT','SQUARE'].includes(section?.shape))return nc('CLASS_A_RECTANGULAR_SECTION_REQUIRED');
 const fractionProof=classASpliceFaces(detail,splices,length);if(fractionProof.status!=='OK')return fractionProof;
 const {splicedFraction:fraction,totalArea:total,splicedArea:spliced}=fractionProof;
 if(fraction>.5+1e-12)return {...nc('CLASS_A_SPLICED_AREA_ABOVE_HALF'),fractionProof};
 const pieceEnvelope=classAActualPieceLayouts(detail,splices,length);if(pieceEnvelope.status!=='OK')return pieceEnvelope;
 const strengthStations=classAStrengthStations(tuples);if(strengthStations.status!=='OK')return strengthStations;
 if(pieceEnvelope.layouts.length*strengthStations.selectedCount>RC_LAP_DESIGN_LIMITS.maxStrengthChecks)return nc('CLASS_A_ACTUAL_PIECE_STRENGTH_BUDGET');
 let worst=null;
 for(const [layoutIndex,layout] of pieceEnvelope.layouts.entries()){const half=layout.map(b=>({...b,area:b.area/2,physicalArea:b.area}));for(const t of strengthStations.stations){const result=evaluateKdsSection({B:section.params.B/1000,H:(section.params.H||section.params.B)/1000},half,{fc:concrete?.strength?.concrete?.fck,fy:steel?.strength?.steel?.Fy,Es:steel?.elastic?.E},t);if(result.status!=='OK')return {...nc('CLASS_A_HALF_AREA_STRENGTH_NOT_PROVEN'),failure:{layoutIndex,x:t.x,status:result.status,reason:result.reason,ratio:result.ratio}};if(!worst||result.ratio>worst.ratio)worst={layoutIndex,x:t.x,ratio:result.ratio,codeReferences:result.codeReferences};}}
 return {status:'OK',strengthStationSelection:{inputCount:strengthStations.inputCount,selectedCount:strengthStations.selectedCount,strengthChecks:pieceEnvelope.layouts.length*strengthStations.selectedCount,basis:strengthStations.basis},bendingEnvelope,...(pieceEnvelope.actual?{actualPieceEnvelope:{layoutCount:pieceEnvelope.layouts.length,maximumLayouts:RC_LAP_DESIGN_LIMITS.maxLayouts,coexistenceStationCount:pieceEnvelope.coexistenceStationCount,strengthChecks:pieceEnvelope.layouts.length*strengthStations.selectedCount,extraLapAreaCredited:false,areaFractionBasis:'original bar identity partitions; no extra partner area; partition bounds imply whole-area bound despite coordinate changes',basis:pieceEnvelope.basis}}:{}),axialEnvelope:{kind:envelope?.polynomialSegments.some(p=>p.component==='axial-force')?'variable-pure-tension':axialValues.length>1?'piecewise-constant-tension':'constant-tension',force:axialValues.length===1?axialValues[0]:null,values:axialValues,uniformityTolerance:axialTolerance,units:'kN',scope:'constant tensile axial force within each verified recovery interval and proportional bending; both sides of axial point loads included; variable pure tension uses recovered axial extrema; compression and intra-interval coupled axial/bending variation excluded'},...(envelope?{momentEnvelope:{positions:envelope.positions,verification:envelope.verification,polynomialSegments:envelope.polynomialSegments,normalisedCoordinate:envelope.normalisedCoordinate,basis:envelope.basis,independentSolverComparison:false}}:{}),providedRequiredAreaRatio:2,splicedFraction:fraction,totalArea:total,splicedArea:spliced,windowLength:fractionProof.windowLength,fractionProof,proof:'half-area-strength-sufficient; maximum-provided-lap-length window union upper bound; actual lap lengths must pass',worst,stationCount:tuples.length,units:{area:'m2'},designTransferAllowed:false};
}
