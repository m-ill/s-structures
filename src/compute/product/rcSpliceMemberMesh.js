import {memberAxes} from '../../core/memberAxes.js';
import {resolveMaterialRecord,resolveSectionRecord} from '../../materials/registry.js';
import {spliceGeometry} from '../../design/rc/spliceGeometry.js';
import {spliceLaneSegments} from '../../design/rc/spliceLaneSegments.js';
import {validateElasticLapInput} from '../../design/rc/elasticLapTransfer.js';
const fail=code=>{throw Object.assign(Error(code),{code});};
const latest=rows=>{const m=new Map();for(const r of rows||[])if(!m.has(r.id)||m.get(r.id).version<r.version)m.set(r.id,r);return [...m.values()];};
export function prepareRcSpliceMemberMesh(model,{memberId,subdivisions=16,frameDivisions=1,slipOrder=1}){
 if(!Number.isInteger(frameDivisions)||frameDivisions<1||frameDivisions>8)fail('RC_MESH_INPUT_INVALID');
 if(![1,2].includes(slipOrder))throw Error('RC_MESH_SLIP_ORDER_INVALID');
 if(typeof memberId!=='string'||!memberId||!Number.isInteger(subdivisions)||subdivisions<1||subdivisions>64)fail('RC_MESH_INPUT_INVALID');
 const member=model.members?.find(m=>m.id===memberId),ends=[member?.n1,member?.n2].map(id=>model.nodes?.find(n=>n.id===id));
 if(!member||!ends.every(Boolean))fail('RC_MESH_MEMBER_REQUIRED');
 if(['offsets','endOffset','offsetI','offsetJ','insertionPoint','releases','partialFixity','taper','customProps'].some(k=>member[k]!=null))fail('RC_MESH_MEMBER_KINEMATICS_REQUIRED');
 const axes=memberAxes(...ends,member.localAxis);if(!(axes.L>0))fail('RC_MESH_MEMBER_LENGTH_INVALID');
 const details=latest(model.designDetails?.reinforcement).filter(d=>d.memberId===memberId).sort((a,b)=>a.start-b.start);
 if(!details.length||details.length>19||details[0].start!==0||details.at(-1).end!==1||details.some((d,i)=>!Number.isFinite(d.start)||!Number.isFinite(d.end)||d.end<=d.start||i>0&&d.start!==details[i-1].end))fail('RC_MESH_REINFORCEMENT_COVERAGE');
 const section=resolveSectionRecord(model,member.secId),concrete=resolveMaterialRecord(model,member.matId);
 if(!['RECT','SQUARE'].includes(section?.shape)||concrete?.kind!=='concrete')fail('RC_MESH_RECTANGULAR_CONCRETE_REQUIRED');
 const B=section.params.B/1000,H=(section.params.H||section.params.B)/1000,GJ=concrete.elastic?.G*1000*section.properties?.J;
 if(![B,H,GJ,concrete.elastic?.E].every(v=>Number.isFinite(v)&&v>0))fail('RC_MESH_PROPERTIES_REQUIRED');
 const splices=latest(model.designDetails?.splices).filter(s=>s.memberId===memberId),geometry=new Map();
 for(const s of splices){validateElasticLapInput(s);if(s.transferStiffness===undefined)fail('SPLICE_TRANSFER_INPUT_REQUIRED');const g=spliceGeometry(model,s);if(g.status!=='OK')fail(g.reason);geometry.set(s.id,g);}
 let grid=[...new Set([0,1,...details.flatMap(d=>[d.start,d.end]),...splices.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
 if(grid.length>20)fail('RC_MESH_NODE_LIMIT');
 const boundaries=grid;
 grid=[...new Set(boundaries.flatMap((end,i)=>{
  if(i===0)return [end];const start=boundaries[i-1],mid=(start+end)/2;
  const count=frameDivisions;
  return Array.from({length:count},(_,j)=>j===count-1?end:start+(end-start)*(j+1)/count);
 }))].sort((a,b)=>a-b);
 if(grid.length>20)fail('RC_MESH_NODE_LIMIT');

 // Only laps cut by a frame or another record boundary require shared ports.
 const splitSplices=new Set(splices.filter(s=>grid.some(x=>x>s.start&&x<s.end)).map(s=>s.id));
 const paths=new Map();
 for(const d of details){
  if(!Array.isArray(d.bars)||!d.bars.length||d.bars.length>100)fail('RC_MESH_BARS_REQUIRED');
  paths.set(d.id,d.bars.map((bar,i)=>{
   const selected=splices.filter(s=>s.reinforcementId===`${d.id}@${d.version}`&&s.barIndices.some(index=>Number(index)===i+1));if(!selected.length)return null;
   const path=spliceLaneSegments({startX:d.start*axes.L,endX:d.end*axes.L,splices:selected.map(s=>({...s,startX:s.start*axes.L,endX:s.end*axes.L}))});
   if(path.status!=='OK')fail(path.reason);return path.segments;
  }));
 }
 const nodes=grid.map(t=>({x:ends[0].x+(ends[1].x-ends[0].x)*t,y:ends[0].y+(ends[1].y-ends[0].y)*t,z:ends[0].z+(ends[1].z-ends[0].z)*t})),elements=[],sources=[],fixedSlipIds=[],slipSources=new Map();
 for(let i=1;i<grid.length;i++){
  const start=grid[i-1],end=grid[i],mid=(start+end)/2,d=details.find(d=>mid>=d.start&&mid<d.end),steel=resolveMaterialRecord(model,d.barMaterialId);
  if(!Number.isFinite(steel?.elastic?.E)||steel.elastic.E<=concrete.elastic.E)fail('RC_MESH_STEEL_REQUIRED');
  const active=splices.filter(s=>mid>s.start&&mid<s.end),laps=active.flatMap(s=>geometry.get(s.id).bars.map(b=>({barIndex:b.originalIndex,offset:{...b},transferStiffness:s.transferStiffness,continuationSide:s.continuationSide,spliceId:s.id,spliceVersion:s.version}))),selected=new Set(laps.map(l=>l.barIndex));
  for(const lap of laps){
   if(!splitSplices.has(lap.spliceId))continue;
   const record=splices.find(s=>s.id===lap.spliceId),ordinal=splices.indexOf(record);
   lap.slipIds=[i-1,i].flatMap(node=>[0,1].map(piece=>{
    const id=JSON.stringify([memberId,ordinal,record.version,lap.barIndex,piece,node]);
    if(!slipSources.has(id))slipSources.set(id,{id,memberId,spliceId:record.id,spliceVersion:record.version,barIndex:lap.barIndex,piece,node,position:grid[node]*axes.L});
    if(piece===0&&grid[node]===record.start||piece===1&&grid[node]===record.end)if(!fixedSlipIds.includes(id))fixedSlipIds.push(id);
    return id;
   }));
  }
  const bars=d.bars.map((b,index)=>{
   if(selected.has(index)||!paths.get(d.id)[index])return {...b};
   const pieces=paths.get(d.id)[index].filter(p=>mid*axes.L>p.startX&&mid*axes.L<p.endX);if(pieces.length!==1)fail('RC_MESH_SINGLE_PIECE_REQUIRED');
   return {...b,y:b.y+pieces[0].offset[0],z:b.z+pieces[0].offset[1]};
  });
  elements.push({nodes:[i-1,i],localAxis:structuredClone(member.localAxis),B,H,Ec:concrete.elastic.E,Es:steel.elastic.E,thermalExpansion:{concrete:concrete.elastic.alpha,steel:steel.elastic.alpha},GJ,bars,laps,slipOrder:laps.length?slipOrder:1,subdivisions:Math.max(1,Math.ceil(subdivisions/frameDivisions))});
  sources.push({memberId,start,end,startX:start*axes.L,endX:end*axes.L,detailId:d.id,detailVersion:d.version,spliceIds:active.map(s=>s.id)});
 }
 if(elements.reduce((n,e)=>n+e.subdivisions*(e.slipOrder??1)*Math.max(1,e.laps.length),0)>256)fail('RC_LAP_NETWORK_WORK_LIMIT');
 return {version:'p25-rc-splice-member-mesh-v6-slip-order',fixedSlipIds,slipSources:[...slipSources.values()],integrationAllocation:{requestedCellsPerOriginalInterval:subdivisions,cellsPerFrameElement:Math.max(1,Math.ceil(subdivisions/frameDivisions)),workUnits:elements.reduce((n,e)=>n+e.subdivisions*(e.slipOrder??1)*Math.max(1,e.laps.length),0),basis:'original boundary interval density; rounded up, minimum one cell'},frameRefinement:{requestedDivisions:frameDivisions,lapIntervalsRefined:splitSplices.size>0,scope:'all intervals; internal lap boundaries share steel slip IDs'},memberId,nodes,elements,sources,originalNodeIds:grid.map((_,i)=>i===0?member.n1:i===grid.length-1?member.n2:null),physicalSteelVolume:elements.reduce((v,e,i)=>v+(sources[i].endX-sources[i].startX)*(e.bars.reduce((n,b)=>n+b.area,0)+e.laps.reduce((n,l)=>n+l.offset.area,0)),0),basis:'straight longitudinal analytical bodies; shared splice piece lanes; no fabrication/anchorage approval',loadsPrepared:false,supportsPrepared:false,analysisExecuted:false,designTransferAllowed:false};
}
