import {selectNativeSectionProfile} from '../../metadata/nativeSectionProfile.js';
function sectionProfile(row){const profile=selectNativeSectionProfile(row);return profile?{sectionProfile:profile}:{};}
export function designSetSnapshot(set) {
 const keys=['loadRecoveryIssues','forceRecoveryInput','xs','stationSides','N','Vy','Vz','Tq','T','My','Mz','end','structuralEnd','globalEquilibriumEnd','ax','offset','foundation','refinement'];
 return {...Object.fromEntries(['method','solverMethod','secondOrderTrace','constraintActions','firstOrderMomentComparison','stiffnessProvenance','memberServiceResponses','memberIntegratedDisplacements','creepEffects'].filter(k=>set[k]!==undefined).map(k=>[k,structuredClone(set[k])])),ok:set.ok,anyOk:set.anyOk,combo:structuredClone(set.combo),reactions:structuredClone(set.reactions||{}),memberResults:Object.fromEntries(Object.entries(set.memberResults||{}).map(([id,row])=>[id,{...Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,ArrayBuffer.isView(row[k])?Array.from(row[k]):structuredClone(row[k])])),...sectionProfile(row)}]))};
}
