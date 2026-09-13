import assert from 'node:assert/strict';
import {finalizeMemberHoopDetail} from '../src/design/rc/finalizeMemberHoopDetail.js';
const ok=()=>({status:'OK'}),result={status:'OK',ratio:.8},detail={crossTieBarPairs:['1:2']};
const prepared={stirrupDistribution:ok(),outerHoop:{closureGeometry:{...ok(),longitudinalAssembly:ok(),selfAssembly:ok(),contactCoverage:ok(),supportCoverage:ok(),perimeterMembership:ok(),perimeterOrderStatus:'OK',crossTieAssembly:ok()}},crossTies:{assembly:ok(),actualPathAssembly:ok(),contactCoverage:ok()}};
const full=finalizeMemberHoopDetail(detail,prepared,result);
assert.equal(full.status,'OK');assert.equal(full.ratio,.8);assert.equal(full.incomplete,false);assert.equal(full.methodReviewRequired,true);assert.equal(full.fabricationApproved,false);
const required=['stirrupDistribution','outerHoop.closureGeometry.longitudinalAssembly','outerHoop.closureGeometry.selfAssembly','outerHoop.closureGeometry.contactCoverage','outerHoop.closureGeometry.supportCoverage','outerHoop.closureGeometry.perimeterMembership','outerHoop.closureGeometry.perimeterOrderStatus','outerHoop.closureGeometry.crossTieAssembly','crossTies.assembly','crossTies.actualPathAssembly','crossTies.contactCoverage'];
for(const path of required){
 const copy=structuredClone(prepared),keys=path.split('.'),key=keys.pop(),parent=keys.reduce((v,k)=>v[k],copy);delete parent[key];
 assert.equal(finalizeMemberHoopDetail(detail,copy,result).status,'NOT_CHECKED',path);
}
const partial=structuredClone(prepared);partial.crossTies.actualPathAssembly={status:'NG',reason:'COLLISION',incomplete:true,incompleteReasons:['LIMIT']};
const failed=finalizeMemberHoopDetail(detail,partial,result);assert.equal(failed.status,'NG');assert.equal(failed.incomplete,true);assert.ok(failed.incompleteReasons.includes('LIMIT'));
const without=structuredClone(prepared);without.outerHoop.closureGeometry.crossTieAssembly={status:'N_A'};delete without.crossTies;
assert.equal(finalizeMemberHoopDetail({},without,result).status,'OK');
assert.equal(finalizeMemberHoopDetail(detail,without,result).status,'NOT_CHECKED');
assert.equal(finalizeMemberHoopDetail({},null,result),result);
assert.equal(finalizeMemberHoopDetail(detail,prepared,{status:'NOT_CHECKED',reason:'UNSUPPORTED_KDS_SCOPE'}).status,'NOT_CHECKED');
assert.deepEqual(result,{status:'OK',ratio:.8});
console.log('PASS complete member hoop predicates, missing evidence, declared ties, NG plus incomplete and method qualification separation');
