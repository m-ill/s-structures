import assert from 'node:assert/strict';
import {candidateQuerySummary,candidateDetailChunk} from '../src/compute/product/candidateQuery.js';
const candidate={candidateId:'a'.repeat(64),summary:{complete:false,checkCount:1000,counts:{NG:1,NOT_CHECKED:999},combinationCoverage:{rows:Array(2000).fill('large detail')}},changes:{regionCount:32,regionEdits:Object.fromEntries(Array.from({length:32},(_,i)=>['R'+i,{value:'x'.repeat(300)}]))},objective:{value:2},analysisProof:[],codeBasis:[],commands:[{private:'command'}]};
const row=candidateQuerySummary(candidate,{jobId:'J'});
assert.ok(JSON.stringify({candidates:Array(4).fill(row),best:row}).length<48000);
assert.equal(row.changes.regionEdits,undefined);assert.equal(row.summary.counts.NG,1);assert.equal(row.detailQuery.tool,'get_design_candidate_detail');
let offset=0,joined='',hash;do{const part=candidateDetailChunk(candidate,{offset,limit:53});assert.ok(!hash||hash===part.detailHash);hash=part.detailHash;joined+=part.chunk;offset=part.nextOffset;}while(offset!==null);
const full=JSON.parse(joined);assert.deepEqual(full.summary,candidate.summary);assert.deepEqual(full.changes,candidate.changes);assert.equal(full.commands,undefined);
assert.throws(()=>candidateDetailChunk(candidate,{offset:-1}));assert.throws(()=>candidateDetailChunk(candidate,{limit:4097}));
console.log('PASS bounded candidate summary and lossless paginated detail reconstruction');

const prior={id:'SP',version:1,reinforcementId:'R@1',barIndices:['1'],start:.1,end:.3,offsetY:.02,offsetZ:0},updated={...prior,type:'splice-record',version:2,reinforcementId:'R@2',barIndices:['1','2']};
const mapped={candidateId:candidate.candidateId,commands:[updated]},baselineSplices=[prior],detail=JSON.parse(candidateDetailChunk(mapped,{baselineSplices,limit:4096}).chunk);
assert.equal(detail.spliceChanges[0].before.reinforcementId,'R@1');assert.deepEqual(detail.spliceChanges[0].after.barIndices,['1','2']);assert.equal(detail.spliceChanges[0].geometryQualified,false);
assert.equal(candidateQuerySummary(mapped,{jobId:'J'}).spliceChangeCount,1);

const {createCandidateDetailReader}=await import('../src/compute/product/candidateDetailReader.js');
const {createResourceBudget}=await import('../src/core/resourceBudget.js');
const budget=createResourceBudget(),reader=createCandidateDetailReader({budget});
let all='',at=0;do{const part=reader.read('immutable-J-a',candidate,{offset:at,limit:4096});all+=part.chunk;at=part.nextOffset;}while(at!==null);
assert.deepEqual(JSON.parse(all),full);assert.equal(reader.stats().serializedRecords,1);assert.ok(reader.stats().hits>0);assert.ok(budget.snapshot().totalBytes>0);
for(let i=0;i<6;i++)reader.read('record-'+i,{value:i},{limit:50});assert.ok(reader.stats().entries<=4);
const huge={value:'x'.repeat(300000)};assert.equal(reader.read('huge',huge,{limit:37}).chunk,candidateDetailChunk(huge,{limit:37}).chunk);assert.ok(reader.stats().streamedReads>0);
reader.clear();assert.equal(budget.snapshot().totalBytes,0);
console.log('PASS bounded detail cache avoids repeated serialization, evicts old entries, streams large records and releases ownership');

const tinyBudget=createResourceBudget({maxBytes:1024}),tinyReader=createCandidateDetailReader({budget:tinyBudget});assert.deepEqual(tinyReader.read('tiny',mapped,{baselineSplices,limit:4096}),candidateDetailChunk(mapped,{baselineSplices,limit:4096}));assert.equal(tinyBudget.snapshot().totalBytes,0);tinyReader.clear();

