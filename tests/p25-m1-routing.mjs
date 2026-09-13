import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {evaluateDesign} from '../src/design/evaluation/designEvaluation.js';
const m=createModel();m.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];m.members=[{id:'M',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];m.loadCombinations=[{id:'U',type:'strength',factors:{D:1.4}},{id:'S',type:'service',factors:{D:1}}];
const d={xs:[0,3],N:[-10,-10],Vy:[1,1],Vz:[0,0],My:[0,0],Mz:[5,5],T:[0,0]};const set={ok:true,anyOk:true,combo:{id:'U'},memberResults:{M:d}};
const r=evaluateDesign(m,{ok:true,byCombo:{U:set},envelope:set},{resultSet:set});
assert.equal(r.summary.practicalCheckCount,r.practical.checkCount);
assert.equal(r.summary.designComplete,false);
assert.deepEqual(r.practical.combinationCoverage.missingIds,['S']);
assert.equal(r.summary.ngCount,r.practical.counts.NG+r.steel.summary.ngCount);
console.log('PASS P25-T01 canonical RC summary and explicit missing combinations');

const envelope={...set,combo:{id:'envelope'},memberResults:{M:{...d,Mz:[999,999]}}};
const prepared=evaluateDesign(m,{ok:true,byCombo:{U:set},envelope},{resultSet:envelope,practicalResultSet:null,analysisMethod:'off'});
assert.ok(prepared.practical.demands.every(t=>t.comboId==='U'&&t.Mz===5));
assert.ok(prepared.practical.demands.length>0);
const serviceSet={...set,combo:{id:'S'}};
const subset=evaluateDesign(m,{ok:true,byCombo:{U:set,S:serviceSet},envelope:set},{resultSet:set});
assert.deepEqual(subset.practical.combinationCoverage.missingIds,[]);
assert.deepEqual(subset.practical.combinationCoverage.missingEvaluationIds,['S']);
assert.equal(subset.summary.designComplete,false,'available sources do not prove all combination checks were evaluated');

assert.equal(r.ok,r.summary.designComplete);assert.equal(r.summary.uncheckedCount,r.practical.incompleteCheckCount);assert.equal(r.summary.rcSummaryBasis,'provided-practical-checks');assert.equal(r.designTransferAllowed,false);

const mismatched={...set,memberResults:{M:{...d,ax:{L:2.5}}}};
const unmapped=evaluateDesign(m,{ok:true,byCombo:{U:mismatched},envelope:mismatched},{resultSet:mismatched});
assert.equal(unmapped.practical.demands.length,2);assert.ok(unmapped.practical.demands.every(t=>t.designStationMapped===false));
assert.equal(unmapped.practical.checks.find(c=>c.checkId==='rc-section-strength').reason,'MEMBER_FORCE_STATION_LENGTH_MISMATCH');
console.log('PASS incompatible recovery length remains explicit and raw force tuples are retained as unmapped');

const {designSetSnapshot}=await import('../src/compute/product/candidateAnalysisSnapshot.js');
const profile={version:'native-test',hash:'native-hash',profile:'segments',sectionIdI:'A',sectionIdJ:'B',segments:[{start:0,end:.5,sectionId:'A',section:{B:.3,H:.6}},{start:.5,end:1,sectionId:'B',section:{B:.4,H:.7}}],stationSections:Array.from({length:600},(_,i)=>({x:i,B:.3,H:.6}))};
const sampled=designSetSnapshot({...set,memberResults:{M:{...d,taper:profile}}});
assert.equal(sampled.memberResults.M.sectionProfile.segments.length,2);assert.equal(sampled.memberResults.M.sectionProfile.stationSections,undefined);assert.equal(profile.stationSections.length,600);
const roundtrip=designSetSnapshot(sampled);assert.deepEqual(roundtrip.memberResults.M.sectionProfile,sampled.memberResults.M.sectionProfile);
sampled.memberResults.M.sectionProfile.segments[0].section.B=9;assert.equal(profile.segments[0].section.B,.3);
console.log('PASS compact immutable native section profile survives repeated design snapshots without per-station duplication');

m.members[0].taper={profile:'segments',segments:[{start:0,end:.5,sectionId:'rc3060'},{start:.5,end:1,sectionId:'rc3060'}]};
const native={...set,memberResults:{M:{...d,taper:profile}}};
const nativeReview=evaluateDesign(m,{ok:true,byCombo:{U:native},envelope:native},{resultSet:native});
const nativeCheck=nativeReview.practical.checks.find(c=>c.checkId==='rc-section-strength');
assert.equal(nativeCheck.stationMapping.sectionProfile.hash,'native-hash');assert.equal(nativeCheck.stationMapping.sectionProfile.stationSections,undefined);
console.log('PASS direct native evaluation and design-snapshot evaluation share section profile projection');
