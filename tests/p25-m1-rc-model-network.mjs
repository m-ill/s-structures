import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {prepareRcModelNetwork} from '../src/compute/product/rcModelNetwork.js';
import {solveRcLapNetwork} from '../src/solver/rcLapNetwork.js';
const m=createModel();m.analysisSettings.shearDeformation=false;
m.nodes=[{id:'A',x:0,y:0,z:0,support:'fixed'},{id:'B',x:2,y:0,z:0},{id:'C',x:4,y:0,z:0}];
m.members=[{id:'M1',n1:'A',n2:'B',matId:'concrete',secId:'rc3060'},{id:'M2',n1:'B',n2:'C',matId:'concrete',secId:'rc3060'}];
const bars=[[-.2,-.08],[-.2,.08],[.2,-.08],[.2,.08]].map(([y,z])=>({y,z,area:Math.PI*.02**2/4,diameter:.02}));
m.designDetails={reinforcement:m.members.map((x,i)=>({id:`R${i+1}`,version:1,memberId:x.id,start:0,end:1,bars,cover:.04,barMaterialId:'steel@1'})),splices:[{id:'SP',version:1,memberId:'M2',reinforcementId:'R2@1',barIndices:['1'],start:.25,end:.75,offsetY:.02,offsetZ:0,spliceType:'tension-B',continuationSide:'offset-toward-end',transferStiffness:80000,transferElasticSlipLimit:.001,transferReference:'synthetic'}]};
m.loads=[{id:'F',type:'nodal',node:'C',case:'D',dir:'-x',P:100},{id:'T',type:'nmoment',node:'C',case:'L',dir:'+x',M:2}];m.loadCombinations=[{id:'S',type:'service',factors:{D:1,L:.5}}];
const original=structuredClone(m),n=prepareRcModelNetwork(m,{comboId:'S'});
assert.equal(n.nodes.length,5);assert.deepEqual(n.elements.map(e=>e.nodes),[[0,1],[1,3],[3,4],[4,2]]);assert.deepEqual(n.fixedDofs,[0,1,2,3,4,5]);
assert.equal(n.loads[12],-100);assert.equal(n.loads[15],1);assert.equal(n.loadSources[1].factor,.5);assert.equal(n.sources[2].memberId,'M2');assert.deepEqual(m,original);
const result=solveRcLapNetwork(n);assert.equal(result.ok,true,JSON.stringify(result));assert.ok(result.displacements[12]<0);assert.ok(Math.abs(result.reactions[0]-100)<1e-5);assert.ok(Math.abs(result.reactions[3]+1)<1e-5);
const changed=structuredClone(m);changed.loads.push({id:'U',type:'temperature',member:'M1',case:'D',dir:'-z',w:1});assert.throws(()=>prepareRcModelNetwork(changed,{comboId:'S'}),{code:'RC_MODEL_TEMPERATURE_INPUT_INVALID'});
const settlement=structuredClone(m);settlement.nodes[0].prescribedDisplacement={ux:.001};const settled=prepareRcModelNetwork(settlement,{comboId:'S'});assert.equal(settled.prescribedDofs[0].value,.001);const settledResult=solveRcLapNetwork(settled);assert.equal(settledResult.ok,true);assert.ok(Math.abs(settledResult.displacements[12]-result.displacements[12]-.001)<1e-9);
const diaphragm=structuredClone(m);diaphragm.diaphragms=[{id:'D'}];assert.throws(()=>prepareRcModelNetwork(diaphragm,{comboId:'S'}),{code:'RC_MODEL_RIGID_DIAPHRAGM_REQUIRED'});
console.log('PASS original model shared nodes, actual supports, signed factored nodal forces/moments, assembly and omitted-feature rejection');

const shear=structuredClone(m);shear.members[0].includeShearDeformation=true;assert.throws(()=>prepareRcModelNetwork(shear,{comboId:'S'}),{code:'RC_MODEL_SHEAR_DEFORMATION_REQUIRED'});
const spring=structuredClone(m);spring.members[0].foundationId='W';assert.throws(()=>prepareRcModelNetwork(spring,{comboId:'S'}),{code:'RC_MODEL_FOUNDATION_ASSEMBLY_REQUIRED'});

const distributed=structuredClone(m);distributed.loads.push({id:'Q',type:'udl',member:'M2',case:'D',dir:'-z',w:.1});
const prepared=prepareRcModelNetwork(distributed,{comboId:'S'}),distributedResult=solveRcLapNetwork(prepared);assert.equal(distributedResult.ok,true,JSON.stringify(distributedResult));
assert.ok(Math.abs(distributedResult.reactions[2]-.2)<1e-6);assert.ok(Math.abs(distributedResult.reactions[4]+.6)<1e-6);
assert.equal(prepared.distributedLoadsIncluded,true);assert.ok(prepared.elements.filter(e=>e.memberLoads?.length).length===3);
assert.ok(Math.abs(distributedResult.elementResults.at(-1).boundaryEndForces[7])<1e-6);
assert.ok(Math.abs(distributedResult.elementResults.at(-1).endForces[7])>1e-3);
console.log('PASS distributed load assembled across splice boundaries: reactions and physical free-end boundary force');

const gravity=structuredClone(m);gravity.analysisSettings.includeSelfWeight=true;gravity.loadCombinations[0].factors.D=1.2;
const weighted=prepareRcModelNetwork(gravity,{comboId:'S'}),wr=solveRcLapNetwork(weighted);assert.equal(wr.ok,true,JSON.stringify(wr));
const expectedWeight=2.4*9.80665*.18*4*1.2;
assert.ok(Math.abs(wr.reactions[2]-expectedWeight)<1e-5);assert.ok(Math.abs(wr.reactions[4]+expectedWeight*2)<1e-5);
assert.equal(weighted.selfWeightIncluded,true);assert.equal(new Set(weighted.loadSources.filter(s=>s.generatedSelfWeight).map(s=>s.loadId)).size,2);
assert.equal(gravity.loads.length,2);
const collision=structuredClone(gravity);collision.loads.push({id:'sw_M1',type:'udl',member:'M1',case:'D',dir:'-z',w:1});assert.throws(()=>prepareRcModelNetwork(collision,{comboId:'S'}),{code:'RC_MODEL_SELF_WEIGHT_ID_COLLISION'});
console.log('PASS generated source self-weight: independent bulk weight, combination factor, no duplication or source mutation');

const overridden=structuredClone(m);overridden.members[0].customProps={E:1000};assert.throws(()=>prepareRcModelNetwork(overridden,{comboId:'S'}),{code:'RC_MESH_MEMBER_KINEMATICS_REQUIRED'});

const concentrated=structuredClone(m);concentrated.loads.push({id:'P',type:'point',member:'M2',case:'D',t:.25,dir:'-z',P:.1},{id:'MC',type:'mmoment',member:'M2',case:'D',at:.75,coordinate:'global',dir:'+y',M:.2});
const cp=prepareRcModelNetwork(concentrated,{comboId:'S'}),cr=solveRcLapNetwork(cp);assert.equal(cr.ok,true,JSON.stringify(cr));assert.ok(Math.abs(cr.reactions[2]-.1)<1e-6);assert.ok(Math.abs(cr.reactions[4]+.45)<1e-6);
assert.equal(cp.loadSources.filter(l=>l.loadId==='P').length,1);assert.equal(cp.loadSources.filter(l=>l.loadId==='MC').length,1);assert.equal(cp.concentratedMemberLoadsIncluded,true);
console.log('PASS actual model concentrated load at splice boundaries without duplicate assembly');
