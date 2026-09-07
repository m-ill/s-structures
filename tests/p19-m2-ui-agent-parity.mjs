import assert from 'node:assert/strict';
import { createModel } from '../src/core/model.js';
import { installIndexEngineBridge } from '../src/ui/indexBridge.js';
import { installIndexDesignInput } from '../src/ui/indexDesignInput.js';
import { createFakeIndexDocument } from './helpers/fakeIndexDom.mjs';
import { DESIGN_INPUT_UNITS as units } from '../src/modeling/designInputCommands.js';

for(const rc of [false,true]) {
  const base=createModel();base.meta={id:'M2-parity'};
  base.nodes=[{id:'N1',x:0,y:0,z:0,support:'fixed'},{id:'N2',x:0,y:0,z:3}];
  base.members=[{id:'M1',type:'frame',n1:'N1',n2:'N2',matId:rc?'concrete':'steel',secId:rc?'rc3060':'h300'}];
  base.loadCases=[{id:'D',type:'dead'}];base.loadCombinations=[{id:'D1',name:'Dead',type:'service',factors:{D:1}}];base.loads=[];base.analysisCases=[];
  const uiModel=structuredClone(base),agentModel=structuredClone(base);
  let solves=0;
  const uiTarget={model:()=>uiModel,location:{search:''},reanalyze:()=>solves++,activeResult:()=>({old:true})};
  const uiBridge=installIndexEngineBridge(uiTarget);
  const agentTarget={model:()=>agentModel,location:{search:''},reanalyze:()=>solves++};
  installIndexEngineBridge(agentTarget);
  const doc=createFakeIndexDocument(),host=doc.createElement('div');host.setAttribute('data-ss-ribbon-panel','elastic');doc.body.appendChild(host);
  installIndexDesignInput({...uiTarget,document:doc},uiBridge);
  const panel=doc.getElementById('ssDesignInputs');assert.ok(panel);
  const click=text=>{const node=doc.querySelectorAll('button').find(x=>x.textContent===text);assert.ok(node,text);node.click();return node;};
  // FakeDOM does not implement comma selectors: use three observed collections.
  const controls=()=>['input','select','textarea'].flatMap(tag=>panel.querySelectorAll(tag));
  function add(type,values) {
    const selector=panel.querySelector('select');selector.value=type;selector.dispatchEvent({type:'change'});
    if(values.kind) {const control=controls().find(x=>x.dataset.field==='kind');control.value=values.kind;control.dispatchEvent({type:'change'});}
    for(const [key,value] of Object.entries(values)) {const control=controls().find(x=>x.dataset.field===key);assert.ok(control,key);control.value=String(value);}
    click('변경안에 추가');
  }
  const patch=rc?{cover:0.06,rebarFy:500,beamRebarRatio:0.02,columnRebarRatio:0.025}:{Ky:1.3,Kz:1.1,Lb:2,Cb:1.2};
  add('member-assignment',{memberIds:'M1',matId:rc?'concrete':'steel',secId:rc?'rc3060':'h300'});
  add('member-design',{memberIds:'M1',...patch});
  add('node-mass',{nodeIds:'N2',x:2,y:3,z:4});
  add('load-case',{mode:'create',id:'L',name:'Live',loadType:'live'});
  add('load',{mode:'create',id:'P',loadType:'nodal',targetId:'N2',case:'L',dir:'-z',magnitude:7});
  add('combination',{mode:'create',id:'C',name:'Manual',purpose:'strength',factors:'D, 1.2\nL, 1.6'});
  add('mass-source',{id:'MS',entries:'D, 1\nL, 0.25',includeNodeMass:'true',includeMemberMass:'false',includeSelfWeight:'false',activate:'true',gravity:9.81});
  add('analysis-case',{mode:'create',id:'A',name:'Static',kind:'static',comboId:'C',pDeltaMethod:'direct'});
  add('analysis-case',{mode:'create',id:'MOD',name:'Modal',kind:'modal',modalModeCount:2,massSource:'MS',prestressed:'false'});
  const before=structuredClone(uiModel);click('변경안 미리보기');assert.deepEqual(uiModel,before);
  assert.ok(!panel.querySelector('[role="status"]').textContent.startsWith('차단:'),panel.querySelector('[role="status"]').textContent+' '+panel.querySelector('pre').textContent);
  const apply=click('변경안 적용');assert.equal(apply.disabled,true);
  assert.equal(uiModel.meta.p19InputRevision,1,panel.querySelector('[role="status"]')?.textContent);
  assert.equal(uiTarget.activeResult(),null);
  assert.equal(uiBridge.getLastResult(),null);
  const commands=[{type:'member-assignment',memberIds:['M1'],matId:rc?'concrete':'steel',secId:rc?'rc3060':'h300'},
    {type:'member-design',memberIds:['M1'],patch},{type:'node-mass',nodeIds:['N2'],mass:[2,3,4],unit:'kN.s2/m'},
    {type:'load-case',mode:'create',id:'L',name:'Live',loadType:'live'},
    {type:'load',mode:'create',value:{id:'P',type:'nodal',node:'N2',case:'L',dir:'-z',P:7,unit:'kN'}},
    {type:'combination',mode:'create',id:'C',name:'Manual',purpose:'strength',factors:{D:1.2,L:1.6}},
    {type:'mass-source',id:'MS',entries:[{case:'D',factor:1},{case:'L',factor:0.25}],includeNodeMass:true,includeMemberMass:false,includeSelfWeight:false,activate:true,gravity:9.81},
    {type:'analysis-case',mode:'create',id:'A',name:'Static',kind:'static',settings:{comboId:'C',pDeltaMethod:'direct'}},
    {type:'analysis-case',mode:'create',id:'MOD',name:'Modal',kind:'modal',settings:{modalModeCount:2,massSource:'MS',prestressed:false}}];
  const agent=agentTarget.SStructuresAgent,p=agent.previewDesignInputChanges({requestId:'agent-parity',units,commands});
  assert.equal(p.ok,true,JSON.stringify(p));assert.equal(agent.applyDesignInputChanges(p).ok,true);
  assert.deepEqual(uiModel,agentModel);assert.equal(solves,0);assert.equal(agent.getDesignInputContext().undoDepth,1);
  click('설계 입력 실행취소');assert.equal(agent.undoDesignInputChanges().ok,true);assert.deepEqual(uiModel,agentModel);
  assert.equal(uiModel.meta.p19InputRevision,2);assert.equal(uiModel.nodes[1].mass,undefined);
  console.log(`PASS ${rc?'RC':'steel'}: native form events → preview → apply → canonical Agent parity → single Undo; solver count 0`);
}
