// Linear rigid-plane distribution with equal material stiffness per unit bar
// area. This establishes force equilibrium, not shear-friction capacity.
export function interfaceShearTorsionDistribution({bars,Vx,Vy,T}){
 const base={version:'p25-interface-shear-torsion-v1',designTransferAllowed:false,capacityCalculated:false,methodQualification:'independent-review-required',units:{force:'kN',moment:'kNm',length:'m',area:'m2'}};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason});
 if(!Array.isArray(bars)||bars.length<2||bars.length>100||![Vx,Vy,T].every(Number.isFinite)||bars.some(b=>![b.x,b.y,b.area].every(Number.isFinite)||b.area<=0))return nc('INTERFACE_BAR_GROUP_INPUT_REQUIRED');
 const area=bars.reduce((s,b)=>s+b.area,0),cx=bars.reduce((s,b)=>s+b.area*b.x,0)/area,cy=bars.reduce((s,b)=>s+b.area*b.y,0)/area;
 const J=bars.reduce((s,b)=>s+b.area*((b.x-cx)**2+(b.y-cy)**2),0),Tc=T-cx*Vy+cy*Vx;
 if(![area,cx,cy,J,Tc].every(Number.isFinite)||!(area>0)||!(J>0))return nc('INTERFACE_BAR_GROUP_POLAR_STIFFNESS_REQUIRED');
 const barForces=bars.map((b,i)=>{const fx=Vx*b.area/area-Tc*b.area*(b.y-cy)/J,fy=Vy*b.area/area+Tc*b.area*(b.x-cx)/J;return {barIndex:i+1,x:b.x,y:b.y,area:b.area,fx,fy,resultant:Math.hypot(fx,fy)};});
 if(barForces.some(b=>![b.fx,b.fy,b.resultant].every(Number.isFinite)))return nc('INTERFACE_BAR_GROUP_NONFINITE');
 const resultant=barForces.reduce((s,b)=>({Vx:s.Vx+b.fx,Vy:s.Vy+b.fy,T:s.T+b.x*b.fy-b.y*b.fx}),{Vx:0,Vy:0,T:0});
 const residual=Math.max(...Object.entries({Vx,Vy,T}).map(([k,v])=>Math.abs(resultant[k]-v)/Math.max(1,Math.abs(v))));
 if(!Number.isFinite(residual)||residual>1e-9)return nc('INTERFACE_BAR_GROUP_EQUILIBRIUM_FAILED');
 return {...base,status:'CALCULATED',reason:null,centroid:{x:cx,y:cy},area,polarAreaMoment:J,torsionAtCentroid:Tc,barForces,resultant,equilibriumResidual:residual,
  assumptions:['rigid interface plane','linear area-proportional bar-group stiffness','no interface traction or friction capacity assigned','no axial/bending steel interaction or anchorage qualification']};
}
