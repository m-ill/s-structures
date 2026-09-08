import assert from 'node:assert/strict';
import { createModel } from '../src/core/model.js';
import { stableHash } from '../src/core/stableHash.js';
import { createDesignInputService } from '../src/modeling/designInputService.js';
import { DESIGN_INPUT_UNITS as units } from '../src/modeling/designInputCommands.js';
import { normalizeProductAnalysisCaseSettings } from '../src/compute/product/analysisCaseSettings.js';
import { KDS_41_12_00_2022_RULE_PACK } from '../src/core/kdsLoadCombinations.js';

export function fixture(rc=false) {
  const m=createModel();m.meta={id:'P19-M2'};
  m.nodes=[{id:'N1',x:0,y:0,z:0,support:'fixed'},{id:'N2',x:0,y:0,z:3},{id:'N3',x:4,y:0,z:3}];
  m.members=[{id:'M1',type:'frame',n1:'N1',n2:'N2',matId:rc?'concrete':'steel',secId:rc?'rc3060':'h300'},{id:'M2',type:'frame',n1:'N2',n2:'N3',matId:rc?'concrete':'steel',secId:rc?'rc3060':'h300'}];
  m.loadCases=[{id:'D',type:'dead'}];m.loadCombinations=[{id:'D1',name:'Dead',type:'service',factors:{D:1}}];
  m.loads=[{id:'P1',type:'nodal',node:'N2',P:10,dir:'-z',case:'D',origin:'manual',userModified:true}];
  m.analysisCases=[{id:'AC1',name:'Static',kind:'static',settings:{comboId:'D1',pDeltaMethod:'off'},status:'ok',lastRun:{id:'old'}}];
  return m;
}
const request=(commands,id='r1')=>({requestId:id,units:{...units},commands});
const design={type:'member-design',memberIds:['M1'],patch:{Ky:1.2}};
const must=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result;};
let checks=0;
function check(name,fn) {fn();checks++;console.log(`PASS ${name}`);}

