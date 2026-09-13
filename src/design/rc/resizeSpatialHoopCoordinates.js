// Geometry proposal only; the spatial contact owner must certify the new positions.
export function resizeSpatialHoopCoordinates(detail,prior,next){
 const fail=()=>{throw Object.assign(Error('SPATIAL_RESIZE_MAPPING_REQUIRED'),{code:'SPATIAL_RESIZE_MAPPING_REQUIRED'});};
 const inset=detail.cover+detail.stirrups?.diameter+detail.tieBendInsideRadius;
 if(![inset,prior?.B,prior?.H,next?.B,next?.H].every(v=>Number.isFinite(v)&&v>0)||next.B<prior.B||next.H<prior.H||!Array.isArray(detail.bars)||!detail.bars.length||detail.bars.length>100)fail();
 const move=(v,b,a)=>{const p=b/2-inset,n=a/2-inset;if(!(p>0)||!Number.isFinite(v))fail();return Math.abs(v)>=p?v+Math.sign(v)*(n-p):v/p*n;};
 return detail.bars.map(b=>({...b,y:move(b.y,prior.H,next.H),z:move(b.z,prior.B,next.B)}));
}
