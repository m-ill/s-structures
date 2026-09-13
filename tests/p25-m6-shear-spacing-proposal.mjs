import assert from 'node:assert/strict';
import {kdsMemberShear} from '../src/design/rc/kdsShear.js';
import {shearSpacingProposal} from '../src/compute/product/shearSpacingProposal.js';
const input={fck:30,fy:400,bw:300,h:500,d:450,Ag:150000,Av:157,s:400,N:0,V:120};
const result=kdsMemberShear(input);
assert.equal(result.status,'NG');
assert.ok(result.spacingRepair.maxSpacing>0);
assert.equal(kdsMemberShear({...input,s:result.spacingRepair.maxSpacing}).status,'OK');
const checks=[{...result,id:'check',entityId:'M',checkId:'rc-shear-y',detailId:'R',detailVersion:1}];
const commands=[{id:'R',version:1,memberId:'M',stirrupSpacing:400}];
const proposal=shearSpacingProposal(commands,checks);
assert.equal(proposal.ok,true);assert.equal(proposal.regionConstraints[0].detailId,'R');
assert.equal(kdsMemberShear({...input,s:proposal.regionConstraints[0].spacings[0]}).status,'OK');
assert.equal(proposal.automaticApplicationAllowed,false);
assert.equal(shearSpacingProposal(commands,[{...checks[0],torsionReinforcement:{}}]).ok,false);
assert.equal(shearSpacingProposal(commands,[{...checks[0],detailVersion:2}]).ok,false);
assert.equal(kdsMemberShear({...input,V:10000}).spacingRepair.reason,'SECTION_SHEAR_CAPACITY_EXCEEDED');
assert.equal(kdsMemberShear({...input,Av:0}).spacingRepair.reason,'TRANSVERSE_AREA_REQUIRED');
assert.equal(shearSpacingProposal(commands,[{...checks[0],status:'OK'}]).ok,false);
for(const Av of [30,157,600])for(const V of [50,120,250]){
 const row=kdsMemberShear({...input,Av,V});
 if(row.spacingRepair?.maxSpacing)assert.equal(kdsMemberShear({...input,Av,V,s:row.spacingRepair.maxSpacing*.999}).status,'OK');
}
console.log('PASS recorded shear bounds, rounded candidate, capacity and torsion exclusions');

const combined=shearSpacingProposal([...commands,{...commands[0],id:'R2'}],[...checks,{...checks[0],id:'z',checkId:'rc-shear-z',spacingRepair:{maxSpacing:70}},{...checks[0],id:'r2',detailId:'R2',spacingRepair:{maxSpacing:95}}]);
assert.deepEqual(combined.regionConstraints,[{detailId:'R',spacings:[50]},{detailId:'R2',spacings:[75]}]);
