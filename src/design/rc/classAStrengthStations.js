import {RC_LAP_DESIGN_LIMITS} from '../../metadata/rcLapDesignCapabilities.js';
// For an unchanged section, exact axial force and oriented moment direction,
// KDS capacity/ductility are unchanged; the greatest moment magnitude governs.
export function classAStrengthStations(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>RC_LAP_DESIGN_LIMITS.maxStations||rows.some(r=>![r.N,r.My,r.Mz,Math.hypot(r.My,r.Mz)].every(Number.isFinite)))return {status:'NOT_CHECKED',reason:'CLASS_A_STRENGTH_STATIONS_REQUIRED'};
 const groups=new Map();
 for(const r of rows){
  const magnitude=Math.hypot(r.My,r.Mz),direction=magnitude<=1e-9?['zero']:Math.abs(r.Mz)>=Math.abs(r.My)?['z',Math.sign(r.Mz),r.My/r.Mz]:['y',Math.sign(r.My),r.Mz/r.My];
  const key=JSON.stringify([r.N,r.signConvention??'rc-section',...direction]),previous=groups.get(key);
  if(!previous||magnitude>previous.magnitude)groups.set(key,{row:r,magnitude});
 }
 const stations=[...groups.values()].map(r=>r.row);
 return {status:'OK',stations,inputCount:rows.length,selectedCount:stations.length,basis:'exact axial force and unrounded oriented direction groups; strongest moment retained; zero-bending and sign-convention groups separate'};
}
