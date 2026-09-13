export function roundedHoopPerimeterLayout({B,H,cover,tieDiameter,insideRadius,bars}){
 const base={units:{length:'m'},scope:'nominal bar stations on a rounded rectangular hoop; geometric layout only'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(![B,H,cover,tieDiameter,insideRadius].every(v=>Number.isFinite(v)&&v>0)||!Array.isArray(bars)||!bars.length||bars.length>100)return nc('HOOP_PERIMETER_GEOMETRY_REQUIRED');
 if(bars.some(b=>![b.y,b.z,b.diameter].every(Number.isFinite)||b.diameter<=0))return nc('HOOP_PERIMETER_BAR_REQUIRED');
 const cy=H/2-cover-tieDiameter-insideRadius,cz=B/2-cover-tieDiameter-insideRadius,R=insideRadius+tieDiameter/2;
 if(cy<=0||cz<=0)return {...base,status:'NG',ratio:null,reason:'HOOP_BEND_OUTSIDE_SECTION'};
 const quadrant=cy+cz+Math.PI*R/2,perimeter=4*quadrant,corners=new Set(),positions=[],failures=[],cornerBarIndices=[];
 for(const [index,bar] of bars.entries()){
  const y=Math.abs(bar.y),z=Math.abs(bar.z),radius=insideRadius-bar.diameter/2,dy=y-cy,dz=z-cz;
  let q;
  if(radius<0){failures.push({barIndex:index+1,reason:'BAR_TOO_LARGE_FOR_BEND'});continue;}
  if(dy>=-1e-8&&dz>=-1e-8&&Math.abs(Math.hypot(dy,dz)-radius)<=1e-6){q=cz+R*Math.atan2(Math.max(0,dz),Math.max(0,dy));corners.add(`${Math.sign(bar.y)},${Math.sign(bar.z)}`);cornerBarIndices.push(index+1);}
  else if(z<=cz&&Math.abs(y-(cy+radius))<=1e-6)q=z;
  else if(y<=cy&&Math.abs(z-(cz+radius))<=1e-6)q=cz+Math.PI*R/2+cy-y;
  else {failures.push({barIndex:index+1,reason:'LONGITUDINAL_BAR_NOT_ON_HOOP_PERIMETER'});continue;}
  positions.push({barIndex:index+1,s:(bar.y>=0?(bar.z>=0?q:perimeter-q):(bar.z>=0?2*quadrant-q:2*quadrant+q))%perimeter});
 }
 positions.sort((a,b)=>a.s-b.s);
 const gaps=positions.map((p,i)=>({from:p.barIndex,to:positions[(i+1)%positions.length].barIndex,length:(i+1<positions.length?positions[i+1].s:positions[0].s+perimeter)-p.s}));
 const maximumGap=gaps.length?Math.max(...gaps.map(g=>g.length)):null,ng=failures.length>0||corners.size!==4;
 return {...base,status:ng?'NG':'OK',reason:ng?'HOOP_PERIMETER_LAYOUT_NOT_SATISFIED':null,cornerCount:corners.size,cornerBarIndices,maximumGap,perimeter,positions,gaps,failures};
}
