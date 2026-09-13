const fields={startExtensions:['startExtension',0,5],endExtensions:['endExtension',0,5],tieClosureSeparations:['tieClosureSeparation',0,1],tieFirstStarts:['tieFirstStart',0,.5],tieFirstEnds:['tieFirstEnd',0,.5],perimeterYCounts:['perimeterYCount',2,12],perimeterZCounts:['perimeterZCount',2,12],crossTieLayerSteps:['crossTieLayerStep',.005,.1],layersPerFace:['layersPerFace',1,4],layerClearSpacings:['layerClearSpacing',.025,.2],spacings:['spacing',0,500],diameters:['diameter',0,50],covers:['cover',.005,.2],barsPerFace:['barsPerFace',2,20]};
const choices={crossTieCageFits:['crossTieCageFit',['preserve','separate']],closureBarFits:['closureBarFit',['preserve','contact']],tieClosureCorners:['tieClosureCorner',['+y+z','+y-z','-y+z','-y-z']]};
const fail=()=>{throw Object.assign(new Error('REGION_CANDIDATE_CONSTRAINT_INVALID'),{code:'REGION_CANDIDATE_CONSTRAINT_INVALID'});};
export function validateRegionConstraints(rows,commands){
 if(rows===undefined)return;
 if(!Array.isArray(rows)||!rows.length||rows.length>32)fail();
 const seen=new Set();
 for(const row of rows){
  if(!row||typeof row!=='object'||seen.has(row.detailId)||!commands.some(c=>c.id===row.detailId)||Object.keys(row).some(k=>k!=='detailId'&&!fields[k]&&!choices[k])||Object.keys(row).length<2)fail();
  seen.add(row.detailId);
  for(const [key,[,allowed]] of Object.entries(choices))if(row[key]!==undefined&&(!Array.isArray(row[key])||!row[key].length||row[key].length>8||row[key].some(v=>!allowed.includes(v))))fail();
  for(const [key,[,min,max]] of Object.entries(fields))if(row[key]!==undefined){
   const values=row[key];if(!Array.isArray(values)||!values.length||values.length>8||values.some(v=>!Number.isFinite(v)||v<min||v>max||min===0&&v===0&&!['startExtensions','endExtensions','tieFirstStarts','tieFirstEnds','tieClosureSeparations'].includes(key)||['barsPerFace','layersPerFace','perimeterYCounts','perimeterZCounts'].includes(key)&&!Number.isInteger(v)))fail();
  }
 }
}
// Depth is bounded by 32 regions × the bounded field catalog; never materialize the Cartesian product.
export function* regionCandidateVariants(rows=[],{order='cartesian'}={}){
 if(!['cartesian','diagonal-first'].includes(order))throw Object.assign(new Error('REGION_CANDIDATE_ORDER_INVALID'),{code:'REGION_CANDIDATE_ORDER_INVALID'});
 const axes=rows.flatMap(row=>Object.entries({...fields,...choices}).filter(([key])=>row[key]).map(([key,[name]])=>({id:row.detailId,name,values:[...new Set(row[key])]})));
 const current=Object.create(null),indices=new Array(axes.length).fill(0);
 if(order==='diagonal-first'){
  if(!axes.length){yield {};return;}
  // Visit coordinated alternatives before the Cartesian tail. No product or
  // visited-set allocation; at most eight initial alternatives exist.
  for(let level=0;level<Math.max(...axes.map(a=>a.values.length));level++){
   for(const a of axes){current[a.id]??={};current[a.id][a.name]=a.values[Math.min(level,a.values.length-1)];}
   yield structuredClone(current);
  }
 }
 function* visit(i){
  if(i===axes.length){
   const level=Math.max(...indices);
   if(order==='diagonal-first'&&axes.every((a,j)=>indices[j]===Math.min(level,a.values.length-1)))return;
   yield structuredClone(current);return;
  }
  const {id,name,values}=axes[i];current[id]??={};
  for(let j=0;j<values.length;j++){indices[i]=j;current[id][name]=values[j];yield* visit(i+1);}
  delete current[id][name];if(!Object.keys(current[id]).length)delete current[id];
 }
 yield* visit(0);
}
