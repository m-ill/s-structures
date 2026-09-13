import assert from 'node:assert/strict';
import {candidateEngineeringSeverity,candidateScore} from '../src/compute/product/candidateScore.js';
const summary={counts:{NG:1,FAILED:0,NOT_CHECKED:0},incompleteCheckCount:0};
const candidate=(ratio,cost)=>({summary,affectedScope:{complete:false,summary},engineeringSeverity:candidateEngineeringSeverity([{entityId:'A',checkId:'strength',status:'NG',ratio}],['A']),objective:{value:cost,secondary:0,concreteVolume:0,quantityComplete:true}});
const compare=(a,b)=>{const x=candidateScore(a),y=candidateScore(b);for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]-y[i];return 0;};
assert.ok(compare(candidate(1.05,2),candidate(1.8,1))<0,'actual NG improvement outranks less steel');
assert.ok(compare(candidate(null,1),candidate(1.2,2))>0,'unquantified failure must not count as zero severity');
const severity=candidateEngineeringSeverity([{entityId:'A',checkId:'s',status:'NG',ratio:1.5},{entityId:'A',checkId:'rc-code-compliance',status:'NG',ratio:5},{entityId:'B',checkId:'s',status:'NG',ratio:3}],['A']);
assert.equal(severity.affected.maximumNgRatio,1.5);assert.equal(severity.project.maximumNgRatio,3);assert.equal(severity.affected.sumNgExcess,.5);
const pass=candidate(.8,3);pass.affectedScope={complete:true,summary};assert.ok(compare(pass,candidate(1.01,1))<0);
assert.ok(compare(candidate(1.2,1),candidate(1.2,2))<0,'equal severity uses quantity');
console.log('PASS engineering severity precedes quantity for equally failing candidates');

const actual=candidate(1.2,10),proxy=candidate(1.2,1);
actual.objective={...actual.objective,quantityComplete:false,nominalGeometryAvailable:true};
proxy.objective={...proxy.objective,quantityComplete:false,nominalGeometryAvailable:false};
assert.ok(compare(actual,proxy)<0,'equal engineering state must not prefer a smaller perimeter estimate over actual nominal geometry');
delete proxy.objective.nominalGeometryAvailable;assert.ok(compare(actual,proxy)<0,'unknown basis is not treated as actual geometry');
proxy.engineeringSeverity=candidate(1.05,1).engineeringSeverity;assert.ok(compare(proxy,actual)<0,'engineering improvement still precedes quantity basis');

assert.ok(compare(candidate(.8,10),candidate(.4,20))<0,'sub-unity ratio cannot prove improvement of a failing criterion');assert.equal(candidateEngineeringSeverity([{entityId:'A',checkId:'mixed',status:'NG',ratio:.8}],['A']).affected.unquantifiedNgCount,1);

const failedCandidate=candidate(1.1,1),calculatedCandidate=candidate(1.8,10);
failedCandidate.summary={counts:{NG:0,FAILED:1,NOT_CHECKED:0},incompleteCheckCount:1};failedCandidate.affectedScope.summary=failedCandidate.summary;
calculatedCandidate.summary={counts:{NG:2,FAILED:0,NOT_CHECKED:0},incompleteCheckCount:0};calculatedCandidate.affectedScope.summary=calculatedCandidate.summary;
assert.ok(compare(calculatedCandidate,failedCandidate)<0,'failed computation must not outrank two calculated NG checks');
console.log('PASS calculated candidates outrank computation failures regardless of apparent NG reduction');

const strainCandidate=(strain,cost)=>({...candidate(.04,cost),engineeringSeverity:candidateEngineeringSeverity([{entityId:'A',checkId:'rc-section-strength',status:'NG',reason:'MINIMUM_TENSION_STRAIN_NOT_SATISFIED',ratio:.04,minStrain:.004,tensionStrain:strain}],['A'])});
assert.ok(compare(strainCandidate(.0038,20),strainCandidate(.002,1))<0,'measured strain deficit improvement outranks lower quantity');
assert.equal(strainCandidate(.002,1).engineeringSeverity.affected.maximumNgRatio,2);
assert.equal(strainCandidate(.002,1).engineeringSeverity.affected.unquantifiedNgCount,0);
for(const strain of [0,-.001,NaN,.004])assert.equal(strainCandidate(strain,1).engineeringSeverity.affected.unquantifiedNgCount,1,'invalid or contradictory strain must remain unquantified');
const mixed=candidateEngineeringSeverity([{entityId:'A',checkId:'rc-section-strength',status:'NG',reason:'MINIMUM_TENSION_STRAIN_NOT_SATISFIED',ratio:3,minStrain:.004,tensionStrain:.002}],['A']);
assert.equal(mixed.affected.maximumNgRatio,3,'retain simultaneous strength excess');
