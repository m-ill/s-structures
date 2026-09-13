import {memberSpliceLengthProposal} from './memberSpliceLengthProposal.js';
import {memberEndDevelopmentProposal} from './memberEndDevelopmentProposal.js';
import {memberCageProposal} from './memberCageProposal.js';
import {sectionSizeProposal} from './sectionSizeProposal.js';
import {shearSpacingProposal} from './shearSpacingProposal.js';
import {longitudinalBarProposal} from './longitudinalBarProposal.js';
function reinforcementProposal(commands,checks,model){
 const shear=shearSpacingProposal(commands,checks),longitudinal=longitudinalBarProposal(commands,checks,model);
 if(!longitudinal.ok){const section=sectionSizeProposal(commands,checks,model);if(!section.ok)return {...shear,longitudinalProposalUnavailable:longitudinal.reason,sectionProposalUnavailable:section.reason};return {...section,...(shear.ok?{regionConstraints:shear.regionConstraints}:{}),basisCheckIds:[...new Set([...section.basisCheckIds,...(shear.basisCheckIds||[])])],components:[section,shear],longitudinalProposalUnavailable:longitudinal.reason};}
 if(!shear.ok)return {...longitudinal,spacingProposalUnavailable:shear.reason};
 const regions=new Map();for(const proposal of [shear,longitudinal])for(const row of proposal.regionConstraints)regions.set(row.detailId,{...regions.get(row.detailId),...row});
 return {ok:true,version:'p25-member-reinforcement-proposal-v2-catalog',productChoices:longitudinal.productChoices||[],regionConstraints:[...regions.values()],basisCheckIds:[...new Set([...shear.basisCheckIds,...longitudinal.basisCheckIds])],basis:'combined recorded shear/confinement spacing and longitudinal count search; full candidate reevaluation required',components:[shear,longitudinal],requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}

function memberProposal(commands,checks,model){
 const proposal=reinforcementProposal(commands,checks,model);
 if(!proposal.ok||proposal.sectionCandidates)return proposal;
 const section=sectionSizeProposal(commands,checks,model);
 if(!section.ok)return {...proposal,sectionProposalUnavailable:section.reason};
 return {...proposal,version:'p25-member-reinforcement-proposal-v8-section-limit-priority',sectionChangeRequired:section.sectionChangeRequired,sectionCandidates:section.sectionChangeRequired?section.sectionCandidates:[null,...section.sectionCandidates],sectionSearchOrder:section.sectionChangeRequired?'enlarged-section reinforcement sweeps; recorded gross-concrete stability or shear upper-bound NG requires a section change':'existing-section reinforcement sweep first, then enlarged-section reinforcement sweeps within the same candidate budget',components:[...(proposal.components||[proposal]),section],basisCheckIds:[...new Set([...proposal.basisCheckIds,...section.basisCheckIds])],requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}

function combinedMemberProposal(commands,checks,model){
 const proposal=memberProposal(commands,checks,model),cage=memberCageProposal(commands,checks,model);
 if(!cage.ok)return {...proposal,cageProposalUnavailable:cage.reason};
 if(!proposal.ok)return {...cage,reinforcementProposalUnavailable:proposal.reason};
 const regions=new Map();
 for(const part of [cage,proposal])for(const row of part.regionConstraints||[])regions.set(row.detailId,{...regions.get(row.detailId),...row});
 return {...proposal,version:'p25-member-reinforcement-proposal-v4-cage',regionConstraints:[...regions.values()],basisCheckIds:[...new Set([...proposal.basisCheckIds,...cage.basisCheckIds])],components:[...(proposal.components||[proposal]),cage]};
}

function developedMemberProposal(commands,checks,model){
 const proposal=combinedMemberProposal(commands,checks,model),development=memberEndDevelopmentProposal(commands,checks);
 if(!development.ok)return {...proposal,endDevelopmentUnavailable:development.reason};
 if(!proposal.ok)return {...development,memberProposalUnavailable:proposal.reason};
 const regions=new Map();for(const part of [proposal,development])for(const row of part.regionConstraints||[])regions.set(row.detailId,{...regions.get(row.detailId),...row});
 return {...proposal,version:'p25-member-reinforcement-proposal-v5-end-development',regionConstraints:[...regions.values()],components:[...(proposal.components||[proposal]),development],basisCheckIds:[...new Set([...proposal.basisCheckIds,...development.basisCheckIds])]};
}

export function memberReinforcementProposal(commands,checks,model){
 const proposal=developedMemberProposal(commands,checks,model),splice=memberSpliceLengthProposal(model,commands,checks);
 if(!splice.ok)return {...proposal,spliceLengthUnavailable:splice.reason};
 if(!proposal.ok)return {...splice,memberProposalUnavailable:proposal.reason};
 return {...proposal,version:'p25-member-reinforcement-proposal-v6-splice-length',spliceRepairs:splice.spliceRepairs,components:[...(proposal.components||[proposal]),splice],basisCheckIds:[...new Set([...proposal.basisCheckIds,...splice.basisCheckIds])]};
}
