// Read-only investigation of current Phase24 behavior. No solver, browser,
// production patch or real-building model. Observations are not acceptance tests.
import {createModel} from '../../../../src/core/model.js';
import {stagePracticalDesignInput} from '../../../../src/modeling/practicalDesignInputs.js';
import {evaluatePracticalDesign,concurrentMemberDemands} from '../../../../src/design/evaluation/practicalEvaluation.js';
import {designCodeBasis} from '../../../../src/metadata/designCodeBasis.js';
import {getKcscRuleSources} from '../../../../src/metadata/kcscRuleSources.js';
const start=performance.now(),model=createModel();
model.nodes=[{id:'A',x:0,y:0,z:0},{id:'B',x:3,y:0,z:0}];
model.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'}];
model.loadCases=[{id:'L',type:'live'},{id:'D',type:'dead'}];
model.loads=[{id:'dead',type:'udl',member:'AB',case:'D',dir:'-z',w:1}];
model.loadCombinations=[{id:'LIVE',type:'service',factors:{L:1}},{id:'TOTAL',type:'service',factors:{L:1}}];
const detail={type:'reinforcement-record',id:'R',name:'audit-only',version:1,memberId:'AB',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars:[{y:-0.2,z:0,diameter:20},{y:0.2,z:0,diameter:20}],sourceNote:'Synthetic audit; not a design recommendation',concreteWeight:'normal',serviceabilityMode:'instant-live-curvature',serviceBoundary:'chord',serviceDeflectionLimit:'live-floor',serviceCrackingComboId:'TOTAL',nonstructuralDamageSensitive:false,strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed',stirrupDiameter:10,stirrupLegs:2,stirrupSpacing:150};
stagePracticalDesignInput(model,detail,[]);
const set=(id)=>({ok:true,anyOk:true,combo:{id},memberResults:{AB:{xs:[0,1.5,3],N:[0,0,0],Vy:[0,0,0],Vz:[0,0,0],T:[0,0,0],My:[0,0,0],Mz:[0,3,0]}}});
const live=set('LIVE'),total=set('TOTAL');
const run=m=>evaluatePracticalDesign(m,{byCombo:{LIVE:live,TOTAL:total}},{resultSet:live});
const evaluation=run(model),pick=id=>evaluation.checks.find(x=>x.checkId===id);
const regions=structuredClone(model);regions.designDetails.reinforcement=[];
stagePracticalDesignInput(regions,{...detail,id:'R1',start:0,end:0.5},[]);
stagePracticalDesignInput(regions,{...detail,id:'R2',start:0.5,end:1},[]);
const ref=getKcscRuleSources(['142020'])[0];
const malformed={...live.memberResults.AB,xs:[0,3,1.5]};
console.log(JSON.stringify({scope:'read-only synthetic audit; supplied force arrays; no analysis solver',elapsedMs:Math.round(performance.now()-start),observations:[
 {id:'A01',finding:'mandatory-code-check-remains-unfilled',observed:{complete:evaluation.complete,codeCheck:pick('rc-code-compliance')?.status,reason:pick('rc-code-compliance')?.reason},source:'src/design/evaluation/practicalEvaluation.js'},
 {id:'A02',finding:'total-service-combination-can-omit-present-dead-load',observed:{deadLoadPresent:true,totalFactors:model.loadCombinations[1].factors,deflectionStatus:pick('rc-deflection')?.status,basis:pick('rc-deflection')?.codeBasis.status},source:'src/design/rc/kdsServiceability.js'},
 {id:'A03',finding:'service-combination-also-evaluates-strength',observed:{combinationType:'service',strengthStatus:pick('rc-section-strength')?.status},source:'src/design/evaluation/practicalEvaluation.js'},
 {id:'A04',finding:'adjacent-valid-regions-share-inclusive-boundary',observed:{inputAccepted:true,strengthStatus:run(regions).checks.find(x=>x.checkId==='rc-section-strength')?.status,reason:run(regions).checks.find(x=>x.checkId==='rc-section-strength')?.reason},source:'src/design/rc/providedMember.js'},
 {id:'A05',finding:'source-integrity-does-not-validate-clause-existence',observed:{status:designCodeBasis('rc-section-strength',{status:'OK',codeReferences:[{...ref,clause:'999 nonexistent audit clause'}]}).status},source:'src/metadata/designCodeBasis.js'},
 {id:'A06',finding:'generic-demand-adapter-accepts-unsorted-stations',observed:{stationOrder:malformed.xs,acceptedCount:concurrentMemberDemands('AB','LIVE',malformed).length},source:'src/design/evaluation/practicalEvaluation.js'}
]},null,2));
