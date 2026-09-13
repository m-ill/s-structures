export const RC_STIFFNESS_CONTRACT_VERSION='p25-rc-stiffness-v1';
export function rcReinforcementDependency(model){
 const modes=[model.analysisSettings?.rcStiffnessMode,...(model.analysisCases||[]).map(c=>c.settings?.rcStiffnessMode)].filter(x=>x!==undefined);
 const independent=modes.every(x=>x==='gross');
 return {version:RC_STIFFNESS_CONTRACT_VERSION,reinforcementIndependent:independent,basis:independent?'known-gross-elastic-section':'reinforcement-coupled-or-unknown',declaredModes:modes,implementedModes:['gross']};
}
export function assertSupportedRcStiffness(model,...settings){
 const modes=[model.analysisSettings?.rcStiffnessMode,...settings.map(x=>x?.rcStiffnessMode)].filter(x=>x!==undefined);
 if(modes.some(x=>x!=='gross'))throw Object.assign(new Error('RC_STIFFNESS_MODE_UNSUPPORTED'),{code:'RC_STIFFNESS_MODE_UNSUPPORTED'});
}