check('atomic multi-command application, replay, one undo and monotonic invalidation',()=>{
  const m=fixture(),before=structuredClone(m);let notifications=0;
  const s=createDesignInputService({getModel:()=>m,onCommitted:()=>notifications++});
  const p=must(s.preview(request([design,{type:'node-mass',nodeIds:['N2'],mass:[1,2,3],unit:'kN.s2/m'}])));
  assert.deepEqual(m,before);assert.deepEqual(p.affectedMemberIds,['M1','M2']);assert.ok(p.changes.length===2);
  const receipt=must(s.apply(p));assert.equal(receipt.undoDepth,1);assert.equal(m.analysisCases[0].status,'stale');
  assert.equal(m.designParams.members.M1.Ky,1.2);assert.deepEqual(m.nodes[1].mass,[1,2,3]);
  assert.equal(s.apply(p).replayed,true);assert.equal(notifications,1);
  must(s.undo());assert.equal(m.meta.p19InputRevision,2);assert.equal(m.designParams.members.M1,undefined);assert.equal(m.nodes[1].mass,undefined);
  assert.notEqual(s.getContext().inputIdentity.inputHash,p.sourceIdentity.inputHash);assert.equal(s.apply(p).undone,true);assert.equal(notifications,2);
  assert.equal(s.preview(request([{...design,patch:{Ky:2}}])).code,'REQUEST_ID_CONFLICT');
});
check('tampered preview, stale model, project switch and undo after external edit',()=>{
  let m=fixture();const s=createDesignInputService({getModel:()=>m}),p=must(s.preview(request([design])));
  assert.equal(s.apply({...p,affectedMemberIds:[]}).code,'PREVIEW_INVALID');
  m.nodes[1].x=1;assert.equal(s.apply(p).code,'STALE_INPUT');m=fixture();assert.equal(s.apply(p).code,'PROJECT_CHANGED');
  must(s.apply(must(s.preview(request([design],'second')))));m.nodes[1].x=2;assert.equal(s.undo().code,'UNDO_STALE');
});
check('policy rechecked at apply and undo; role and readonly failures do not mutate',()=>{
  for(const field of ['locked','approvalState']) {
    const m=fixture(),s=createDesignInputService({getModel:()=>m}),p=must(s.preview(request([design])));
    m.workflow={...(m.workflow||{}),[field]:field==='locked'?true:'released'};const before=stableHash(m);
    assert.equal(s.apply(p).code,'WORKFLOW_LOCKED');assert.equal(s.undo().code,'WORKFLOW_LOCKED');assert.equal(stableHash(m),before);
  }
  const m=fixture();let allowed=true;const s=createDesignInputService({getModel:()=>m,canEdit:()=>allowed}),p=must(s.preview(request([design])));
  allowed=false;assert.equal(s.apply(p).code,'EDIT_FORBIDDEN');allowed=true;
  Object.freeze(m);const before=stableHash(m);assert.equal(s.apply(p).code,'MODEL_NOT_WRITABLE');assert.equal(stableHash(m),before);
});
check('partial failure, duplicate IDs, unknown fields, nonfinite, unit and reference rejection',()=>{
  const bad=[{...design,memberIds:['M1','M1']},{...design,memberIds:['missing']},{...design,patch:{unknown:1}},
    {...design,patch:{Ky:NaN}},{...design,patch:{Ky:Infinity}},{...design,reviewer:'forged'},
    {type:'member-assignment',memberIds:['M1'],matId:'missing'},
    {type:'load-case',mode:'create',id:'D',name:'dup',loadType:'dead'},
    {type:'node-mass',nodeIds:['N2'],mass:[1,1,1],unit:'kg'},
    {type:'analysis-case',mode:'create',id:'BAD',name:'bad',kind:'modal',settings:{massSource:'missing'}},
    {type:'analysis-case',mode:'create',id:'BAD',name:'bad',kind:'static',settings:{comboId:''}}];
  for(const command of bad) {
    const m=fixture(),before=stableHash(m),s=createDesignInputService({getModel:()=>m});
    assert.equal(s.preview(request([design,command])).ok,false,JSON.stringify(command));assert.equal(stableHash(m),before);
  }
  const m=fixture(),s=createDesignInputService({getModel:()=>m});
  assert.equal(s.preview({...request([design]),units:{...units,length:'mm'}}).code,'UNITS_MISMATCH');
  assert.equal(s.preview({...request([design]),approval:{reviewer:'agent'}}).code,'UNSUPPORTED_FIELDS');
});
check('basis, generated loads and explicit mass settings survive canonical mapping',()=>{
  const m=fixture(),s=createDesignInputService({getModel:()=>m});
  const p=must(s.preview(request([{type:'design-basis',patch:{designMethod:'strength',floorArea:20,roofArea:20,windPressureX:0.9,seismicCoefficientY:0.2}},{type:'generate-loads'}])));
  must(s.apply(p));assert.equal(m.designBasis.windPressureX,0.9);assert.equal(m.designBasis.seismicCoefficientY,0.2);
  assert.equal(m.loads.find(x=>x.id==='P1').P,10);assert.ok(m.loads.length>1);assert.ok(m.loadEstimation.storyLoads.lateral.length);
  const q=must(s.preview(request([{type:'mass-source',id:'MS',entries:[{case:'D',factor:1}],includeNodeMass:true,includeMemberMass:false,includeSelfWeight:false,gravity:9.81,activate:true},
    {type:'analysis-case',mode:'create',id:'MOD',name:'Modal',kind:'modal',settings:{modalModeCount:2,massSource:'MS'}}],'mass')));
  must(s.apply(q));const settings=normalizeProductAnalysisCaseSettings('modal',m.analysisCases.find(x=>x.id==='MOD').settings);
  assert.equal(settings.massSource.id,'MS');assert.equal(settings.massSource.includeNodeMass,true);assert.equal(settings.massSource.gravity,9.81);
});
check('all elastic case settings reach product normalization',()=>{
  const m=fixture(),s=createDesignInputService({getModel:()=>m});
  const settingsByKind={static:{comboId:'D1',pDeltaMethod:'direct'},modal:{modalModeCount:2,prestressed:true,gravityCombinationId:'D1'},responseSpectrum:{modalModeCount:2,spectrum:{method:'CQC',directions:['x'],dampingRatio:0.03,scale:9.81,points:[{period:0,sa:0.4},{period:1,sa:0.2}]}},buckling:{modeCount:2,maxIterations:40,preloadCombinationId:'D1'},linearTha:{integration:'direct',direction:'x',dampingRatio:0.04,dt:0.01,accelerations:[0,0.1,-0.1],accelerationUnit:'g',accelerationScale:2,timeUnit:'s'}};
  const commands=Object.entries(settingsByKind).map(([kind,settings])=>({type:'analysis-case',mode:'create',id:kind,name:kind,kind,settings}));
  must(s.apply(must(s.preview(request(commands)))));
  for(const [kind,settings] of Object.entries(settingsByKind)) {
    const row=m.analysisCases.find(x=>x.id===kind),effective=normalizeProductAnalysisCaseSettings(kind,row.settings);
    for(const [key,value] of Object.entries(settings)) assert.deepEqual(effective[key],key==='spectrum'?{enabled:true,...value}:value,`${kind}.${key}`);
  }
  must(s.apply(must(s.preview(request([{type:'analysis-case',mode:'update',id:'static',name:'Revised',kind:'static',settings:{pDeltaMethod:'off'}}],'update')))));
  assert.equal(m.analysisCases.find(x=>x.id==='static').settings.comboId,'D1');
});
check('candidate combination approval cannot be fabricated in commands',()=>{
  const m=fixture(),s=createDesignInputService({getModel:()=>m});
  const command={type:'generate-combinations',rulePackId:KDS_41_12_00_2022_RULE_PACK.id,method:'strength'};
  const before=stableHash(m);assert.equal(s.preview(request([command])).ok,false);assert.equal(stableHash(m),before);
  assert.equal(s.preview(request([{...command,projectApproval:{reviewer:'agent',approved:true}}])).code,'UNSUPPORTED_FIELDS');
});
check('load types and manual combination preserve values',()=>{
  const m=fixture(),s=createDesignInputService({getModel:()=>m});
  const values=[{id:'F',type:'nodal',node:'N3',P:4,unit:'kN'},{id:'U',type:'udl',member:'M2',w:3,unit:'kN/m'},{id:'NM',type:'nmoment',node:'N3',M:2,unit:'kN.m'},{id:'MM',type:'mmoment',member:'M2',M:1,at:0.5,unit:'kN.m'}];
  const commands=[{type:'load-case',mode:'create',id:'X',name:'Live',loadType:'live'},...values.map(value=>({type:'load',mode:'create',value:{...value,dir:'-z',case:'X'}})),{type:'combination',mode:'create',id:'C2',name:'Manual',purpose:'strength',factors:{D:1.2,X:1.6}}];
  must(s.apply(must(s.preview(request(commands)))));for(const v of values) for(const [key,value] of Object.entries(v)) assert.deepEqual(m.loads.find(x=>x.id===v.id)[key],value);
  assert.deepEqual(m.loadCombinations.find(x=>x.id==='C2').factors,{D:1.2,X:1.6});
});
check('notification failure is successful commit; identity failure precedes mutation',()=>{
  const m=fixture(),s=createDesignInputService({getModel:()=>m,onCommitted:()=>{throw Error('draw unavailable');}});
  const result=must(s.apply(must(s.preview(request([design])))));assert.equal(result.notificationWarning,'draw unavailable');assert.equal(m.designParams.members.M1.Ky,1.2);
  const n=fixture(),before=stableHash(n),v=createDesignInputService({getModel:()=>n,getIdentity:model=>{if(model.meta.p19InputRevision) throw Error('identity unavailable');return s.getContext().inputIdentity;}});
  assert.equal(v.apply(must(v.preview(request([design])))).ok,false);assert.equal(stableHash(n),before);
});
check('rotational mass preserved, member aliases unambiguous, mass source references refreshed',()=>{
  const m=fixture();m.nodes[1].mass=[1,1,1,4,5,6];m.designParams.members.M1={Lb:3,C1:1.2};
  const s=createDesignInputService({getModel:()=>m});
  must(s.apply(must(s.preview(request([{type:'node-mass',nodeIds:['N2'],mass:[2,2,2],unit:'kN.s2/m'},{type:'member-design',memberIds:['M1'],patch:{LbZ:2,Cb:1.1}}])))));
  assert.deepEqual(m.nodes[1].mass,[2,2,2,4,5,6]);assert.equal(m.designParams.members.M1.Lb,undefined);assert.equal(m.designParams.members.M1.C1,undefined);
  assert.equal(s.preview(request([{...design,patch:{C1:1,Cb:2}}],'ambiguous')).code,'AMBIGUOUS_DESIGN_FIELDS');
  assert.equal(s.preview(request([{...design,patch:{cover:0.05}}],'material')).code,'MEMBER_DESIGN_MATERIAL_MISMATCH');
  const mass={type:'mass-source',id:'MS',entries:[{case:'D',factor:1}],activate:true};
  must(s.apply(must(s.preview(request([mass,{type:'analysis-case',mode:'create',id:'MOD',name:'Modal',kind:'modal',settings:{massSource:'MS'}}],'mass-create')))));
  must(s.apply(must(s.preview(request([{...mass,gravity:9.8}],'mass-update')))));
  assert.equal(m.analysisCases.find(x=>x.id==='MOD').settings.massSource.gravity,9.8);
});
check('trusted rule-pack revocation is rechecked without changing production qualification',()=>{
  const m=fixture();
  // Synthetic host policy fixture only. Runtime KDS constants are untouched.
  let pack={...structuredClone(KDS_41_12_00_2022_RULE_PACK),id:'TEST-PACK',status:'verified',publicationStatus:'effective',automationStatus:'enabled',verifiedAt:'2026-09-07',sourceHash:'test-fixture-only'};
  const s=createDesignInputService({getModel:()=>m,resolveRulePack:id=>id===pack.id?pack:null});
  const command={type:'generate-combinations',rulePackId:'TEST-PACK',method:'strength'};
  const p=must(s.preview(request([command]))),before=stableHash(m);
  pack.status='candidate';assert.equal(s.apply(p).ok,false);assert.equal(stableHash(m),before);
  pack.status='verified';must(s.apply(p));assert.ok(m.loadCombinations.length>1);
  assert.equal(KDS_41_12_00_2022_RULE_PACK.status,'candidate');
});
console.log(`P19 M2 service: ${checks} scenarios PASS`);
