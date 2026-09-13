import {normalizeGeneralConstraints} from '../../core/constraintDefinitions.js';
import {rcThermalInitialStrains} from './rcThermalInitialStrains.js';
import {resolveRigidDiaphragms} from '../../core/diaphragmGroups.js';
import {diaphragmNodeIds} from '../../core/diaphragmGroupSource.js';
import {createSelfWeightLoads} from '../../solver/linear3dPost.js';
import {materialOf} from '../../core/catalogs.js';
import {memberAxes} from '../../core/memberAxes.js';
import {partitionRcMemberLoad} from './rcMemberLoadPartition.js';
import {resolveMemberShearDeformationSetting} from '../../core/shearDeformation.js';
import {prepareRcSpliceMemberMesh} from './rcSpliceMemberMesh.js';
import {buildFixedDofs,collectPrescribedDofs} from '../../solver/domain/supportConstraints.js';
import {resolveLoadDirection} from '../../loads/fixedEnd/common.js';
import {resolveMomentDirection} from '../../loads/momentDirection.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
export function prepareRcModelNetwork(model,{comboId,subdivisions=16,frameDivisions=1,slipOrder=1}){
 if(![1,2].includes(slipOrder))throw Error('RC_MESH_SLIP_ORDER_INVALID');
 if(typeof comboId!=='string'||!comboId||!Number.isInteger(subdivisions)||subdivisions<1||subdivisions>64)fail('RC_MODEL_NETWORK_INPUT_INVALID');
 const combo=model.loadCombinations?.find(c=>c.id===comboId&&c.enabled!==false);
 if(!combo||!combo.factors||!Object.keys(combo.factors).length||Object.entries(combo.factors).some(([id,v])=>!Number.isFinite(v)||!model.loadCases?.some(c=>c.id===id)))fail('RC_MODEL_COMBINATION_REQUIRED');
 if(['shells','slabs','links'].some(k=>model[k]?.length))fail('RC_MODEL_COMPONENT_ASSEMBLY_REQUIRED');
 const settings=model.analysisSettings||{};
 const pDeltaMethod=settings.pDeltaMethod??(settings.includeGeometricStiffness===true?'direct':'off');
 if(!['off','direct'].includes(pDeltaMethod)||settings.includeGeometricStiffness===true&&pDeltaMethod==='off')fail('RC_MODEL_PDELTA_ASSEMBLY_REQUIRED');
 if(!Array.isArray(model.nodes)||model.nodes.length<2||model.nodes.length>20||new Set(model.nodes.map(n=>n.id)).size!==model.nodes.length||model.nodes.some(n=>typeof n.id!=='string'||![n.x,n.y,n.z].every(Number.isFinite)))fail('RC_MODEL_NODES_INVALID');
 if(!Array.isArray(model.members)||!model.members.length||model.members.length>20||new Set(model.members.map(m=>m.id)).size!==model.members.length||model.members.some(m=>m.type!=null&&m.type!=='frame'||m.behavior!=null&&m.behavior!=='frame'))fail('RC_MODEL_FRAME_MEMBERS_REQUIRED');
 if(model.nodes.some(n=>n.support!=null&&!['free','fixed','pin','roller','custom','spring'].includes(n.support)||n.support==='custom'&&(!Array.isArray(n.fix)||n.fix.length!==6||n.fix.some(v=>typeof v!=='boolean'))))fail('RC_MODEL_SUPPORT_MAPPING_REQUIRED');
 if(model.nodes.some(n=>n.panelZone!=null))fail('RC_MODEL_PANEL_ZONE_ASSEMBLY_REQUIRED');
 const fixed=buildFixedDofs(model.nodes),prescribed=collectPrescribedDofs(model.nodes,fixed);
 if(!prescribed.ok)fail(prescribed.errors[0].code);
 const generalConstraints=model.constraints||[];if(!Array.isArray(generalConstraints)||generalConstraints.length>20||generalConstraints.some(c=>c?.type==='mpc'&&(!Array.isArray(c.terms)||c.terms.length>120)))fail('RC_GENERAL_CONSTRAINT_LIMIT');
 const normalizedConstraints=normalizeGeneralConstraints(generalConstraints,model.nodes,{fixedDofs:fixed});if(!normalizedConstraints.ok)fail(normalizedConstraints.reason);
 const springDofs=[],springKeys=['kx','ky','kz','krx','kry','krz'],displacementKeys=['ux','uy','uz','rx','ry','rz'];
 for(const [i,node] of model.nodes.entries())if(node.support==='spring'){
  if(!node.spring||typeof node.spring!=='object'||Array.isArray(node.spring)||Object.keys(node.spring).some(k=>!springKeys.includes(k)))fail('RC_MODEL_SPRING_INPUT_INVALID');
  const before=springDofs.length;
  for(let j=0;j<6;j++){
   const stiffness=Number(node.spring[springKeys[j]]??0),reference=Number(node.settlement?.[springKeys[j]]??node.settlement?.[displacementKeys[j]]??0);
   if(!Number.isFinite(stiffness)||stiffness<0||!Number.isFinite(reference))fail('RC_MODEL_SPRING_INPUT_INVALID');
   if(stiffness>0)springDofs.push({fullDof:6*i+j,nodeId:node.id,component:displacementKeys[j],stiffness,reference});
  }
  if(springDofs.length===before)fail('RC_MODEL_SPRING_INPUT_INVALID');
 }
 const diaphragmGroups=resolveRigidDiaphragms(model);
 if((model.diaphragms||[]).some(d=>d.type!=='rigid'||diaphragmNodeIds(d,model).some(id=>!model.nodes.some(n=>n.id===id)))||diaphragmGroups.length!==(model.diaphragms||[]).length)fail('RC_MODEL_RIGID_DIAPHRAGM_REQUIRED');
 const nodes=model.nodes.map(n=>({id:n.id,x:n.x,y:n.y,z:n.z})),nodeSources=model.nodes.map(n=>({nodeId:n.id})),index=new Map(model.nodes.map((n,i)=>[n.id,i])),elements=[],sources=[],fixedSlipIds=[],slipSources=[];
 for(const member of model.members){
  const shear=resolveMemberShearDeformationSetting(model,member);if(!shear.valid||shear.requested)fail('RC_MODEL_SHEAR_DEFORMATION_REQUIRED');
  if(member.foundationId)fail('RC_MODEL_FOUNDATION_ASSEMBLY_REQUIRED');
  const mesh=prepareRcSpliceMemberMesh(model,{memberId:member.id,subdivisions,frameDivisions,slipOrder});
  fixedSlipIds.push(...mesh.fixedSlipIds);slipSources.push(...mesh.slipSources);
  const map=mesh.nodes.map((node,i)=>{
   const id=mesh.originalNodeIds[i];if(id!==null)return index.get(id);
   if(nodes.length>=20)fail('RC_MODEL_MESH_NODE_LIMIT');const j=nodes.length;let virtualId=`rc-virtual-${j}`;while(nodes.some(n=>n.id===virtualId))virtualId+='-';nodes.push({...node,id:virtualId});nodeSources.push({nodeId:null,memberId:member.id,x:mesh.sources[i-1].endX});return j;
  });
  mesh.elements.forEach((e,i)=>{elements.push({...e,nodes:e.nodes.map(j=>map[j])});sources.push(mesh.sources[i]);});
 }
 if(elements.length>20||elements.reduce((s,e)=>s+e.subdivisions*(e.slipOrder??1)*Math.max(1,e.laps.length),0)>256)fail('RC_LAP_NETWORK_WORK_LIMIT');
 const loads=Array(nodes.length*6).fill(0),loadSources=[];
 if(settings.includeSelfWeight===true&&model.members.some(m=>!Number.isFinite(materialOf(model,m.matId).density)||materialOf(model,m.matId).density<0))fail('RC_MODEL_SELF_WEIGHT_DENSITY_REQUIRED');
 const generatedSelfWeight=settings.includeSelfWeight===true?createSelfWeightLoads(model):[],weightIds=new Set(generatedSelfWeight.map(l=>l.id));
 if((model.loads||[]).some(l=>weightIds.has(l.id)))fail('RC_MODEL_SELF_WEIGHT_ID_COLLISION');
 for(const load of [...(model.loads||[]),...generatedSelfWeight]){
  if(!model.loadCases?.some(c=>c.id===load.case))fail('RC_MODEL_LOAD_CASE_REQUIRED');
  const factor=combo.factors[load.case]??0;if(factor===0)continue;
  if(['temperature','tgradient'].includes(load.type)){
   if(!model.members.some(m=>m.id===load.member))fail('RC_MODEL_TEMPERATURE_INPUT_INVALID');
   for(let i=0;i<elements.length;i++)if(sources[i].memberId===load.member){
    const e=elements[i],thermal=rcThermalInitialStrains(load,e,factor),{alpha,strains,depth,versions}=thermal;
    e.initialStrains??={concrete:[0,0,0],steel:[0,0,0]};
    for(const kind of ['concrete','steel'])strains[kind].forEach((v,j)=>{e.initialStrains[kind][j]+=v;});
    loadSources.push({loadId:load.id,caseId:load.case,memberId:load.member,segmentIndex:i,type:load.type,factor,...(load.type==='temperature'?{dT:load.dT}:{dTtop:load.dTtop,dTbot:load.dTbot,depth}),alpha,initialStrains:strains,initialStrain:{concrete:strains.concrete[0],steel:strains.steel[0]},thermalOwnerVersions:versions,externalNodalLoadAdded:false});
   }
   continue;
  }
  if(['udl','udl-partial','trapezoid','point','mmoment'].includes(load.type)){
   const member=model.members.find(m=>m.id===load.member);if(!member)fail('RC_MODEL_MEMBER_LOAD_TARGET_INVALID');
   const axes=memberAxes(model.nodes[index.get(member.n1)],model.nodes[index.get(member.n2)],member.localAxis),R=[axes.x,axes.y,axes.z];
   const indices=sources.map((s,i)=>s.memberId===member.id?i:-1).filter(i=>i>=0);
   const pieces=partitionRcMemberLoad({load,axes,segments:indices.map(i=>sources[i]),factor});
   for(const p of pieces){
    const i=indices[p.segmentIndex],e=elements[i];e.equivalentNodalLoads??=Array(12).fill(0);e.memberLoads??=[];
    p.localEquivalentLoads.forEach((v,j)=>{e.equivalentNodalLoads[j]+=v;});e.memberLoads.push({...p.span,loadId:load.id,caseId:load.case,factor});
    for(let end=0;end<2;end++)for(let block=0;block<2;block++)for(let g=0;g<3;g++)for(let local=0;local<3;local++)loads[6*e.nodes[end]+3*block+g]+=R[local][g]*p.localEquivalentLoads[6*end+3*block+local];
    loadSources.push({...p.source,segmentIndex:i,generatedSelfWeight:weightIds.has(load.id)});
   }
   continue;
  }
  if(!['nodal','nmoment'].includes(load.type))fail('RC_MODEL_MEMBER_LOAD_ASSEMBLY_REQUIRED');
  const node=index.get(load.node),moment=load.type==='nmoment',magnitude=moment?load.M:load.P;
  if(node===undefined||!Number.isFinite(magnitude))fail('RC_MODEL_NODAL_LOAD_INVALID');
  const direction=moment?resolveMomentDirection(load):resolveLoadDirection(load);if(!direction.ok)fail(direction.reason);
  const offset=moment?3:0;direction.global.forEach((v,i)=>{loads[node*6+offset+i]+=v*magnitude*factor;});
  loadSources.push({loadId:load.id,caseId:load.case,nodeId:load.node,type:load.type,factor,magnitude,globalDirection:direction.global});
 }
 return {version:'p25-rc-model-network-v12-general-constraints',generalConstraints:structuredClone(generalConstraints),springDofs,temperatureIncluded:loadSources.some(s=>['temperature','tgradient'].includes(s.type)),pDeltaMethod,prescribedDofs:prescribed.entries,diaphragmGroups,fixedSlipIds,slipSources,comboId,combination:structuredClone(combo),nodes,elements,sources,nodeSources,fixedDofs:[...fixed].sort((a,b)=>a-b),loads,loadSources,originalNodeCount:model.nodes.length,originalMemberCount:model.members.length,sourceSupportsUsed:true,sourceCombinationUsed:true,selfWeightEnabled:settings.includeSelfWeight===true,selfWeightIncluded:loadSources.some(s=>s.generatedSelfWeight),selfWeightBasis:'existing bulk member density times gross area; no separate lap steel mass adjustment',pDeltaIncluded:false,distributedLoadsIncluded:elements.some(e=>e.memberLoads?.some(l=>l.type==='distributed-linear')),concentratedMemberLoadsIncluded:elements.some(e=>e.memberLoads?.some(l=>l.type!=='distributed-linear')),analysisExecuted:false,designTransferAllowed:false};
}
