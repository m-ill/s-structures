import assert from 'node:assert/strict';
import {kdsMemberShear} from '../src/design/rc/kdsShear.js';
import {shearSpacingProposal} from '../src/compute/product/shearSpacingProposal.js';
const base={fck:30,fy:400,bw:300,h:500,d:450,Ag:150000,Av:157,s:400,N:0,V:70};
const result=kdsMemberShear(base);
assert.equal(result.status,'NG');
assert.ok(Number.isInteger(result.spacingRepair.feasibleSpacingMask));
const command={id:'R',version:1,memberId:'M',stirrupSpacing:400};
const row={...result,id:'Y',entityId:'M',checkId:'rc-shear-y',detailId:'R',detailVersion:1};
const proposal=shearSpacingProposal([command],[row]);assert.equal(proposal.ok,true);
const chosen=proposal.regionConstraints[0].spacings[0];assert.equal(chosen,225);
assert.ok(chosen>result.spacingRepair.maxSpacing,'avoid unconditional dense reinforcement');
for(const Av of [30,157,220,600])for(const V of [10,70,120,250,10000]){
 const input={...base,Av,V},r=kdsMemberShear(input);
 for(let i=0;i<20;i++)assert.equal(!!(r.spacingRepair.feasibleSpacingMask&(1<<i)),kdsMemberShear({...input,s:(i+1)*25}).status==='OK',JSON.stringify({Av,V,s:(i+1)*25}));
}
// A middle spacing can be invalid even when a larger spacing is valid:
// increased Vs invokes the tighter spacing limit.
const discontinuous={...base,Av:220};
assert.equal(kdsMemberShear({...discontinuous,s:225}).status,'OK');
assert.equal(kdsMemberShear({...discontinuous,s:150}).status,'NG');
const mask=kdsMemberShear(discontinuous).spacingRepair.feasibleSpacingMask;
const combined=shearSpacingProposal([command],[{...row,spacingRepairRegions:[{detailId:'R',detailVersion:1,needsRepair:true,maxSpacing:112.5,feasibleSpacingMask:mask}]},{...row,id:'Z',checkId:'rc-shear-z',spacingRepairRegions:[{detailId:'R',detailVersion:1,needsRepair:false,maxSpacing:150,feasibleSpacingMask:63}]}]);
assert.equal(combined.regionConstraints[0].spacings[0],100,'intersect feasible values, never just minimum of maxima');
console.log('PASS largest feasible grid spacing and discontinuous multi-axis intersection');
