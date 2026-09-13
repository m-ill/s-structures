import {buildConstraintSystem} from './domain/constraintSystem.js';
import {localTangentGeometricStiffness12} from './geometricStiffness.js';
import {buildDiaphragmDofMap} from './diaphragmDofMap.js';
import {reduceSystem,expandReducedDisplacements} from './diaphragmReduce.js';
import {resolveReducedDofConstraints} from './diaphragmFixedDofs.js';
import {memberAxes} from '../core/memberAxes.js';
import {rcLapFrame} from './rcLapFrame.js';
import {invertPositiveMatrix} from './coupledFrameFlexibility.js';
export const RC_LAP_NETWORK_VERSION='p25-rc-lap-network-v9-first-order-boundaries';
// Explicit nodal loads, zero prescribed supports, first-order kinematics.
// No model migration, implicit load combinations or distributed-load recovery.
function solveRcLapNetworkAtAxial({nodes,elements,fixedDofs,loads,fixedSlipIds=[],diaphragmGroups=[],prescribedDofs=[],springDofs=[],generalConstraints=[],geometricAxialForces=null,maxIterations=30,tolerance=1e-7,signal}={}){
 const base={version:RC_LAP_NETWORK_VERSION,designTransferAllowed:false,globalMethodQualified:false},trace=[];
 const fail=reason=>{throw Object.assign(Error(reason),{code:reason});},started=performance.now();
 const check=()=>{if(signal?.aborted)fail('RC_LAP_NETWORK_CANCELLED');if(performance.now()-started>10000)fail('RC_LAP_NETWORK_TIME_LIMIT');};
 try{
  check();
  if(!Array.isArray(nodes)||nodes.length<2||nodes.length>20||nodes.some(n=>![n.x,n.y,n.z].every(Number.isFinite))||!Array.isArray(elements)||!elements.length||elements.length>20||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>30||!Number.isFinite(tolerance)||tolerance<=0||tolerance>1e-4)fail('RC_LAP_NETWORK_INPUT_INVALID');
  const hostCount=nodes.length*6;let count=hostCount;const slipMap=new Map();
  if(!Array.isArray(loads)||loads.length!==count||!loads.every(Number.isFinite)||!Array.isArray(fixedDofs)||new Set(fixedDofs).size!==fixedDofs.length||fixedDofs.some(i=>!Number.isInteger(i)||i<0||i>=count))fail('RC_LAP_NETWORK_INPUT_INVALID');

  const members=elements.map(e=>{
   if(!Array.isArray(e.nodes)||e.nodes.length!==2||e.nodes[0]===e.nodes[1]||e.nodes.some(i=>!Number.isInteger(i)||i<0||i>=nodes.length)||!Number.isFinite(e.GJ)||e.GJ<=0)fail('RC_LAP_NETWORK_ELEMENT_INVALID');
   if(e.equivalentNodalLoads!==undefined&&(!Array.isArray(e.equivalentNodalLoads)||e.equivalentNodalLoads.length!==12||!e.equivalentNodalLoads.every(Number.isFinite)))fail('RC_LAP_NETWORK_MEMBER_LOAD_INVALID');
   const axes=memberAxes(...e.nodes.map(i=>nodes[i]),e.localAxis);if(!(axes.L>0))fail('RC_LAP_NETWORK_ELEMENT_INVALID');
   const R=[axes.x,axes.y,axes.z],T=Array.from({length:12},(_,i)=>Array.from({length:12},(_,j)=>Math.floor(i/3)===Math.floor(j/3)?R[i%3][j%3]:0));
   const slipDofs=[];
   if(!Array.isArray(e.laps))fail('RC_LAP_NETWORK_ELEMENT_INVALID');
   for(const lap of e.laps){
    if(lap.boundarySlips!==undefined)fail('RC_LAP_NETWORK_SLIP_INPUT_INVALID');
    if(lap.slipIds===undefined)continue;
    if(!Array.isArray(lap.slipIds)||lap.slipIds.length!==4||new Set(lap.slipIds).size!==4||lap.slipIds.some(id=>typeof id!=='string'||!id||id.length>256))fail('RC_LAP_NETWORK_SLIP_INPUT_INVALID');
    const original=e.bars?.[lap.barIndex],pair=lap.continuationSide==='offset-toward-start'?[lap.offset,original]:[original,lap.offset];
    if(pair.some(b=>!b||![b.y,b.z,b.area,e.Es].every(Number.isFinite)))fail('RC_LAP_NETWORK_SLIP_INPUT_INVALID');
    lap.slipIds.forEach((id,i)=>{
     const node=e.nodes[i<2?0:1],prior=slipMap.get(id);
     if(prior&&prior.node!==node)fail('RC_LAP_NETWORK_SLIP_NODE_MISMATCH');
     const bar=pair[i%2],signature=[...axes.x,...axes.y.map((v,a)=>v*bar.y+axes.z[a]*bar.z),bar.area*e.Es];
     if(prior&&signature.some((v,a)=>Math.abs(v-prior.signature[a])>1e-10*Math.max(1,Math.abs(v),Math.abs(prior.signature[a]))))fail('RC_LAP_NETWORK_SLIP_PHYSICAL_MISMATCH');
     if(!prior){if(slipMap.size>=80)fail('RC_LAP_NETWORK_SLIP_DOF_LIMIT');slipMap.set(id,{index:count++,node,signature});}
     slipDofs.push(slipMap.get(id).index);
    });
   }
   const dofs=[...e.nodes.flatMap(n=>Array.from({length:6},(_,i)=>6*n+i)),...slipDofs];
   const columns=dofs.map((_,i)=>i<12?T.map((row,a)=>[a,row[i]]).filter(([,v])=>v!==0):[[i,1]]);
   return {...e,L:axes.L,T,dofs,columns};
  });
  if(members.reduce((s,e)=>s+(e.subdivisions??16)*(e.slipOrder??1)*Math.max(1,e.laps?.length??0),0)>256)fail('RC_LAP_NETWORK_WORK_LIMIT');
  if(!Array.isArray(fixedSlipIds)||new Set(fixedSlipIds).size!==fixedSlipIds.length||fixedSlipIds.some(id=>!slipMap.has(id)))fail('RC_LAP_NETWORK_SLIP_INPUT_INVALID');
  const fixed=new Set([...fixedDofs,...fixedSlipIds.map(id=>slipMap.get(id).index)]);
  if(!Array.isArray(springDofs)||springDofs.length>hostCount||new Set(springDofs.map(r=>r?.fullDof)).size!==springDofs.length||springDofs.some(r=>!Number.isInteger(r?.fullDof)||r.fullDof<0||r.fullDof>=hostCount||!Number.isFinite(r.stiffness)||r.stiffness<=0||!Number.isFinite(r.reference)))fail('RC_LAP_SPRING_INPUT_INVALID');
  const mappedNodes=nodes.map((n,i)=>({...n,id:n.id??`rc-node-${i}`})),nodeIndex=new Map(mappedNodes.map(n=>[n.id,n])),assignedNodes=new Set(),groupIds=new Set();
  if(!Array.isArray(diaphragmGroups)||diaphragmGroups.length>20)fail('RC_DIAPHRAGM_INVALID');
  for(const g of diaphragmGroups){
   if(!g||typeof g.id!=='string'||groupIds.has(g.id)||!Array.isArray(g.nodeIds)||g.nodeIds.length<2||![g.center?.x,g.center?.y].every(Number.isFinite))fail('RC_DIAPHRAGM_INVALID');
   groupIds.add(g.id);let level;
   for(const id of g.nodeIds){const n=nodeIndex.get(id);if(!n||assignedNodes.has(id))fail('RC_DIAPHRAGM_INVALID');assignedNodes.add(id);level??=n.z;if(Math.abs(n.z-level)>1e-6)fail('RC_DIAPHRAGM_NONPLANAR');}
  }
  let map=buildDiaphragmDofMap(mappedNodes,diaphragmGroups);
  for(let i=hostCount;i<count;i++){map.rows.push([[map.ncols++,1]]);map.columnKeys.push(`slip:${i}`);}
  if(!Array.isArray(prescribedDofs)||prescribedDofs.length>hostCount||new Set(prescribedDofs.map(r=>r?.fullDof)).size!==prescribedDofs.length||prescribedDofs.some(r=>!Number.isInteger(r?.fullDof)||r.fullDof<0||r.fullDof>=hostCount||!fixed.has(r.fullDof)||!Number.isFinite(r.value)))fail('RC_LAP_PRESCRIBED_INPUT_INVALID');
  if(!Array.isArray(generalConstraints)||generalConstraints.length>20||generalConstraints.some(c=>c?.type==='mpc'&&(!Array.isArray(c.terms)||c.terms.length>120)))fail('RC_GENERAL_CONSTRAINT_LIMIT');
  let constraints,affineOffset=Array(count).fill(0),constraintHash=null;
  if(generalConstraints.length){
   const keys=['ux','uy','uz','rx','ry','rz'];
   const supportNodes=mappedNodes.map((node,i)=>({id:node.id,x:node.x,y:node.y,z:node.z,support:'custom',fix:keys.map((_,j)=>fixed.has(6*i+j)),prescribedDisplacement:Object.fromEntries(prescribedDofs.filter(r=>Math.floor(r.fullDof/6)===i).map(r=>[keys[r.fullDof%6],r.value]))}));
   const canonical=buildConstraintSystem(supportNodes,diaphragmGroups,{constraints:generalConstraints});if(!canonical.ok)fail(canonical.reason);
   constraintHash=canonical.hash;map={rows:canonical.rows,ncols:canonical.reducedDofCount,columnKeys:canonical.reducedDofs.map(d=>d.key)};
   affineOffset=[...canonical.prescribed,...Array(count-hostCount).fill(0)];
   for(let i=hostCount;i<count;i++){map.rows.push([[map.ncols++,1]]);map.columnKeys.push(`slip:${i}`);}
   constraints=resolveReducedDofConstraints([...fixed].filter(i=>i>=hostCount),map);
  }else constraints=resolveReducedDofConstraints(fixed,map,new Map(prescribedDofs.map(r=>[r.fullDof,r.value])));
  if(!constraints.ok)fail(constraints.reason);
  const free=Array.from({length:map.ncols},(_,i)=>i).filter(i=>!constraints.fixedDofs.has(i));
  loads=[...loads,...Array(count-hostCount).fill(0)];
  const characteristicLength=Math.max(...members.map(e=>e.L));
  const scale=i=>map.columnKeys[i].startsWith('slip:')||/:(?:0|1|2|ux|uy)$/.test(map.columnKeys[i])?1:characteristicLength;
  const reducedLoads=Array(map.ncols).fill(0);map.rows.forEach((row,i)=>row.forEach(([j,c])=>{reducedLoads[j]+=c*loads[i];}));
  const loadScale=Math.max(1,...reducedLoads.map((v,i)=>Math.abs(v)/scale(i)));
  const evaluate=u=>{
   check();const K=Array.from({length:count},()=>Array(count).fill(0)),internal=Array(count).fill(0),responses=[];
   for(const [memberIndex,e] of members.entries()){
    check();const ul=e.T.map(row=>row.reduce((s,v,i)=>s+v*u[e.dofs[i]],0));
    const laps=e.laps.map(l=>l.slipIds?{...l,boundarySlips:l.slipIds.map(id=>u[slipMap.get(id).index])}:l);
    const r=rcLapFrame({...e,laps,length:e.L,endDisplacements:ul}),kl=r.slipAssembly?.tangent??r.tangent,fl=r.slipAssembly?.forces??r.endForces,kt=e.GJ/e.L,twist=ul[9]-ul[3];
    kl[3][3]+=kt;kl[9][9]+=kt;kl[3][9]-=kt;kl[9][3]-=kt;fl[3]-=kt*twist;fl[9]+=kt*twist;
    const materialEndForces=fl.slice(0,12),axial=geometricAxialForces?.[memberIndex]??0;
    const geometric=geometricAxialForces?localTangentGeometricStiffness12(axial,e.L):null,geometricEndForces=geometric?geometric.map(row=>row.reduce((sum,v,j)=>sum+v*ul[j],0)):Array(12).fill(0);
    if(geometricAxialForces)for(let i=0;i<12;i++){fl[i]+=geometricEndForces[i];for(let j=0;j<12;j++)kl[i][j]+=geometric[i][j];}
    for(let i=0;i<e.dofs.length;i++){
     internal[e.dofs[i]]+=e.columns[i].reduce((s,[a,v])=>s+v*fl[a],0);
     for(let j=0;j<e.dofs.length;j++)for(const [a,va] of e.columns[i])for(const [b,vb] of e.columns[j])K[e.dofs[i]][e.dofs[j]]+=va*kl[a][b]*vb;
    }
    // Dense extended tangent is iteration-local; do not retain it in results.
    const {tangent,slipAssembly,...response}=r,hostForces=fl.slice(0,12);
    responses.push({...response,materialEndForces,geometricEndForces,geometricAxialForce:axial,slipPorts:slipAssembly?.ports??[],boundarySlipForces:fl.slice(12),localDisplacements:ul,endForces:hostForces,boundaryEndForces:hostForces.map((v,i)=>v-(e.equivalentNodalLoads?.[i]??0)),strainEnergy:r.strainEnergy+kt*twist**2/2+ul.reduce((sum,v,i)=>sum+v*geometricEndForces[i],0)/2,torsionIncluded:true});
   }
   const springForces=Array(hostCount).fill(0);for(const r of springDofs){const force=r.stiffness*(u[r.fullDof]-r.reference);K[r.fullDof][r.fullDof]+=r.stiffness;internal[r.fullDof]+=force;springForces[r.fullDof]=force;}
   const residual=internal.map((v,i)=>v-loads[i]),reduced=reduceSystem(K,residual,map),norm=Math.max(0,...free.map(i=>Math.abs(reduced.F[i])/scale(i)))/loadScale;
   if(!Number.isFinite(norm))fail('RC_LAP_NETWORK_NONFINITE');return {springForces,K:reduced.K,reducedResidual:reduced.F,residual,norm,responses};
  };
  const initial=Array(map.ncols).fill(0);for(const [i,value] of constraints.values)initial[i]=value;
  let u=expandReducedDisplacements(initial,map).map((v,i)=>v+affineOffset[i]),state=evaluate(u);
  for(let iteration=0;iteration<=maxIterations;iteration++){
   check();trace.push({iteration,residual:state.norm});
   // Even an unloaded model must have a supported nonsingular tangent.
   const inverse=free.length?invertPositiveMatrix(free.map(i=>free.map(j=>state.K[i][j])),free.length):[];
   if(!inverse)fail('RC_LAP_NETWORK_MECHANISM_OR_NONPOSITIVE_TANGENT');
   if(state.norm<=tolerance)return {...base,ok:true,generalConstraintsIncluded:generalConstraints.length>0,generalConstraints:structuredClone(generalConstraints),constraintHash,constraintForces:state.residual.slice(0,hostCount).map((v,i)=>fixed.has(i)?0:-v),prescribedDisplacementsIncluded:prescribedDofs.some(r=>r.value!==0),prescribedDofs:structuredClone(prescribedDofs),converged:true,displacements:u.slice(0,hostCount),reactions:state.residual.slice(0,hostCount).map((v,i)=>(fixed.has(i)?v:0)-state.springForces[i]),springSupportsIncluded:springDofs.length>0,springReactions:state.springForces.map(v=>-v),springDofs:structuredClone(springDofs),rigidDiaphragmIncluded:diaphragmGroups.length>0,diaphragmConstraintForces:state.residual.slice(0,hostCount).map((v,i)=>assignedNodes.has(mappedNodes[Math.floor(i/6)].id)&&[0,1,5].includes(i%6)&&!fixed.has(i)?-v:0),reducedDofCount:map.ncols,sharedSlipAssemblyIncluded:slipMap.size>0,slipResults:[...slipMap].map(([id,{index,node}])=>({id,node,value:u[index],reaction:state.residual[index],fixed:fixed.has(index)})),elementResults:state.responses,trace,tolerance,globalAssemblyIncluded:true,pDeltaIncluded:false,memberLoadsIncluded:members.some(e=>e.equivalentNodalLoads!==undefined),distributedLoadsIncluded:members.some(e=>e.memberLoads?.some(l=>l.type==='distributed-linear'))};
   if(iteration===maxIterations)break;
   const step=inverse.map(row=>-row.reduce((s,v,j)=>s+v*state.reducedResidual[free[j]],0));let accepted=false;
   for(let damping=1;damping>=1/4096;damping/=2){
    const dq=Array(map.ncols).fill(0);free.forEach((i,j)=>{dq[i]=damping*step[j];});const du=expandReducedDisplacements(dq,map),trial=u.map((v,i)=>v+du[i]);const candidate=evaluate(trial);
    if(candidate.norm<state.norm){u=trial;state=candidate;trace.at(-1).damping=damping;accepted=true;break;}
   }
   if(!accepted)fail('RC_LAP_NETWORK_LINE_SEARCH_FAILED');
  }
  fail('RC_LAP_NETWORK_ITERATION_LIMIT');
 }catch(error){return {...base,ok:false,converged:false,reason:error.code||error.message,trace};}
}


