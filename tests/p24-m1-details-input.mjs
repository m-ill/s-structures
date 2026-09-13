import assert from 'node:assert/strict';
import { designContext } from './fixtures/p24/context.js';
import { designInputCommandFromFields } from '../src/ui/indexDesignInput.js';
import {evaluateProvidedAnchorage} from '../src/design/rc/providedAnchorage.js';
const ctx=designContext();
ctx.model.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:0,y:0,z:3},{id:'C',x:3,y:0,z:3}];
ctx.model.members=[{id:'COL',type:'frame',n1:'A',n2:'B',matId:'concrete',secId:'h300'},{id:'BEAM',type:'frame',n1:'B',n2:'C',matId:'concrete',secId:'h300'}];
const bars=[{y:-0.18,z:-0.08,diameter:16},{y:-0.18,z:0.08,diameter:16},{y:0.18,z:-0.08,diameter:16},{y:0.18,z:0.08,diameter:16}];
const cmds=[
  {type:'section-record',id:'R',name:'Synthetic rectangle',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'test'},
  {type:'member-assignment',memberIds:['BEAM','COL'],secId:'R@1'},
  {type:'reinforcement-record',id:'RB',name:'Synthetic beam reinforcement',version:1,memberId:'BEAM',start:0,end:1,cover:0.04,barMaterialId:'steel@1',bars,stirrupDiameter:10,stirrupLegs:2,stirrupSpacing:150,sourceNote:'test',locked:true},
  {type:'connection-record',id:'J',name:'Synthetic joint',version:1,nodeId:'B',memberIds:['COL','BEAM'],connectionType:'rc-joint',restraint:'rigid',sourceNote:'test',barMaterialId:'steel@1',tieDiameter:10,tieSpacing:100,tieLegs:2,anchorageLength:0.6},
  {type:'ground-record',id:'G',name:'Synthetic ground',version:1,allowableBearing:150,bearingBasis:'gross',friction:0,sourceReference:'synthetic only',sourceNote:'not site data',basisStatus:'assumed'},
  {type:'foundation-record',id:'F',name:'Synthetic footing',version:1,nodeId:'A',foundationType:'isolated',B:2,L:2,thickness:0.5,cover:0.05,materialId:'concrete@1',groundId:'G@1',sourceNote:'test',barMaterialId:'steel@1',bottomDiameterB:16,bottomDiameterL:19,bottomSpacingB:150,bottomSpacingL:200},
];
Object.assign(cmds[2],{anchorageStandard:'KDS-142052-2024',anchorageMode:'straight-tension',reinforcementForm:'single-deformed',concreteWeight:'normal',barPosition:'other',barCoating:'uncoated',lapRequired:false,anchorageLength:1});
Object.assign(cmds[2],{strengthStandard:'KDS-142020-2022',serviceabilityMode:'instant-live-curvature',serviceBoundary:'chord',serviceDeflectionLimit:'live-floor',serviceCrackingComboId:'S-T',nonstructuralDamageSensitive:false,fabricationShape:'straight',endSetbackStart:0.06,endSetbackEnd:0.06});
Object.assign(cmds[3],{jointDesignStandard:'KDS-142080-2021-special-frame',columnMemberId:'COL',jointMaterialId:'concrete@1',concreteWeight:'normal',capacityDemandBasis:'1.25fy-capacity-design',capacityDemandReference:'synthetic',capacityDesignShearX:100,capacityDesignShearY:0});
Object.assign(cmds[5],{punchingStandard:'KDS-142022-2022',concreteWeight:'normal',barCoating:'uncoated'});
try {
  const hash=ctx.bridge.getWorkflowInputIdentity().inputHash;
  const plan=await ctx.call('preview_design_changes',{inputHash:hash,requestId:'T03-preview',commands:cmds});
  assert.equal(ctx.bridge.getWorkflowInputIdentity().inputHash,hash);
  await ctx.call('apply_design_changes',{handle:plan.handle,requestId:'T03-apply'});
  const read=(channel,id)=>ctx.call('get_design_records',{channel,id,version:1});
  const rb=(await read('reinforcement','RB')).rows[0];
  assert.equal(rb.bars[0].diameter,0.016);
  assert.ok(Math.abs(rb.bars[0].area-Math.PI*0.016**2/4)<1e-15);
  assert.equal(rb.stirrups.spacing,0.15);
  assert.equal(rb.locked,true);
  assert.equal(rb.anchorageStandard,'KDS-142052-2024');
  assert.equal(rb.lapRequired,false);
  assert.equal(rb.strengthStandard,'KDS-142020-2022');assert.equal(rb.nonstructuralDamageSensitive,false);
  assert.equal(rb.fabricationShape,'straight');
  assert.equal((await read('connections','J')).rows[0].capacityDesignShearY,0);
  assert.equal((await read('foundations','F')).rows[0].punchingStandard,'KDS-142022-2022');
  const member=ctx.model.members.find(x=>x.id==='BEAM');
  const anchor=evaluateProvidedAnchorage(ctx.model,member,[rb]);
  assert.equal(anchor.status,'OK');
  assert.equal(anchor.calculations.length,4);
  assert.equal(anchor.calculations[0].source.edition,'2024');
  assert.equal(evaluateProvidedAnchorage(ctx.model,member,[{...rb,anchorageLength:0.1}]).status,'NG');
  assert.equal(evaluateProvidedAnchorage(ctx.model,member,[{...rb,lapRequired:undefined}]).reason,'SPLICE_APPLICABILITY_REQUIRED');
  assert.deepEqual((await read('connections','J')).rows[0].memberIds,['COL','BEAM']);
  assert.equal((await read('ground','G')).rows[0].basisStatus,'assumed');
  assert.equal((await read('foundations','F')).rows[0].groundId,'G@1');
  assert.equal((await read('connections','J')).rows[0].reinforcement.spacing,0.1);
  assert.equal((await read('foundations','F')).rows[0].reinforcement.bottomL.diameter,0.019);
  const form=designInputCommandFromFields('reinforcement-record',{...cmds[2],bars:bars.map(b=>`${b.y},${b.z},${b.diameter}`).join('\n'),locked:'true'});
  assert.deepEqual(form,cmds[2]);
  const current=ctx.bridge.getWorkflowInputIdentity().inputHash;
  for(const [suffix,bad] of [
    ['outside',{...cmds[2],id:'OUT',bars:[{y:1,z:0,diameter:16}]}],
    ['unknown-ground',{...cmds[5],id:'BAD',groundId:'missing@1'}],
    ['wrong-joint',{...cmds[3],id:'BAD-J',nodeId:'A'}],
    ['duplicate-bars',{...cmds[2],id:'DUP',bars:[bars[0],bars[0]]}],
    ['overlapping-bars',{...cmds[2],id:'OVERLAP',bars:[bars[0],{...bars[0],y:bars[0].y+0.001}]}],
  ]) await assert.rejects(ctx.call('preview_design_changes',{inputHash:current,requestId:`T03-${suffix}`,commands:[bad]}));
  assert.equal(ctx.bridge.getWorkflowInputIdentity().inputHash,current);
  console.log('PASS T03/T18 reinforcement geometry/units, connections, ground/footing references, transaction, UI/WebMCP');
} finally {await ctx.dispose();}
