import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {designContext} from './fixtures/p24/context.js';
import {fitSpatialHoopBars} from '../src/design/rc/fitSpatialHoopBars.js';
import {REQUIRED_JOINT_CHECKS} from '../src/design/evaluation/practicalEvaluation.js';
import {fitCrossTieCage} from '../src/design/rc/fitCrossTieCage.js';
import {buildBarFabrication} from '../src/design/rc/barGeometry.js';
const hook={fabricationShape:'L90',cover:.04,endSetbackStart:.04,endSetbackEnd:.04,bendInsideRadius:.036,hookTailLength:.144},bar={diameter:.012,y:.1,z:.07};
assert.notEqual(buildBarFabrication(hook,bar,{length:3,H:.3}).cutLength,null,'exact D12 minimum radius/tail');
for(const patch of [{bendInsideRadius:.036-1e-9},{hookTailLength:.144-1e-9}])assert.equal(buildBarFabrication({...hook,...patch},bar,{length:3,H:.3}).reason,'KDS_MINIMUM_BEND_OR_TAIL_NOT_SATISFIED');
const ctx=designContext(),m=ctx.model;
try{
 m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3},{id:'D',x:0,y:0,z:6}];
 m.members=[{id:'AB',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'COL@1'},{id:'BC',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'BEAM@1'},{id:'BD',type:'frame',n1:'B',n2:'D',matId:'concrete',secId:'COL@1'}];
 m.loadCases=[{id:'D',type:'dead',name:'D'}];m.loads=[{id:'F',type:'nodal',node:'C',P:5,dir:'-z',case:'D'}];
 m.loadCombinations=[{id:'U',type:'strength',name:'U',factors:{D:1.4}}];m.analysisCases=[{id:'E',name:'E',kind:'static',status:'not-run',settings:{comboId:'U',pDeltaMethod:'off'}}];
 const fit=fitSpatialHoopBars({bars:[[-(.13+.01/Math.sqrt(2)),-(.13+.01/Math.sqrt(2))],[-.14,0],[-(.13+.01/Math.sqrt(2)),(.13+.01/Math.sqrt(2))],[0,.14],[(.13+.01/Math.sqrt(2)),(.13+.01/Math.sqrt(2))],[.14,0],[(.13+.01/Math.sqrt(2)),-(.13+.01/Math.sqrt(2))],[0,-.14]].map(([y,z])=>({y,z,diameter:.02})),cover:.04,stirrups:{diameter:.01},tieBendInsideRadius:.02,tieHookTail:.075,tieClosure:'standard-135',tieClosureCorner:'+y+z',tieClosureSeparation:.03},{B:.4,H:.4});
 assert.equal(fit.status,'OK',JSON.stringify(fit));
 const base={type:'reinforcement-record',version:1,name:'synthetic joint bars',sourceNote:'explicit synthetic geometry; not construction documentation',start:0,end:1,cover:.04,barMaterialId:'steel@1',strengthStandard:'KDS-142020-2022',reinforcementForm:'single-deformed',barCoating:'uncoated'};
 const joint={type:'connection-record',id:'J',version:1,name:'synthetic exterior joint',sourceNote:'explicit profile integration; independent method review remains',nodeId:'B',memberIds:['AB','BC','BD'],connectionType:'rc-joint',restraint:'rigid',columnMemberId:'AB',jointWidth:.4,jointDepth:.4,jointPanelHeight:.3,jointMaterialId:'concrete@1',concreteWeight:'normal',jointDesignStandard:'KDS-142080-2021-special-frame',capacityDemandBasis:'derived-1.25fy-no-column-shear-credit',capacityBeamScope:'rectangular-no-slab-participation',jointStrengthMode:'conservative-column-design-beam-nominal',jointAnchorageMode:'special-frame-beam-90-hooks',jointHoopForm:'closed-rectangular-two-leg',jointTieClosure:'seismic-135',jointColumnContinuity:'aligned-through-bars',jointCongestionMode:'longitudinal-paths',jointMinimumClearance:0,jointCover:.04,jointHookTail:.075,jointBendInsideRadius:.02,jointClosureCorner:'+y+z',jointClosureSeparation:.03,jointFirstStart:.0375,jointFirstEnd:.0375,barMaterialId:'HOOP@1',tieDiameter:10,tieSpacing:75,tieLegs:2,jointCrossTiePattern:'alternating-hook-side',jointCrossTieBarPairs:['2:6','4:8'],jointCrossTieHookSides:['left','left'],jointCrossTiePlaneOffsets:['-0.015','-0.03']};
 const cage=fitCrossTieCage({bars:fit.bars,cover:.04,start:0,end:1,stirrups:{diameter:.01,spacing:joint.tieSpacing/1000},tieClosure:'standard-135',tieClosureCorner:joint.jointClosureCorner,tieClosureSeparation:joint.jointClosureSeparation,tieBendInsideRadius:joint.jointBendInsideRadius,tieHookTail:joint.jointHookTail,tieFirstStart:joint.jointFirstStart,tieFirstEnd:joint.jointFirstEnd,crossTieBarPairs:joint.jointCrossTieBarPairs,crossTieHookSides:joint.jointCrossTieHookSides,crossTiePlaneOffsets:joint.jointCrossTiePlaneOffsets},{B:.4,H:.4,length:joint.jointPanelHeight});
 assert.equal(cage.status,'OK',JSON.stringify(cage));
 joint.jointCrossTiePlaneOffsets=cage.planeOffsets;joint.jointCrossTieHookSides=cage.hookSides;
 const commands=[{type:'material-record',id:'HOOP',version:1,name:'Explicit 400 MPa hoop steel',kind:'steel',E:200000,nu:.3,density:7.85,Fy:400,Fu:460,sourceReference:'synthetic input',edition:'fixture',sourceNote:'not a certificate',basisStatus:'assumed',product:'rebar',grade:'SD400'},...['COL','BEAM'].map(id=>({type:'section-record',id,version:1,name:id,sourceNote:'synthetic',shape:'RECT',dimensionUnit:'mm',B:id==='COL'?400:300,H:id==='COL'?400:300})),{...base,id:'RC',memberId:'AB',bars:fit.bars.map(b=>({...b,diameter:b.diameter*1000}))},{...base,id:'RU',memberId:'BD',bars:fit.bars.map(b=>({...b,diameter:b.diameter*1000}))},{...base,id:'RB',memberId:'BC',bars:[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.09,z:(y>0?-1:1)*(z>0?.10:.05),diameter:10}))),startExtension:.19,startFabricationShape:'L90',endFabricationShape:'straight',startBendInsideRadius:.03,startHookTailLength:.12,endSetbackStart:.04,endSetbackEnd:.04},joint];
 const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'joint-profile-preview',commands});
 assert.equal((await ctx.call('apply_design_changes',{handle:preview.handle,requestId:'joint-profile-input'})).ok,true);
 const {prepareJointHoopGeometry}=await import('../src/design/connection/jointHoopGeometry.js');
 const {evaluateJointCongestion}=await import('../src/design/connection/jointCongestion.js');
 const {jointTransverseLongitudinalAssembly}=await import('../src/design/connection/jointTransverseLongitudinalAssembly.js');
 const record=m.designDetails.connections[0],beam=m.designDetails.reinforcement.find(r=>r.id==='RB'),original=beam.bars;
 const prepared=prepareJointHoopGeometry(m,record),rows=[];
 for(const y of [-.105,-.09,-.07,-.05,.05,.07,.09,.105])for(const z of [-.105,-.075,-.045,.045,.075,.105]){
  beam.bars=[{...original[0],y,z}];const paths=evaluateJointCongestion(m,record);
  if(paths.status!=='OK')continue;
  const assembly=jointTransverseLongitudinalAssembly(prepared,{...paths,barPaths:paths.barPaths.filter(b=>b.id.startsWith('BC:'))});
  if(assembly.status==='OK')rows.push({y,z,clearance:assembly.checks[0].clearanceLowerBound});
 }
 beam.bars=original;console.log(JSON.stringify(rows));
 mkdirSync('output/phase25',{recursive:true});writeFileSync('output/phase25/joint-layout-probe.json',JSON.stringify({scope:'48 single bar geometry probes; combined arrangement still requires all checks',rows},null,2));
}finally{await ctx.dispose();}
