// A fixed moment direction reduces the demand envelope to one signed scalar.
export function proportionalBending(rows){
 if(!rows?.length||rows.some(r=>![r.My,r.Mz].every(Number.isFinite)))return {status:'NOT_CHECKED',reason:'CLASS_A_BENDING_DIRECTION_REQUIRED'};
 const peak=rows.reduce((a,b)=>Math.hypot(a.My,a.Mz)>=Math.hypot(b.My,b.Mz)?a:b),norm=Math.hypot(peak.My,peak.Mz);
 if(!Number.isFinite(norm))return {status:'NOT_CHECKED',reason:'CLASS_A_BENDING_DIRECTION_REQUIRED'};
 if(norm<=1e-9)return {status:'OK',kind:'zero-bending',direction:{My:0,Mz:1}};
 const sign=(Math.abs(peak.Mz)>=Math.abs(peak.My)?peak.Mz:peak.My)<0?-1:1,direction={My:sign*peak.My/norm,Mz:sign*peak.Mz/norm};
 if(rows.some(r=>Math.abs(r.My*direction.Mz-r.Mz*direction.My)>1e-9*Math.max(1,Math.hypot(r.My,r.Mz))))return {status:'NOT_CHECKED',reason:'CLASS_A_PROPORTIONAL_BENDING_REQUIRED'};
 return {status:'OK',kind:Math.abs(direction.My)<=1e-12||Math.abs(direction.Mz)<=1e-12?'uniaxial':'proportional-biaxial',direction};
}
