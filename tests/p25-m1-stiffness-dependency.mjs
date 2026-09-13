import {executeAnalysisCase} from '../src/compute/product/analysisCaseEngine.js';
import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {createWorkflowInputIdentity} from '../src/core/workflowIdentity.js';
import {designInputImpact} from '../src/core/designDependencyIdentity.js';
const identity=model=>createWorkflowInputIdentity({model});
const before=createModel();before.designDetails={version:'p24-practical-input-v1',reinforcement:[{id:'R',version:1,bars:[{area:1}]}]};
const after=structuredClone(before);after.designDetails.reinforcement[0].bars[0].area=2;
assert.equal(designInputImpact(before,after,identity(before),identity(after)).decision,'REUSE_PROOF_REQUIRED');
for(const mode of ['cracked','long-term','unknown']){
 const a=structuredClone(before),b=structuredClone(after);a.analysisSettings.rcStiffnessMode=mode;b.analysisSettings.rcStiffnessMode=mode;
 assert.equal(designInputImpact(a,b,identity(a),identity(b)).decision,'REANALYSIS_REQUIRED');
 assert.throws(()=>executeAnalysisCase(a,{kind:'static'},{}),/RC_STIFFNESS_MODE_UNSUPPORTED/);
}
console.log('PASS reinforcement reuse only under known gross stiffness; unchanged coupled/unknown modes bind bar changes');
