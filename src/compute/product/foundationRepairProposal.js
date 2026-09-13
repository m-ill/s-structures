import {coupleFootingAnchorage} from './foundationAnchorageCoupling.js';
import {foundationStrengthThicknessProposal} from './foundationStrengthThicknessProposal.js';
import {foundationFootprintProposal} from './foundationFootprintProposal.js';
import {foundationDistributionProposal} from './foundationDistributionProposal.js';
import {foundationDevelopmentProposal} from './foundationDevelopmentProposal.js';
import {foundationDepthProposal} from './foundationDepthProposal.js';
import {foundationSteelProposal} from './foundationSteelProposal.js';
export function foundationRepairProposal(command,checks,model){
 const development=foundationDevelopmentProposal(command,checks),depth=foundationDepthProposal(command,checks),distribution=foundationDistributionProposal(command,checks,model);
 const geometry=[development,depth,distribution].filter(p=>p.ok),geometryEdit=Object.assign({},...geometry.map(p=>p.edits[0]));
 const thicknesses=geometry.map(p=>p.edits[0].thickness).filter(Number.isFinite);
 if(thicknesses.length)geometryEdit.thickness=Math.max(...thicknesses);
 const footprint=foundationFootprintProposal(command,checks,model);
 const strengthThickness=foundationStrengthThicknessProposal(command,checks,geometryEdit.thickness??command.thickness);
 const variants=(footprint.ok?footprint.edits:[{}]).flatMap(footprintEdit=>[{},...(strengthThickness.ok?strengthThickness.edits:[])].map(thicknessEdit=>{
  const nextGeometry={...geometryEdit,...footprintEdit,...thicknessEdit};
  const resizedDistribution=foundationDistributionProposal(command,checks,model,nextGeometry);
  const coupledFootprint={...footprintEdit,...thicknessEdit,...(resizedDistribution.ok?resizedDistribution.edits[0]:{})};
  return {footprintEdit:coupledFootprint,resizedDistribution,enlarged:thicknessEdit.thickness!==undefined,steel:foundationSteelProposal(command,checks,model,{thickness:geometryEdit.thickness,barDistribution:geometryEdit.barDistribution,...coupledFootprint})};
 }));
 const steelComponents=variants.filter(v=>v.steel.ok).map(v=>v.steel),steel=steelComponents[0]||variants[0].steel;
 const steelVariantFailures=variants.filter(v=>!v.steel.ok).map(v=>({footprint:v.footprintEdit,reason:v.steel.reason,unavailable:v.steel.unavailable||[]}));
 const proposalFailures=Object.entries({development,depth,distribution,steel,footprint}).filter(([,p])=>!p.ok).map(([component,p])=>({component,reason:p.reason,...(p.planClearanceScreening?{planClearanceScreening:p.planClearanceScreening}:{})}));
 const components=[...geometry,...variants.filter(v=>v.resizedDistribution.ok).map(v=>v.resizedDistribution),...steelComponents,...(footprint.ok?[footprint]:[]),...(strengthThickness.ok?[strengthThickness]:[])];
 if(!components.length)return {...development,reason:footprint.reason!=='NO_FOOTPRINT_REPAIR_BASIS'&&footprint.reason!=='FOOTPRINT_SEARCH_DIMENSIONS_REQUIRED'?footprint.reason:development.reason,proposalFailures,designTransferAllowed:false,steelProposalUnavailable:steel.reason,depthProposalUnavailable:depth.reason,footprintProposalUnavailable:footprint.reason};
 const choices=variants.map(v=>({...v,steelEdits:v.steel.ok?(strengthThickness.ok?[...v.steel.edits].reverse():v.steel.edits):[{}]}));
 const candidateProductCount=choices.reduce((sum,v)=>sum+v.steelEdits.filter(e=>Object.keys({...geometryEdit,...v.footprintEdit,...e}).length>0).length,0),edits=[];
 // Cover each feasible footprint before spending the budget on denser steel.
 for(let rank=0;rank<3;rank++)for(const {footprintEdit,steelEdits} of choices)if(steelEdits[rank]&&edits.length<8){const edit={...geometryEdit,...footprintEdit,...steelEdits[rank]};if(Object.keys(edit).length)edits.push(edit);}
 const currentFooting=model?.designDetails?.foundations?.find(f=>f.id===command.id&&f.version===command.version),anchorageCoupling=[];
 if(currentFooting)for(let i=0;i<edits.length;i++){const coupled=coupleFootingAnchorage(model,currentFooting,edits[i]);edits[i]=coupled.edit;anchorageCoupling.push({candidateIndex:i,...Object.fromEntries(Object.entries(coupled).filter(([key])=>key!=='edit'))});}
 return {ok:true,version:'p25-foundation-repair-proposal-v11-resized-distribution',anchorageCoupling,thicknessProposalUnavailable:strengthThickness.ok?null:strengthThickness.reason,proposalFailures,steelVariantFailures,variantOrder:'geometry-first-dense-steel-for-strength-search',edits,candidateProductCount,candidateProductTruncated:candidateProductCount>edits.length,basisCheckIds:[...new Set(components.flatMap(p=>p.basisCheckIds))],components,
  ...(!footprint.ok?{footprintProposalUnavailable:footprint.reason}:{}),...(!development.ok?{developmentProposalUnavailable:development.reason}:{}),...(!depth.ok?{depthProposalUnavailable:depth.reason}:{}),...(!steel.ok?{steelProposalUnavailable:steel.reason}:{}),...(!distribution.ok?{distributionProposalUnavailable:distribution.reason}:{}),
  basis:'combined recorded development, depth, reinforcement and bounded footprint search proposals; full candidate reevaluation required',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
