const fail=code=>{throw Object.assign(new Error(code),{code});};
// Counts include each face's two corners. Shared corners are created once.
// This generates new identities and corresponding cross-tie pairs together.
export function perimeterBarLayout(template,{B,H,cover,tieDiameter,insideRadius,yCount,zCount}){
 if(!Array.isArray(template)||!template.length||![yCount,zCount].every(n=>Number.isInteger(n)&&n>=2&&n<=12))fail('PERIMETER_LAYOUT_COUNTS_REQUIRED');
 const first=template[0];
 if(template.some(b=>['diameter','nominalAreaMm2','designation'].some(k=>b[k]!==first[k])))fail('HOMOGENEOUS_BAR_PRODUCT_REQUIRED');
 const db=first.diameter/1000,r=insideRadius-db/2,cy=H/2-cover-tieDiameter-insideRadius,cz=B/2-cover-tieDiameter-insideRadius;
 if(![B,H,cover,tieDiameter,insideRadius,db].every(v=>Number.isFinite(v)&&v>0)||r<0||cy<=0||cz<=0)fail('PERIMETER_LAYOUT_GEOMETRY_INVALID');
 const yy=cy+r/Math.SQRT2,zz=cz+r/Math.SQRT2,bars=[],pairs=[],faces={},sideLeft=[],sideRight=[];
 const add=(y,z)=>{bars.push({...structuredClone(first),y,z});return bars.length;};
 for(const sy of [-1,1]){
  const ids=[];
  for(let i=0;i<yCount;i++){
   const corner=i===0||i===yCount-1,z=-zz+2*zz*i/(yCount-1);
   if(!corner&&Math.abs(z)>cz+1e-10)fail('PERIMETER_LAYOUT_GEOMETRY_INVALID');
   ids.push(add(sy*(corner?yy:cy+r),z));
  }
  faces[`y${sy}`]=ids;
 }
 for(let i=1;i<yCount-1;i++)pairs.push(`${faces['y-1'][i]}:${faces.y1[i]}`);
 for(let i=1;i<zCount-1;i++){
  const y=-yy+2*yy*i/(zCount-1);
  if(Math.abs(y)>cy+1e-10)fail('PERIMETER_LAYOUT_GEOMETRY_INVALID');
  const left=add(y,-cz-r),right=add(y,cz+r);sideLeft.push(left);sideRight.push(right);pairs.push(`${left}:${right}`);
 }
 for(let i=0;i<bars.length;i++)for(let j=0;j<i;j++)if(Math.hypot(bars[i].y-bars[j].y,bars[i].z-bars[j].z)<db-1e-10)fail('PERIMETER_LAYOUT_GEOMETRY_INVALID');
 const barLayerGroups=[`bottom-1:${faces['y-1'].join('/')}`,`top-1:${faces.y1.join('/')}`,...(sideLeft.length?[`side-left:${sideLeft.join('/')}`,`side-right:${sideRight.join('/')}`]:[])];
 return {bars,pairs,yCount,zCount,barLayerGroups,identityPolicy:'new-layout-with-regenerated-cross-ties'};
}
