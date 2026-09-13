import {resolveRigidDiaphragms} from '../../core/diaphragmGroups.js';
const dofs=['ux','uy','uz','rx','ry','rz'];
export function jointConstraintActions(model,nodeId,set){
 const required=new Set();
 for(const group of resolveRigidDiaphragms(model))if(group.nodeIds.includes(nodeId))for(const d of ['ux','uy','rz'])required.add(d);
 for(const constraint of model.constraints||[])for(const endpoint of [constraint.master,constraint.slave,...(constraint.terms||[])])if(endpoint?.node===nodeId&&endpoint.c!==0){if(endpoint.dof)required.add(endpoint.dof);else for(const d of dofs)required.add(d);}
 if(!required.size)return {status:'N_A',global:Array(6).fill(0),rows:[]};
 const source=set?.constraintActions,nc=reason=>({status:'NOT_CHECKED',reason,global:null,requiredDofs:[...required]});
 if(source?.version!=='p25-constraint-actions-v1'||source.signConvention!=='force applied by constraint to structural DOF'||source.units?.force!=='kN'||source.units?.moment!=='kN.m'||!Array.isArray(source.rows))return nc('JOINT_CONSTRAINT_ACTIONS_REQUIRED');
 if(source.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return nc('JOINT_CONSTRAINT_ACTIONS_INVALID');
 const rows=source.rows.filter(row=>row.nodeId===nodeId),seen=new Set(),global=Array(6).fill(0);
 for(const row of rows){
  const index=dofs.indexOf(row.dof);
  if(index<0||seen.has(row.dof)||!Number.isFinite(row.force)||typeof row.supportCoupled!=='boolean')return nc('JOINT_CONSTRAINT_ACTIONS_INVALID');
  seen.add(row.dof);if(!row.supportCoupled)global[index]+=row.force;
 }
 if([...required].some(d=>!seen.has(d)))return nc('JOINT_CONSTRAINT_ACTIONS_INCOMPLETE');
 return {status:'OK',global,rows:structuredClone(rows),basis:source.signConvention,supportCoupledExcluded:true};
}
