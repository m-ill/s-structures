import {fixedEndTemperature,fixedEndTemperatureGradient} from '../../loads/fixedEnd/temperature.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
// Consume the shared load owner's initial-strain contract only. Its linear
// fixed-end vectors are deliberately not added to the nonlinear RC equilibrium.
export function rcThermalInitialStrains(load,element,factor){
 const gradient=load.type==='tgradient';
 if(!['temperature','tgradient'].includes(load.type)||!Number.isFinite(factor)||(gradient?![load.dTtop,load.dTbot].every(Number.isFinite):!Number.isFinite(load.dT)))fail('RC_MODEL_TEMPERATURE_INPUT_INVALID');
 const depth=gradient?(load.h??element.H):null;
 if(gradient&&(!Number.isFinite(depth)||depth<=0))fail('RC_MODEL_TEMPERATURE_DEPTH_REQUIRED');
 const alpha={concrete:load.alpha??element.thermalExpansion?.concrete,steel:load.alpha??element.thermalExpansion?.steel};
 if(Object.values(alpha).some(v=>!Number.isFinite(v)||v<=0))fail('RC_MODEL_TEMPERATURE_ALPHA_REQUIRED');
 const strains={},versions={};
 for(const kind of ['concrete','steel']){
  const result=gradient?fixedEndTemperatureGradient({...load,alpha:alpha[kind],h:depth},{},{}):fixedEndTemperature({...load,alpha:alpha[kind]},{},{});
  if(!result.ok)fail(result.reason);
  const initial=result.recovery.initialStrain;strains[kind]=[factor*(initial.axial??0),0,factor*(initial.curvatureZ??0)];versions[kind]=result.version;
  if(!strains[kind].every(Number.isFinite))fail('RC_MODEL_TEMPERATURE_INPUT_INVALID');
 }
 return {strains,alpha,depth,versions};
}