// Fixed-point axial updates wrap the same material/slip/constraint equilibrium.
// The inner tangent is work-conjugate for each held axial-force state.
export function solveRcLapNetwork(input={}){
 const method=input.pDeltaMethod??'off';
 if(!['off','direct'].includes(method))return {ok:false,converged:false,reason:'RC_LAP_PDELTA_METHOD_UNSUPPORTED',designTransferAllowed:false};
 if(method==='off')return solveRcLapNetworkAtAxial({...input,geometricAxialForces:null});
 const started=performance.now(),secondOrderTrace=[],tolerance=input.tolerance??1e-7;
 const failed=reason=>({version:RC_LAP_NETWORK_VERSION,ok:false,converged:false,reason,secondOrderTrace,pDeltaIncluded:true,designTransferAllowed:false,globalMethodQualified:false});
 let axial=Array(input.elements?.length??0).fill(0),previous=null,firstOrderBoundaryEndForces=null;
 for(let iteration=0;iteration<30;iteration++){
  if(input.signal?.aborted)return failed('RC_LAP_NETWORK_CANCELLED');
  if(performance.now()-started>10000)return failed('RC_LAP_NETWORK_TIME_LIMIT');
  const result=solveRcLapNetworkAtAxial({...input,geometricAxialForces:axial});
  if(!result.ok)return failed(result.reason);
  if(performance.now()-started>10000)return failed('RC_LAP_NETWORK_TIME_LIMIT');
  if(iteration===0)firstOrderBoundaryEndForces=result.elementResults.map(r=>Array.from(r.boundaryEndForces));
  const next=result.elementResults.map((r,i)=>{const load=input.elements[i].equivalentNodalLoads;return (r.materialEndForces[6]-(load?.[6]??0)-r.materialEndForces[0]+(load?.[0]??0))/2;});
  const axialChange=Math.max(0,...next.map((v,i)=>Math.abs(v-axial[i])/Math.max(1,Math.abs(v),Math.abs(axial[i]))));
  const displacementChange=previous?Math.max(0,...result.displacements.map((v,i)=>Math.abs(v-previous[i])))/Math.max(1e-12,...result.displacements.map(Math.abs)):null;
  secondOrderTrace.push({iteration,axialChange,displacementChange,equilibriumResidual:result.trace.at(-1).residual});
  if(previous&&axialChange<=tolerance&&displacementChange<=tolerance)return {...result,firstOrderBoundaryEndForces,pDeltaIncluded:true,pDeltaMethod:'direct',secondOrderTrace,geometricForceConvention:'tension-positive average material boundary axial force; fixed-point updated geometric stiffness',globalMethodQualified:false};
  axial=next;previous=result.displacements;
 }
 return failed('RC_LAP_PDELTA_ITERATION_LIMIT');
}
