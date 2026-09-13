// Section kernels: epsilon-z*kappaY+y*kappaZ, My=-integral(z*sigma),
// Mz=integral(y*sigma). Frame recovery: [epsilon,w'',v'']; local rotations
// are ry=-w', rz=v'. Thus S=diag(1,1,-1) applies to both conjugate vectors.
export const RC_FRAME_CONVENTION_VERSION='p25-rc-frame-section-sign-v1';
const signs=[1,1,-1];
export function frameDemandToRcSection({N,My,Mz}){
 if(![N,My,Mz].every(Number.isFinite))throw Error('RC_FRAME_DEMAND_INVALID');
 return {N,My,Mz:-Mz};
}
export function rcSectionFlexibilityToFrame(c){
 if(!Array.isArray(c)||c.length!==3||c.some(row=>!Array.isArray(row)||row.length!==3||!row.every(Number.isFinite)))throw Error('RC_SECTION_FLEXIBILITY_INVALID');
 return c.map((row,i)=>row.map((v,j)=>signs[i]*v*signs[j]));
}
export function rcSectionStrainToFrame(strain){
 if(!Array.isArray(strain)||strain.length!==3||!strain.every(Number.isFinite))throw Error('RC_SECTION_STRAIN_INVALID');
 return strain.map((v,i)=>v*signs[i]);
}
export function frameEndsToRcSectionEnds(u){
 if(!Array.isArray(u)||u.length!==12||!u.every(Number.isFinite))throw Error('RC_FRAME_END_DISPLACEMENTS_INVALID');
 return [u[0],-u[4],-u[5],u[6],-u[10],-u[11]];
}
export function rcSectionEndForcesToFrame(f){
 if(!Array.isArray(f)||f.length!==6||!f.every(Number.isFinite))throw Error('RC_SECTION_END_FORCES_INVALID');
 return [f[0],0,0,0,-f[1],-f[2],f[3],0,0,0,-f[4],-f[5]];
}

// Untagged direct-kernel inputs retain the documented section convention.
// Native analysis tuples must declare their source convention; conversion is
// idempotent because the resulting tuple is explicitly section-tagged.
export function toRcSectionDemand(demand){
 if(!demand||!['N','My','Mz'].every(k=>Number.isFinite(demand[k])))throw Object.assign(Error('CONCURRENT_DEMAND_REQUIRED'),{code:'CONCURRENT_DEMAND_REQUIRED'});
 if(demand.signConvention!==undefined&&!['solver-native','rc-section'].includes(demand.signConvention))throw Object.assign(Error('SECTION_DEMAND_CONVENTION_UNSUPPORTED'),{code:'SECTION_DEMAND_CONVENTION_UNSUPPORTED'});
 return {...demand,...(demand.signConvention==='solver-native'?frameDemandToRcSection(demand):{}),signConvention:'rc-section'};
}
