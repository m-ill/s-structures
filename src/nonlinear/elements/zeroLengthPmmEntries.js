import {createNonlinearElementContract} from '../core/elementContract.js';
import {assembleZeroLengthPmmHinge3dDomain,evaluateZeroLengthPmmHinge3d} from './zeroLengthPmmHinge3d.js';
import {createPmmHinge3dProperty} from '../materials/pmmHinge3d.js';

export function buildZeroLengthPmmEntries(domain) {
  const model=domain.solverModel||{};
  const inputs=model.zeroLengthPmmHinges||model.pmmHinges||[];
  if(!inputs.length)return [];
  // Validate each element on its two-node subdomain to avoid a dense global
  // validation allocation. Actual assembly uses the existing sparse registry.
  const index=new Map(domain.nodes.map((n,i)=>[n.id,i]));
  const used=new Set(domain.elements.map(e=>e.id));
  return inputs.map(element=>{
    if(used.has(element.id))throw Object.assign(new Error('Duplicate PMM element ID'),{code:'ZERO_LENGTH_PMM_ID_DUPLICATE'});
    used.add(element.id);
    if(element.localAxis||element.orientation)throw Object.assign(new Error('SH1 currently uses global ux/ry/rz axes only.'),{code:'ZERO_LENGTH_PMM_ORIENTATION_UNSUPPORTED'});
    const nodes=[domain.nodes[index.get(element.n1)],domain.nodes[index.get(element.n2)]].filter(Boolean);
    const validation=assembleZeroLengthPmmHinge3dDomain({nodes,hingeProperties:model.hingeProperties,zeroLengthPmmHinges:[element]});
    if(!validation.ok)throw Object.assign(new Error(validation.reason),{code:validation.reason});
    const source=element.property||(model.hingeProperties||[]).find(p=>p.id===(element.propertyId||element.hingePropertyId));
    const property=source.propertyHash?source:createPmmHinge3dProperty({id:source.id,...(source.parameters||source)});
    const dofs=[...Array.from({length:6},(_,i)=>6*index.get(element.n1)+i),...Array.from({length:6},(_,i)=>6*index.get(element.n2)+i)];
    const kernel=createNonlinearElementContract({type:'zero-length-pmm',dofCount:12,evaluate(input){
      const r=evaluateZeroLengthPmmHinge3d({property,displacement:Array.from(input.trialKinematics.uGlobal),state:input.committedState});
      return {resistingForceGlobal:r.endForce,tangentGlobal:r.tangent,trialState:r.material.state,energies:{},
        localResponse:r,diagnostics:{propertyHash:property.propertyHash,energyQualification:'unqualified',axes:'global-ux-ry-rz'}};
    }});
    return {id:element.id,dofs:Int32Array.from(dofs),descriptor:{id:element.id,behavior:'zero-length-pmm',fullDofs:dofs},
      requiredMatrixClass:'general',usesFiniteRotationCoordinates:false,kernel};
  });
}
