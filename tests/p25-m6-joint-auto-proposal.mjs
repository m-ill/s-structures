import assert from 'node:assert/strict';
import {jointHoopSpacingProposal} from '../src/compute/product/jointHoopSpacingProposal.js';
import {kdsJointHoopQuantity} from '../src/design/connection/kdsJointHoops.js';
const input={B:.3,H:.3,cover:.04,diameter:.01,spacing:.15,longitudinalDiameter:.02,fck:30,fy:400};
const quantity=kdsJointHoopQuantity(input),command={connectionType:'rc-joint',nodeId:'N',tieSpacing:150};
const row={...quantity,id:'Q',entityId:'joint:N',checkId:'joint-confinement'};
const proposal=jointHoopSpacingProposal(command,[row]);
assert.equal(proposal.ok,true);assert.deepEqual(proposal.basisCheckIds,['Q']);
const spacing=proposal.edits[0].tieSpacing/1000;
assert.equal(kdsJointHoopQuantity({...input,spacing}).status,'OK');
assert.equal(proposal.automaticApplicationAllowed,false);
assert.equal(jointHoopSpacingProposal(command,[{...row,spacing:.1}]).ok,false,'different recorded input');
assert.equal(jointHoopSpacingProposal(command,[{...row,status:'NOT_CHECKED'}]).ok,false);
assert.equal(jointHoopSpacingProposal(command,[{...row,spacingRepairLimit:.001}]).ok,false);
assert.equal(jointHoopSpacingProposal(command,[{...row,spacingRepairLimit:.2}]).ok,false);
const tighter={...row,id:'Q2',spacingRepairLimit:.025};
assert.equal(jointHoopSpacingProposal(command,[row,tighter]).edits[0].tieSpacing,25);
console.log('PASS recorded joint hoop spacing constraints and same-owner reevaluation');

const detail={id:'DETAIL',entityId:'joint:N',checkId:'joint-hoop-detail',checks:[{kind:'start-first-tie',provided:.08,maximum:.075},{kind:'end-first-tie',provided:0,maximum:.075}]};
const ended=jointHoopSpacingProposal({...command,jointFirstStart:.08,jointFirstEnd:0},[row,detail]);
assert.equal(ended.edits[0].jointFirstStart,ended.edits[0].tieSpacing/2000);
assert.equal(ended.edits[0].jointFirstEnd,undefined,'preserve zero offset');
assert.ok(ended.basisCheckIds.includes('DETAIL'));
const offsetOnly=jointHoopSpacingProposal({...command,jointFirstStart:.08},[{...row,spacingRepairLimit:.2},detail]);
assert.deepEqual(offsetOnly.edits,[{jointFirstStart:.075}]);
assert.equal(jointHoopSpacingProposal({...command,jointFirstStart:.09},[row,detail]).edits[0].jointFirstStart,undefined,'do not use mismatched recorded offset');
console.log('PASS recorded end-offset limits compose with spacing or repair independently');

const hookDetail={...detail,id:'HOOK',requiredSeismicTail:.075,checks:[{kind:'135-hook-tail',provided:.03,required:.06},{kind:'inside-bend-radius',provided:.015,required:.025}]};
const hookCommand={...command,jointTieClosure:'seismic-135',jointHookTail:.03,jointBendInsideRadius:.015};
const hook=jointHoopSpacingProposal(hookCommand,[{...row,spacingRepairLimit:.2},hookDetail]);
assert.equal(hook.ok,true);assert.deepEqual(hook.edits,[{jointHookTail:.075,jointBendInsideRadius:.025}]);assert.ok(hook.basisCheckIds.includes('HOOK'));
assert.equal(jointHoopSpacingProposal({...hookCommand,jointHookTail:.08,jointBendInsideRadius:.03},[{...row,spacingRepairLimit:.2},hookDetail]).ok,false,'mismatched inputs are not changed');
console.log('PASS recorded seismic tail and bend-radius repair without changing materials');

const endRows={...detail,checks:[{kind:'start-first-tie',provided:.1,maximum:.075},{kind:'end-first-tie',provided:.1,maximum:.075}]};
const envelope=jointHoopSpacingProposal({...command,tieDiameter:16,jointFirstStart:.1,jointFirstEnd:.1,jointCrossTiePlaneOffsets:['0.02','-0.02','0']},[tighter,endRows]);
assert.deepEqual(envelope.edits[0].jointCrossTiePlaneOffsets,['0.004','-0.004','0']);
assert.equal(jointHoopSpacingProposal({...command,tieDiameter:40,jointFirstStart:.1,jointFirstEnd:.1,jointCrossTiePlaneOffsets:['0.02']},[tighter,endRows]).ok,false);

assert.equal(envelope.crossTiePlaneEnvelope.barRadius,.008);assert.equal(envelope.crossTiePlaneEnvelope.unit,'m');
const {validJointPlaneOffsets}=await import('../src/design/connection/jointPlaneOffsets.js');assert.equal(validJointPlaneOffsets(['0','-0.02']),true);for(const v of [[],['NaN'],['Infinity'],[' '],[.02],Array(21).fill('0')])assert.equal(validJointPlaneOffsets(v),false);