const baselineReinforcement=[{id:'R',name:'R',version:1,sourceNote:'synthetic',memberId:'M',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[{y:.1,z:.02,diameter:.02,area:Math.PI*.02**2/4}],stirrups:{diameter:.01,spacing:.15,legs:2}}];
const nextRebar={type:'reinforcement-record',id:'R',name:'R',version:2,sourceNote:'synthetic',memberId:'M',start:0,end:1,cover:.04,barMaterialId:'steel@1',bars:[{y:.12,z:.02,diameter:20},{y:-.12,z:.02,diameter:20}],stirrupDiameter:10,stirrupSpacing:100,stirrupLegs:2,crossTieBarPairs:['1:2']};
const rebarCandidate={commands:[nextRebar]};
const rebarDetail=JSON.parse(candidateDetailChunk(rebarCandidate,{baselineReinforcement,limit:4096}).chunk);
assert.equal(rebarDetail.reinforcementChanges[0].before.bars[0].diameter,20);
assert.equal(rebarDetail.reinforcementChanges[0].before.stirrupSpacing,150);
assert.equal(rebarDetail.reinforcementChanges[0].after.bars.length,2);
assert.deepEqual(rebarDetail.reinforcementChanges[0].after.crossTieBarPairs,['1:2']);
assert.ok(rebarDetail.reinforcementChanges[0].changedFields.includes('bars'));
assert.ok(rebarDetail.reinforcementChanges[0].changedFields.includes('stirrupSpacing'));
assert.equal(rebarDetail.reinforcementChanges[0].designTransferAllowed,false);
assert.equal(candidateQuerySummary(rebarCandidate,{jobId:'J'}).reinforcementChangeCount,1);
assert.equal(JSON.parse(candidateDetailChunk(rebarCandidate).chunk).reinforcementChanges[0].before,null);

assert.deepEqual(reader.read('rebar-change',rebarCandidate,{baselineReinforcement}),candidateDetailChunk(rebarCandidate,{baselineReinforcement}));
assert.deepEqual(tinyReader.read('rebar-change',rebarCandidate,{baselineReinforcement}),candidateDetailChunk(rebarCandidate,{baselineReinforcement}));
reader.clear();tinyReader.clear();assert.equal(budget.snapshot().totalBytes,0);assert.equal(tinyBudget.snapshot().totalBytes,0);

const elasticSplice={...prior,locked:false,spliceSystem:'ordinary-no-seismic-detail',transferStiffness:120,transferElasticSlipLimit:.0001,transferReference:'specified transfer test',privateDerivedCache:{large:'omit'}};
const elasticCandidate={commands:[{...elasticSplice,type:'splice-record',version:2,transferElasticSlipLimit:.0002}]};
const elasticChange=JSON.parse(candidateDetailChunk(elasticCandidate,{baselineSplices:[elasticSplice]}).chunk).spliceChanges[0];
assert.equal(elasticChange.before.transferElasticSlipLimit,.0001);assert.equal(elasticChange.after.transferElasticSlipLimit,.0002);
assert.equal(elasticChange.before.transferReference,'specified transfer test');assert.equal(elasticChange.after.locked,false);
assert.equal(elasticChange.after.privateDerivedCache,undefined);assert.equal(elasticChange.units.transferStiffness,'kN/m2');assert.equal(elasticChange.units.transferElasticSlipLimit,'m');
console.log('PASS splice before/after preserves the complete public transfer input contract and units');

const traceCandidate={candidateId:'trace',changes:{spliceRefinement:[{pass:1,ok:true,changes:Array.from({length:16},(_,i)=>({id:'S'+i,requiredLength:2})),unavailable:[{id:'X',reason:'NO_SPACE',detail:'x'.repeat(5000)}],basisCheckIds:['KDS-CHECK'],jointPlacement:{attempted:false}}]}};
const compactTrace=candidateQuerySummary(traceCandidate,{jobId:'J'}).changes.spliceRefinement[0];
assert.equal(compactTrace.changes,undefined);assert.equal(compactTrace.unavailable,undefined);assert.equal(compactTrace.changeCount,16);assert.equal(compactTrace.unavailableCount,1);assert.equal(compactTrace.basisCheckCount,1);assert.ok(JSON.stringify(compactTrace).length<1000);
const {spliceRefinementState}=await import('../src/compute/product/spliceRefinementState.js');
const ng=[{checkId:'rc-splices',status:'NG',checks:[{status:'NG',classAProof:{status:'OK'},requiredLength:2,providedLength:1}]}];
assert.equal(spliceRefinementState(false,[],ng).status,'NOT_REQUESTED');
assert.equal(spliceRefinementState(true,[{ok:true}],[]).status,'RESOLVED_LENGTH_ONLY');
assert.equal(spliceRefinementState(true,[{ok:true},{ok:true}],ng).status,'PASS_LIMIT');
assert.equal(spliceRefinementState(true,[{ok:false,reason:'NO_SPACE'}],ng).reason,'NO_SPACE');
assert.equal(spliceRefinementState(true,[],[{...ng[0],checks:[{...ng[0].checks[0],classAProof:{status:'NOT_CHECKED'}}]}]).remainingLengthChecks,0);
console.log('PASS compact refinement query and explicit length-only termination state');
