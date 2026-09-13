// Read the prepared quantity owner; do not relabel actual paths as perimeter
// estimates or equate a nominal centreline quantity with fabrication approval.
export function connectionCandidateQuantity(prepared){
 const q=prepared?.reinforcementQuantity;
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 if(q?.status!=='OK')fail(q?.reason||'CONNECTION_CANDIDATE_QUANTITY_GEOMETRY_REQUIRED');
 if(!Number.isFinite(q.steelVolume)||q.steelVolume<=0)fail('CANDIDATE_QUANTITY_REQUIRED');
 return {steelVolume:q.steelVolume,quantityComplete:q.quantityComplete===true,quantityBasis:q.basis||'unspecified',quantityReason:q.reason||null,nominalGeometryAvailable:q.basis==='prepared-nominal-centerline',quantityScope:'joint-transverse-reinforcement',fabricationQuantity:false};
}
