// Public command geometry: diameter mm, coordinates m. Product area and
// designation are copied unchanged; this never invents a new certified bar.
const layoutFailure=code=>{throw Object.assign(new Error(code),{code});};
export function rectangularLayeredBarLayout(template,options){
 const layers=options.layersPerFace??1,clear=options.layerClearSpacing;
 if(!Number.isInteger(layers)||layers<1||layers>4)layoutFailure('LAYER_LAYOUT_CONSTRAINT_INVALID');
 if(2*options.barsPerFace*layers>100)layoutFailure('LAYER_BAR_COUNT_LIMIT');
 if(layers>1&&(!Number.isFinite(clear)||clear<=0))layoutFailure('LAYER_CLEAR_SPACING_REQUIRED');
 const outer=rectangularBarLayout(template,options),db=outer[0].diameter/1000;
 if(layers===1)return outer;
 const inner=Math.abs(outer[0].y)-(layers-1)*(db+clear);
 if(2*inner-db<clear-1e-10)layoutFailure('LAYER_LAYOUT_GEOMETRY_INVALID');
 return [-1,1].flatMap(sign=>Array.from({length:layers},(_,layer)=>outer.filter(b=>Math.sign(b.y)===sign).map(b=>({...b,y:b.y-sign*layer*(db+clear)}))).flat());
}
export function inferRectangularLayers(bars){
 const fail=()=>layoutFailure('SECTION_CHANGE_LAYOUT_STRATEGY_REQUIRED');
 if(!Array.isArray(bars)||!bars.length||bars.some(b=>!Number.isFinite(b.y)||!Number.isFinite(b.z)||!Number.isFinite(b.diameter)||b.y===0))fail();
 const db=bars[0].diameter/1000;if(bars.some(b=>b.diameter!==bars[0].diameter))fail();
 const ys=[...new Set(bars.map(b=>b.y))].sort((a,b)=>a-b),negative=ys.filter(y=>y<0),positive=ys.filter(y=>y>0);
 if(negative.length!==positive.length||!negative.length||negative.length>4||negative.some((y,i)=>Math.abs(y+positive.at(-1-i))>1e-9))fail();
 const rows=ys.map(y=>bars.filter(b=>b.y===y).map(b=>b.z).sort((a,b)=>a-b)),count=rows[0].length;
 if(count<2||rows.some(r=>r.length!==count||r.some((z,i)=>Math.abs(z-rows[0][i])>1e-9)))fail();
 const pitch=negative.length>1?negative[1]-negative[0]:null;
 if(pitch!==null&&(pitch<=db||negative.some((y,i)=>i>0&&Math.abs(y-negative[i-1]-pitch)>1e-9)))fail();
 return {barsPerFace:count,layersPerFace:negative.length,...(pitch===null?{}:{layerClearSpacing:Number((pitch-db).toPrecision(12))})};
}
export function rectangularBarLayout(template,{B,H,cover,tieDiameter,barsPerFace,tieInsideRadius}){
 const fail=code=>{throw Object.assign(new Error(code),{code});};
 if(!Array.isArray(template)||!template.length||!Number.isInteger(barsPerFace)||barsPerFace<2||barsPerFace>20)fail('BAR_LAYOUT_CONSTRAINT_INVALID');
 const first=template[0];
 if(template.some(b=>['diameter','nominalAreaMm2','designation'].some(key=>b[key]!==first[key])))fail('HOMOGENEOUS_BAR_PRODUCT_REQUIRED');
 const db=first.diameter/1000;
 let z=B/2-cover-tieDiameter-db/2,y=H/2-cover-tieDiameter-db/2;
 if(tieInsideRadius!==undefined){
  if(!Number.isFinite(tieInsideRadius)||tieInsideRadius<db/2)fail('BAR_LAYOUT_CORNER_BEND_TOO_SMALL');
  const inset=tieInsideRadius-(tieInsideRadius-db/2)/Math.sqrt(2);
  z=B/2-cover-tieDiameter-inset;y=H/2-cover-tieDiameter-inset;
 }
 if(![B,H,cover,tieDiameter,db].every(Number.isFinite)||cover<=0||tieDiameter<0||db<=0||z<=0||y<=0||2*z/(barsPerFace-1)<db)fail('BAR_LAYOUT_GEOMETRY_INVALID');
 return [-1,1].flatMap(sign=>Array.from({length:barsPerFace},(_,i)=>({...structuredClone(first),y:sign*y,z:-z+2*z*i/(barsPerFace-1)})));
}
