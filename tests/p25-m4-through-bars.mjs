import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {designContext} from './fixtures/p24/context.js';
import {fitSpatialHoopBars} from '../src/design/rc/fitSpatialHoopBars.js';
import {REQUIRED_JOINT_CHECKS} from '../src/design/evaluation/practicalEvaluation.js';
import {fitCrossTieCage} from '../src/design/rc/fitCrossTieCage.js';
import {buildBarFabrication} from '../src/design/rc/barGeometry.js';
import {jointThroughBars} from '../src/design/connection/jointThroughBars.js';
import {stageDesignInputCommand} from '../src/modeling/designInputCommands.js';
import {buildDetailDrawings} from '../src/report/phase24/detailDrawings.js';
import {encodeQuantityCsv} from '../src/report/phase24/quantityCsv.js';
import {buildVectorDetailPdf} from '../src/report/phase24/vectorPdf.js';
import {prepareDetailGeometry} from '../src/design/rc/preparedDetailGeometry.js';
const hook={fabricationShape:'L90',cover:.04,endSetbackStart:.04,endSetbackEnd:.04,bendInsideRadius:.036,hookTailLength:.144},bar={diameter:.012,y:.1,z:.07};
assert.notEqual(buildBarFabrication(hook,bar,{length:3,H:.3}).cutLength,null,'exact D12 minimum radius/tail');
for(const patch of [{bendInsideRadius:.036-1e-9},{hookTailLength:.144-1e-9}])assert.equal(buildBarFabrication({...hook,...patch},bar,{length:3,H:.3}).reason,'KDS_MINIMUM_BEND_OR_TAIL_NOT_SATISFIED');
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3},{id:'D',x:0,y:0,z:6},{id:'E',x:-3,y:0,z:3}];
 m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'COL@1'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'BEAM@1'},{id:'BD',type:'frame',n1:'B',n2:'D',matId:'concrete',secId:'COL@1'},{id:'EB',type:'frame',n1:'E',n2:'B',matId:'concrete',secId:'BEAM@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:5,dir:'-z',case:'D'}];
 m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const fit=fitSpatialHoopBars({bars:[[-(.13+.01/Math.sqrt(2)),-(.13+.01/Math.sqrt(2))],[-.14,0],[-(.13+.01/Math.sqrt(2)),(.13+.01/Math.sqrt(2))],[0,.14],[(.13+.01/Math.sqrt(2)),(.13+.01/Math.sqrt(2))],[.14,0],[(.13+.01/Math.sqrt(2)),-(.13+.01/Math.sqrt(2))],[0,-.14]].map(([y,z])=>({y,z,diameter:.02})),cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.02,tieHookTail:.075,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03},{B:.4,H:.4});
 assert.equal(fit.status,'OK',JSON.stringify(fit));
 const base={type:'reinforcement-record',version:1,name:'synthetic joint bars',sourceNote:'explicit synthetic geometry; not construction documentation',start:0,end:1,cover:.04,barMaterialId:'steel@1',strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed',barCoating:'uncoated'};
 const joint={type:'connection-record',id:'J',version:1,name:'synthetic exterior joint',sourceNote:'explicit profile integration; independent method review remains',nodeId:'B',memberIds:['AB','BC','BD','EB'],connectionType:'rc-joint',restraint:'rigid',columnMemberId:'AB',jointWidth:.4,jointDepth:.4,jointPanelHeight:.3,jointMaterialId:'concrete@1',concreteWeight:'normal',jointDesignStandard:'KDS-142080-2021-special-frame',capacityDemandBasis:'derived-1.25fy-no-column-shear-credit',capacityBeamScope:'rectangular-no-slab-participation',jointStrengthMode:'conservative-column-design-beam-nominal',jointAnchorageMode:'special-frame-beam-through-bars',jointBeamContinuity:'aligned-through-bars',jointHoopForm:'closed-rectangular-two-leg',jointTieClosure:'seismic-135',jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointCover:.04,jointHookTail:.075,jointBendInsideRadius:.02,jointClosureCorner:'+y+z',jointClosureSeparation:.03,jointFirstStart:.0375,jointFirstEnd:.0375,barMaterialId:'HOOP@1',tieDiameter:10,tieSpacing:75,tieLegs:2,jointCrossTiePattern:'alternating-hook-side',jointCrossTieBarPairs:['2:6','4:8'],jointCrossTieHookSides:['left','left'],jointCrossTiePlaneOffsets:['-0.015','-0.03']};
 const cage=fitCrossTieCage({bars:fit.bars,cover:.04,start:0,end:1,stirrups:{diameter:.01,spacing:joint.tieSpacing/1000},tieClosure:'standard-135',tieClosureCorner:joint.jointClosureCorner,tieClosureSeparation:joint.jointClosureSeparation,tieBendInsideRadius:joint.jointBendInsideRadius,tieHookTail:joint.jointHookTail,tieFirstStart:joint.jointFirstStart,tieFirstEnd:joint.jointFirstEnd,crossTieBarPairs:joint.jointCrossTieBarPairs,crossTieHookSides:joint.jointCrossTieHookSides,crossTiePlaneOffsets:joint.jointCrossTiePlaneOffsets},{B:.4,H:.4,length:joint.jointPanelHeight});
 assert.equal(cage.status,'OK',JSON.stringify(cage));
 joint.jointCrossTiePlaneOffsets=cage.planeOffsets;joint.jointCrossTieHookSides=cage.hookSides;
 const commands=[{type:'material-record',id:'HOOP',version:1,name:'Explicit 400 MPa hoop steel',kind:'steel',E:200000,nu:.3,density:7.85,Fy:400,Fu:460,sourceReference:'synthetic input',edition:'fixture',sourceNote:'not a certificate',basisStatus:'assumed',product:'rebar',grade:'SD400'},...['COL','BEAM'].map(id=>({type:'section-record',id,version:1,name:id,sourceNote:'synthetic',shape:'RECT',dimensionUnit:'mm',B:id==='COL'?400:300,H:id==='COL'?400:300})),{...base,id:'RC',memberId:'AB',bars:fit.bars.map(b=>({...b,diameter:b.diameter*1000}))},{...base,id:'RU',memberId:'BD',bars:fit.bars.map(b=>({...b,diameter:b.diameter*1000}))},{...base,id:'RB',memberId:'BC',bars:[[-.09,-.045],[-.09,.105],[.07,-.105],[.07,-.045]].map(([y,z])=>({y,z,diameter:10})),startExtension:0,startFabricationShape:'straight',endFabricationShape:'straight',startBendInsideRadius:.03,startHookTailLength:.12,endSetbackStart:0,endSetbackEnd:.04},joint];
 const right=commands.find(c=>c.id==='RB');commands.splice(commands.length-1,0,{...right,id:'RL',memberId:'EB',endSetbackStart:.04,endSetbackEnd:0});
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-profile-preview',commands});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-profile-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'joint-profile-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId),checks=snapshot.checks.filter(c=>c.entityId==='joint:B');
 mkdirSync('output/phase25',{recursive:true});writeFileSync('output/phase25/joint-through-input-audit.json',JSON.stringify({evaluationId:evaluation.evaluationId,checks,summary:evaluation.summary},null,2));
 assert.deepEqual(checks.map(c=>c.checkId).sort(),[...REQUIRED_JOINT_CHECKS].sort());
 assert.equal(checks.find(c=>c.checkId==='joint-hoop-detail').transverseLongitudinalAssembly.status,'OK');
 for(const c of checks)assert.equal(c.status,'OK',`${c.checkId}: ${c.reason}`);
 for(const c of checks)assert.equal(c.jointTopology.beamArrangement,'two-opposite');
 assert.equal(evaluation.summary.complete,false,'independent method/project scope cannot be implied by local joint checks');
 assert.equal(checks.find(c=>c.checkId==='joint-shear').codeBasis.status,'NOT_ESTABLISHED');
 const drawing=buildDetailDrawings(snapshot,{maxPages:600,pageLimit:8}),continuous=drawing.quantities.filter(q=>q.sourceFragments?.length>1);
 assert.equal(continuous.length,4,'one physical quantity row per continuous beam bar');
 for(const q of continuous){assert.equal(q.count,1);assert.ok(Math.abs(q.cutLength-5.92)<1e-10);assert.equal(q.sourceFragments.length,2);assert.equal(q.fabricationApproved,false);}
 assert.equal(drawing.throughBarSchedule.physicalBarCount,4);assert.equal(drawing.throughBarSchedule.sourceFragmentCount,8);
 assert.equal(drawing.quantities.filter(q=>q.kind==='longitudinal'&&['BC','EB'].includes(q.memberId)).length,4);
 const schedulePage=drawing.pages.find(p=>p.detailId==='continuous-bars-1');assert.ok(schedulePage,'physical bar schedule page');
 assert.ok(schedulePage.commands.some(c=>c.kind==='text'&&c.text.includes('5920')));
 mkdirSync('output/pdf/phase25',{recursive:true});
 writeFileSync('output/pdf/phase25/through-bar-review.pdf',buildVectorDetailPdf([drawing.pages.find(p=>p.detailId==='RB'),drawing.pages.find(p=>p.detailId==='J'),schedulePage],new Uint8Array(readFileSync('assets/fonts/phase24/SStructuresSans.ttf'))));
 writeFileSync('output/phase25/joint-through-quantities.csv',encodeQuantityCsv(drawing));
 writeFileSync('output/phase25/joint-through-schedule.json',JSON.stringify(drawing.throughBarSchedule,null,2));
 const connection=m.designDetails.connections[0];
 for(const patch of [{endSetbackEnd:.001},{endFabricationShape:'L90'}]){
  const invalid=structuredClone(m);Object.assign(invalid.designDetails.reinforcement.find(r=>r.id==='RL'),patch);
  assert.equal(jointThroughBars(invalid,connection).reason,'JOINT_THROUGH_BAR_GAP_OR_TERMINATION');
 }
 for(const patch of [{z:.2},{area:1e-3}]){
  const invalid=structuredClone(m);Object.assign(invalid.designDetails.reinforcement.find(r=>r.id==='RL').bars[0],patch);
  assert.equal(jointThroughBars(invalid,connection).reason,'JOINT_THROUGH_BAR_MATCH_REQUIRED');
 }
 const reversed=structuredClone(m);Object.assign(reversed.members.find(r=>r.id==='EB'),{n1:'B',n2:'E'});
 const left=reversed.designDetails.reinforcement.find(r=>r.id==='RL');left.endSetbackStart=0;left.endSetbackEnd=.04;left.bars.forEach(b=>b.z*=-1);
 assert.equal(jointThroughBars(reversed,connection).status,'OK','match in global coordinates after reversing beam local axis');
 const boundary=structuredClone(m);
 for(const r of boundary.designDetails.reinforcement.filter(r=>['RB','RL'].includes(r.id))){r.barMaterialId='HOOP@1';r.bars.forEach(b=>{b.diameter=.02;b.area=Math.PI*.02**2/4;});}
 assert.equal(jointThroughBars(boundary,connection).ratio,1);
 stageDesignInputCommand(boundary,{...commands[0],id:'HIGH',Fy:500,Fu:600,grade:'SD500'},{},[]);
 for(const r of boundary.designDetails.reinforcement.filter(r=>['RB','RL'].includes(r.id)))r.barMaterialId='HIGH@1';
 const high=jointThroughBars(boundary,connection);assert.equal(high.status,'NG');assert.equal(high.ratio,1.25);assert.equal(high.continuityVerified,true);
 assert.equal(checks.find(c=>c.checkId==='joint-bar-congestion').barPaths.filter(p=>p.continuationIds?.some(id=>id.startsWith('BC:'))).length,4);
 const chain=structuredClone(m);
 chain.nodes.push({id:'F',x:6,y:0,z:3},{id:'G',x:3,y:0,z:0},{id:'H',x:3,y:0,z:6});
 chain.members.push({id:'CF',type:'frame',n1:'C',n2:'F',matId:'concrete',secId:'BEAM@1'},{id:'GC',type:'frame',n1:'G',n2:'C',matId:'concrete',secId:'COL@1'},{id:'CH',type:'frame',n1:'C',n2:'H',matId:'concrete',secId:'COL@1'});
 const middle=chain.designDetails.reinforcement.find(r=>r.id==='RB');middle.endSetbackEnd=0;
 chain.designDetails.reinforcement.push({...structuredClone(middle),id:'RF',memberId:'CF',endSetbackEnd:.04},...['GC','CH'].map((memberId,i)=>({...structuredClone(chain.designDetails.reinforcement.find(r=>r.id==='RC')),id:`R${i+5}`,memberId})));
 chain.designDetails.connections.push({...structuredClone(connection),id:'J2',nodeId:'C',memberIds:['BC','CF','GC','CH'],columnMemberId:'GC'});
 const joined=prepareDetailGeometry(chain).throughBarSchedule;
 assert.equal(joined.physicalBarCount,4);assert.equal(joined.sourceFragmentCount,12);
 for(const r of joined.records){assert.ok(Math.abs(r.cutLength-8.92)<1e-10);assert.equal(r.sourceFragments.length,3);}
 const reordered=structuredClone(chain);reordered.designDetails.connections.reverse();
 assert.deepEqual(prepareDetailGeometry(reordered).throughBarSchedule,joined,'physical schedule must not depend on connection enumeration');
 const broken=structuredClone(chain);broken.designDetails.reinforcement.find(r=>r.id==='RF').bars[0].z+=.01;
 const incomplete=prepareDetailGeometry(broken).throughBarSchedule;
 assert.equal(incomplete.physicalBarCount,null);
 assert.ok(incomplete.records.every(r=>r.status==='NOT_CHECKED'&&r.cutLength===null),'unverified interior end cannot be counted as a completed bar');
 writeFileSync('output/phase25/joint-through-chain-audit.json',JSON.stringify({joined,incomplete},null,2));
 console.log('PASS actual WebMCP through-bar joint continuity and depth');
}finally{await ctx.dispose();}
