import assert from 'node:assert/strict';
import {shearSpacingProposal} from '../src/compute/product/shearSpacingProposal.js';
const command={id:'R',version:1,memberId:'M',stirrupSpacing:400,tieFirstStart:.18,tieFirstEnd:.18};
const shear={id:'S',entityId:'M',checkId:'rc-shear-y',status:'OK',spacingRepairRegions:[{detailId:'R',detailVersion:1,maxSpacing:225,feasibleSpacingMask:511,needsRepair:false}]};
const tie={id:'C',entityId:'M',checkId:'rc-confinement',status:'NG',tieSpacingRequirements:[{detailId:'R',detailVersion:1,maxSpacing:160,needsRepair:true}]};
const proposal=shearSpacingProposal([command],[shear,tie]);
assert.equal(proposal.ok,true,JSON.stringify(proposal));
assert.deepEqual(proposal.regionConstraints,[{detailId:'R',spacings:[150],tieFirstStarts:[.075],tieFirstEnds:[.075]}]);
assert.ok(proposal.basisCheckIds.includes('C'));
const alreadyClose=shearSpacingProposal([{...command,tieFirstStart:.03,tieFirstEnd:.02}],[shear,tie]);
assert.equal(alreadyClose.regionConstraints[0].tieFirstStarts,undefined);
assert.equal(alreadyClose.regionConstraints[0].tieFirstEnds,undefined);
assert.equal(shearSpacingProposal([command],[shear,{...tie,tieSpacingRequirementsTruncated:true}]).ok,false);
console.log('PASS confinement limits and end offset repairs share the shear candidate');

const offsetOnly=shearSpacingProposal([{...command,stirrupSpacing:150}],[{...tie,tieSpacingRequirements:[{...tie.tieSpacingRequirements[0],maxSpacing:300}]}]);
assert.equal(offsetOnly.ok,true);assert.equal(offsetOnly.regionConstraints[0].spacings[0],150);assert.equal(offsetOnly.regionConstraints[0].tieFirstStarts[0],.075);
const incomplete=shearSpacingProposal([command],[shear,{...tie,incomplete:true}]);assert.equal(incomplete.ok,true);assert.equal(incomplete.automaticApplicationAllowed,false);
