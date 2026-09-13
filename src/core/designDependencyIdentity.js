import {stableHash} from './stableHash.js';
import {workflowModelInput,validIdentity} from './workflowIdentity.js';
import {PRACTICAL_INPUT_VERSION} from '../modeling/practicalInputContract.js';
import {rcReinforcementDependency} from './rcStiffnessContract.js';

// Current elastic solver consumes gross sections; the new standalone provided
// reinforcement registry is consumed only by design. Every other input remains
// bound, including unknown fields and all resolved library/settings hashes.
export const DESIGN_DEPENDENCY_VERSION='p25-moment-bound-dependencies-v4-reuse-artifacts';
export function createDesignDependencyIdentity(model,identity) {
  if(!validIdentity(identity)||stableHash(workflowModelInput(model))!==identity.modelHash)throw new Error('DEPENDENCY_INPUT_MISMATCH');
  const input=workflowModelInput(model),details=input.designDetails;
  if(details&&details.version!==PRACTICAL_INPUT_VERSION)throw new Error('DEPENDENCY_CONTRACT_UNSUPPORTED');
  const stiffness=rcReinforcementDependency(model);
  if(details) {
    if(stiffness.reinforcementIndependent){delete details.reinforcement;delete details.splices;}
    if(Object.keys(details).every(key=>key==='version'))delete input.designDetails;
  }
  if(input.meta)delete input.meta.p19InputRevision;
  const {inputHash,modelHash,...bound}=identity;
  const analysisHash=stableHash({version:DESIGN_DEPENDENCY_VERSION,input,bound});
  const detailHash=stableHash(model.designDetails||null);
  return {version:DESIGN_DEPENDENCY_VERSION,analysisHash,detailHash,stiffness,
    designHash:stableHash({analysisHash,detailHash,designBasisHash:identity.designBasisHash,rulePackHash:identity.rulePackHash}),
    sourceInputHash:inputHash,sourceModelHash:modelHash};
}

export function designInputImpact(before,after,identityBefore,identityAfter) {
  const source=createDesignDependencyIdentity(before,identityBefore),target=createDesignDependencyIdentity(after,identityAfter);
  const unchanged=identityBefore.inputHash===identityAfter.inputHash;
  return {version:DESIGN_DEPENDENCY_VERSION,source,target,
    decision:unchanged?'UNCHANGED':source.analysisHash===target.analysisHash?'REUSE_PROOF_REQUIRED':'REANALYSIS_REQUIRED',
    requiredStages:unchanged?[]:source.analysisHash===target.analysisHash?['reuse-analysis','design','detailing','artifacts']:['analysis','design','detailing','artifacts']};
}
