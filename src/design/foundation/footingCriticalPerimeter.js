import {footingColumnGeometry} from './footingColumnGeometry.js';

function properties(bounds,open,d){
 const {xmin,xmax,ymin,ymax}=bounds,segments=[];
 for(const [axis,side,a,b] of [
  ['B',-1,[xmin,ymin],[xmin,ymax]],['B',1,[xmax,ymin],[xmax,ymax]],
  ['L',-1,[xmin,ymin],[xmax,ymin]],['L',1,[xmin,ymax],[xmax,ymax]],
 ])if(!open.includes(`${axis}:${side}`))segments.push({axis,side,a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])});
 const length=segments.reduce((n,s)=>n+s.length,0);
 const centroid={x:segments.reduce((n,s)=>n+s.length*(s.a[0]+s.b[0])/2,0)/length,y:segments.reduce((n,s)=>n+s.length*(s.a[1]+s.b[1])/2,0)/length};
 let Ix=0,Iy=0,Ixy=0;
 for(const s of segments){
  const x=s.a[0]-centroid.x,u=s.b[0]-centroid.x,y=s.a[1]-centroid.y,v=s.b[1]-centroid.y,w=s.length*d;
  Ix+=w*(y*y+y*v+v*v)/3;Iy+=w*(x*x+x*u+u*u)/3;Ixy+=w*(2*x*y+x*v+u*y+2*u*v)/6;
 }
 return {bounds,segments,openSides:open,length,d,area:length*d,centroid,Ix,Iy,Ixy,columnPosition:['interior','edge','corner'][open.length]};
}

// Enumerate axis-parallel closed, three-sided and two-adjacent-sided paths.
// A free footing edge closes the enclosed soil area, never the resisting line.
export function footingCriticalPerimeter(f,d){
 const geometry=footingColumnGeometry(f);if(!geometry.ok)return geometry;
 if(!Number.isFinite(d)||d<=0)return {ok:false,reason:'PUNCHING_EFFECTIVE_DEPTH_REQUIRED'};
 const input={B:f.B,L:f.L,columnWidth:f.columnWidth,columnDepth:f.columnDepth,columnOffsetX:geometry.x,columnOffsetY:geometry.y},candidates=[];
 const base={xmin:geometry.axes.B.low-d/2,xmax:geometry.axes.B.high+d/2,ymin:geometry.axes.L.low-d/2,ymax:geometry.axes.L.high+d/2};
 for(const bx of [0,-1,1])for(const ly of [0,-1,1]){
  const bounds={...base},open=[];
  if(bx){bounds[bx<0?'xmin':'xmax']=bx*f.B/2;open.push(`B:${bx}`);}
  if(ly){bounds[ly<0?'ymin':'ymax']=ly*f.L/2;open.push(`L:${ly}`);}
  if(bounds.xmin< -f.B/2-1e-10||bounds.xmax>f.B/2+1e-10||bounds.ymin< -f.L/2-1e-10||bounds.ymax>f.L/2+1e-10)continue;
  if(bounds.xmax<=bounds.xmin||bounds.ymax<=bounds.ymin)continue;
  candidates.push(properties(bounds,open,d));
 }
 if(!candidates.length)return {ok:false,reason:'RECTANGULAR_PUNCHING_PERIMETER_UNAVAILABLE'};
 candidates.sort((a,b)=>a.length-b.length||a.openSides.length-b.openSides.length);
 const minimum=candidates[0].length,equivalent=candidates.filter(c=>Math.abs(c.length-minimum)<=1e-10*Math.max(1,minimum));
 return {ok:true,...equivalent[0],input,equivalent,scope:'minimum-axis-parallel-interior-edge-corner; no openings or opposite-free-edge mechanism'};
}

// Shear-only linear traction, with signed moments about the line centroid.
// This equilibrium model does not grant flexural moment-transfer credit.
export function perimeterStress(g,{V,Mx,My,designStress}){
 const fail=reason=>({status:'NOT_CHECKED',reason,ratio:null});
 if(![V,Mx,My,designStress].every(Number.isFinite)||designStress<=0||!g.segments?.length)return fail('PERIMETER_SHEAR_INPUT_REQUIRED');
 const {area,Ix,Iy,Ixy,centroid}=g,det=Ix*Iy-Ixy**2;
 if(!(area>0&&Ix>0&&Iy>0&&det>1e-12*Ix*Iy))return fail('PERIMETER_INERTIA_SINGULAR');
 const a=(-My*Ix-Mx*Ixy)/det,b=(Mx*Iy+My*Ixy)/det,uniform=V/area;
 const stresses=g.segments.flatMap(s=>[s.a,s.b].map(([x,y])=>({x,y,stress:uniform+a*(x-centroid.x)+b*(y-centroid.y)})));
 const governing=stresses.reduce((p,q)=>Math.abs(q.stress)>Math.abs(p.stress)?q:p),demandStress=Math.abs(governing.stress),ratio=demandStress/designStress;
 return {status:ratio<=1+1e-10?'OK':'NG',ratio,demandStress,capacity:designStress,uniformStress:uniform,gradientX:a,gradientY:b,governing,stresses,area,Ix,Iy,Ixy,centroid,V,Mx,My,recovered:{V:uniform*area,Mx:a*Ixy+b*Ix,My:-(a*Iy+b*Ixy)},flexuralTransferCredit:0,units:{stress:'kPa',moment:'kN.m',area:'m2',inertia:'m4'},scope:'shear-only linear distribution on declared rectangular critical perimeter'};
}
