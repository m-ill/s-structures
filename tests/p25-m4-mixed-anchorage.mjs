import {jointHookAnchorageProposal} from '../src/compute/product/jointHookAnchorageProposal.js';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {designContext} from './fixtures/p24/context.js';
import {fitSpatialHoopBars} from '../src/design/rc/fitSpatialHoopBars.js';
import {REQUIRED_JOINT_CHECKS} from '../src/design/evaluation/practicalEvaluation.js';
import {fitCrossTieCage} from '../src/design/rc/fitCrossTieCage.js';
import {buildBarFabrication} from '../src/design/rc/barGeometry.js';
import {evaluateJointHookAnchorage} from '../src/design/connection/jointHookAnchorage.js';
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
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3},{id:'D',x:0,y:0,z:6},{id:'E',x:-3,y:0,z:3},{id:'P',x:0,y:3,z:3}];
 m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'COL@1'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'BEAM@1'},{id:'BD',type:'frame',n1:'B',n2:'D',matId:'concrete',secId:'COL@1'},{id:'EB',type:'frame',n1:'E',n2:'B',matId:'concrete',secId:'BEAM@1'},{id:'BP',type:'frame',n1:'B',n2:'P',matId:'concrete',secId:'BEAM@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:5,dir:'-z',case:'D'}];
 m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const fit=fitSpatialHoopBars({bars:[[-(.13+.01/Math.sqrt(2)),-(.13+.01/Math.sqrt(2))],[-.14,0],[-(.13+.01/Math.sqrt(2)),(.13+.01/Math.sqrt(2))],[0,.14],[(.13+.01/Math.sqrt(2)),(.13+.01/Math.sqrt(2))],[.14,0],[(.13+.01/Math.sqrt(2)),-(.13+.01/Math.sqrt(2))],[0,-.14]].map(([y,z])=>({y,z,diameter:.02})),cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.02,tieHookTail:.075,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03},{B:.4,H:.4});
 assert.equal(fit.status,'OK',JSON.stringify(fit));
 const base={type:'reinforcement-record',version:1,name:'synthetic joint bars',sourceNote:'explicit synthetic geometry; not construction documentation',start:0,end:1,cover:.04,barMaterialId:'steel@1',strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed',barCoating:'uncoated'};
 const joint={type:'connection-record',id:'J',version:1,name:'synthetic exterior joint',sourceNote:'explicit profile integration; independent method review remains',nodeId:'B',memberIds:['AB','BC','BD','EB','BP'],connectionType:'rc-joint',restraint:'rigid',columnMemberId:'AB',jointWidth:.4,jointDepth:.4,jointPanelHeight:.3,jointMaterialId:'concrete@1',concreteWeight:'normal',jointDesignStandard:'KDS-142080-2021-special-frame',capacityDemandBasis:'derived-1.25fy-no-column-shear-credit',capacityBeamScope:'rectangular-no-slab-participation',jointStrengthMode:'conservative-column-design-beam-nominal',jointAnchorageMode:'special-frame-beam-mixed',jointThroughAxis:'X',jointBeamContinuity:'aligned-through-bars',jointHoopForm:'closed-rectangular-two-leg',jointTieClosure:'seismic-135',jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointCover:.04,jointHookTail:.075,jointBendInsideRadius:.02,jointClosureCorner:'+y+z',jointClosureSeparation:.03,jointFirstStart:.0375,jointFirstEnd:.0375,barMaterialId:'HOOP@1',tieDiameter:10,tieSpacing:75,tieLegs:2,jointCrossTiePattern:'alternating-hook-side',jointCrossTieBarPairs:['2:6','4:8'],jointCrossTieHookSides:['left','left'],jointCrossTiePlaneOffsets:['-0.015','-0.03']};
 const cage=fitCrossTieCage({bars:fit.bars,cover:.04,start:0,end:1,stirrups:{diameter:.01,spacing:joint.tieSpacing/1000},tieClosure:'standard-135',tieClosureCorner:joint.jointClosureCorner,tieClosureSeparation:joint.jointClosureSeparation,tieBendInsideRadius:joint.jointBendInsideRadius,tieHookTail:joint.jointHookTail,tieFirstStart:joint.jointFirstStart,tieFirstEnd:joint.jointFirstEnd,crossTieBarPairs:joint.jointCrossTieBarPairs,crossTieHookSides:joint.jointCrossTieHookSides,crossTiePlaneOffsets:joint.jointCrossTiePlaneOffsets},{B:.4,H:.4,length:joint.jointPanelHeight});
 assert.equal(cage.status,'OK',JSON.stringify(cage));
 joint.jointCrossTiePlaneOffsets=cage.planeOffsets;joint.jointCrossTieHookSides=cage.hookSides;
 const commands=[{type:'material-record',id:'HOOP',version:1,name:'Explicit 400 MPa hoop steel',kind:'steel',E:200000,nu:.3,density:7.85,Fy:400,Fu:460,sourceReference:'synthetic input',edition:'fixture',sourceNote:'not a certificate',basisStatus:'assumed',product:'rebar',grade:'SD400'},...['COL','BEAM'].map(id=>({type:'section-record',id,version:1,name:id,sourceNote:'synthetic',shape:'RECT',dimensionUnit:'mm',B:id==='COL'?400:300,H:id==='COL'?400:300})),{...base,id:'RC',memberId:'AB',bars:fit.bars.map(b=>({...b,diameter:b.diameter*1000}))},{...base,id:'RU',memberId:'BD',bars:fit.bars.map(b=>({...b,diameter:b.diameter*1000}))},{...base,id:'RB',memberId:'BC',bars:[[-.09,-.045],[-.09,.105],[.07,-.105],[.07,-.045]].map(([y,z])=>({y,z,diameter:10})),startExtension:0,startFabricationShape:'straight',endFabricationShape:'straight',startBendInsideRadius:.03,startHookTailLength:.12,endSetbackStart:0,endSetbackEnd:.04},joint];
 const right=commands.find(c=>c.id==='RB');commands.splice(commands.length-1,0,{...right,id:'RL',memberId:'EB',endSetbackStart:.04,endSetbackEnd:0});
 commands.splice(commands.length-1,0,{...right,id:'RP',memberId:'BP',startExtension:.19,endSetbackStart:.04,endSetbackEnd:.04,startFabricationShape:'L90',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y>0?.10:-.06,z:z*.05,diameter:10})))});
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-profile-preview',commands});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-profile-input'})).ok,true);
 const run=await ctx.bridge.runElasticWorkflow({plan:ctx.bridge.planElasticWorkflow({caseIds:['E']}),requestId:'joint-profile-source'});assert.equal(run.ok,true);
 const evaluation=await ctx.call('evaluate_practical_design',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,sources:[{analysisRunId:run.steps[0].analysisRunId,comboId:'U'}]});
 const snapshot=ctx.bridge.getPracticalDesignSnapshot(evaluation.evaluationId),checks=snapshot.checks.filter(c=>c.entityId==='joint:B');
 mkdirSync('output/phase25',{recursive:true});writeFileSync('output/phase25/joint-mixed-input-audit.json',JSON.stringify({evaluationId:evaluation.evaluationId,checks,summary:evaluation.summary},null,2));
 assert.deepEqual(checks.map(c=>c.checkId).sort(),[...REQUIRED_JOINT_CHECKS].sort());
 // The added perpendicular beam deliberately retains an unqualified cage.
 // Anchorage success must not suppress confinement or physical collision failures.
 const expectedNG=new Map([['joint-confinement','JOINT_HOOP_AREA_INSUFFICIENT'],['joint-hoop-detail','JOINT_TRANSVERSE_LONGITUDINAL_COLLISION'],['joint-bar-congestion','JOINT_LONGITUDINAL_BAR_CLEARANCE_NOT_SATISFIED']]);
 for(const c of checks){assert.equal(c.status,expectedNG.has(c.checkId)?'NG':'OK',c.checkId);if(expectedNG.has(c.checkId))assert.equal(c.reason,expectedNG.get(c.checkId));}
 assert.equal(checks.find(c=>c.checkId==='joint-hoop-detail').transverseLongitudinalAssembly.status,'NG');
 for(const c of checks)assert.equal(c.jointTopology.beamArrangement,'three-sided');
 assert.equal(evaluation.summary.complete,false,'independent method/project scope cannot be implied by local joint checks');
 assert.equal(checks.find(c=>c.checkId==='joint-shear').codeBasis.status,'NOT_ESTABLISHED');
 const connection=m.designDetails.connections[0],anchorage=evaluateJointHookAnchorage(m,connection);
 assert.equal(anchorage.status,'OK');assert.equal(anchorage.throughBars.checks.length,4);assert.equal(anchorage.hooks.checks.length,4);
 assert.deepEqual(new Set(anchorage.hooks.checks.map(r=>r.memberId)),new Set(['BP']));
 assert.equal(anchorage.designTransferAllowed,false);
 for(const axis of [undefined,'Z'])assert.equal(evaluateJointHookAnchorage(m,{...connection,jointThroughAxis:axis}).reason,'JOINT_THROUGH_AXIS_REQUIRED');
 assert.equal(evaluateJointHookAnchorage(m,{...connection,jointThroughAxis:'Y'}).reason,'JOINT_OPPOSITE_BEAM_PAIRS_REQUIRED');
 const missingHook=structuredClone(m);missingHook.designDetails.reinforcement.find(r=>r.id==='RP').startFabricationShape='straight';
 const missing=evaluateJointHookAnchorage(missingHook,connection);assert.equal(missing.status,'NOT_CHECKED');assert.equal(missing.reason,'JOINT_90_HOOK_AND_STEEL_REQUIRED');assert.equal(missing.incomplete,true);
 const combined=structuredClone(missingHook);
 for(const id of ['RB','RL'])for(const bar of combined.designDetails.reinforcement.find(r=>r.id===id).bars){bar.diameter=.025;bar.area=Math.PI*.025**2/4;}
 const failedAndMissing=evaluateJointHookAnchorage(combined,connection);
 assert.equal(failedAndMissing.status,'NG');assert.equal(failedAndMissing.incomplete,true);assert.equal(failedAndMissing.hooks.status,'NOT_CHECKED');assert.equal(failedAndMissing.throughBars.status,'NG');
 const gap=structuredClone(m);gap.designDetails.reinforcement.find(r=>r.id==='RL').endSetbackEnd=.001;
 assert.equal(evaluateJointHookAnchorage(gap,connection).reason,'JOINT_THROUGH_BAR_GAP_OR_TERMINATION');
 const repairModel=structuredClone(m);
 repairModel.designDetails.reinforcement.find(r=>r.id==='RP').startExtension=.20;
 for(const id of ['RB','RL'])for(const bar of repairModel.designDetails.reinforcement.find(r=>r.id===id).bars){bar.diameter=.025;bar.area=Math.PI*.025**2/4;}
 const repair=jointHookAnchorageProposal(repairModel,connection);
 assert.equal(repair.ok,true,repair.reason);assert.deepEqual(repair.commands.map(c=>c.id),['RP']);
 assert.equal(repair.prospectiveHookStatus,'OK');assert.equal(repair.prospectiveAnchorageStatus,'NG');
 assert.equal(repair.remainingAnchorageChecks.length,4);assert.equal(repair.automaticApplicationAllowed,false);
 const fixed=structuredClone(repairModel);for(const c of repair.commands)stageDesignInputCommand(fixed,c,{},[]);
 const result=evaluateJointHookAnchorage(fixed,connection);assert.equal(result.hooks.status,'OK');assert.equal(result.throughBars.status,'NG');
 assert.deepEqual(fixed.designDetails.reinforcement.filter(r=>['RB','RL'].includes(r.id)),repairModel.designDetails.reinforcement.filter(r=>['RB','RL'].includes(r.id)));
 const geometry=prepareDetailGeometry(m),schedule=geometry.throughBarSchedule;
 assert.equal(schedule.physicalBarCount,4);assert.equal(schedule.sourceFragmentCount,8);
 assert.ok(schedule.records.every(r=>r.sourceFragments.every(f=>['BC','EB'].includes(f.memberId))),'perpendicular hooks must remain separate physical bars');
 console.log('PASS mixed through-bar and 90-degree hook joint paths');
}finally{await ctx.dispose();}
