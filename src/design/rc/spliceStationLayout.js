import {resolveSectionRecord} from '../../materials/registry.js';
import {spliceGeometry} from './spliceGeometry.js';
import {spliceBarPath} from './spliceBarPath.js';

// Prepare once per member evaluation, never rebuild paths at every station.
export function prepareSpliceStationLayouts(model,details,{memberLength,H}){
 const latest=new Map();for(const s of model.designDetails?.splices||[])if(!latest.has(s.id)||latest.get(s.id).version<s.version)latest.set(s.id,s);
 const prepared=new Map();
 for(const detail of details){
  const records=[...latest.values()].filter(s=>s.reinforcementId===`${detail.id}@${detail.version}`);
  if(!records.some(s=>s.continuationSide))continue;
  const geometries=new Map(records.map(s=>[s.id,spliceGeometry(model,s)]));
  const paths=detail.bars.map((bar,index)=>{
   const selected=records.filter(s=>s.barIndices?.some(i=>Number(i)===index+1));if(!selected.length)return null;
   if(selected.some(s=>geometries.get(s.id).status!=='OK'))return {status:'NOT_CHECKED',reason:'SPLICE_STATION_VALID_GEOMETRY_REQUIRED'};
   return spliceBarPath({detail,bar,memberLength,H,splices:selected.map(s=>({...s,startX:geometries.get(s.id).startX,endX:geometries.get(s.id).endX}))});
  });
  prepared.set(`${detail.id}@${detail.version}`,paths);
 }
 return (detail,x,side='point',purpose='strength')=>{
  const paths=prepared.get(`${detail.id}@${detail.version}`);if(!paths)return {status:'OK',detail,changed:false};
  const nc=reason=>({status:'NOT_CHECKED',ratio:null,reason,spliceLayoutEvaluated:true});
  if(!['strength','physical-cover-only'].includes(purpose))return nc('SPLICE_LAYOUT_PURPOSE_UNSUPPORTED');
  if(!Number.isFinite(x)||!['point','left','right'].includes(side))return nc('SPLICE_STATION_POSITION_REQUIRED');
  const bars=[],pieceMarks=[];
  for(const [index,bar] of detail.bars.entries()){
   const path=paths[index];if(!path){bars.push(bar);continue;}
   if(path.status!=='OK')return nc(path.reason);
   const pieces=path.pieces.filter(p=>(x>p.bodyStartX||x===p.bodyStartX&&side!=='left')&&(x<p.bodyEndX||x===p.bodyEndX&&side==='left'));
   if(!pieces.length||pieces.length!==1&&purpose!=='physical-cover-only')return nc(pieces.length?'SPLICE_OVERLAP_LOAD_TRANSFER_REQUIRED':'SPLICE_STATION_OUTSIDE_STRAIGHT_BAR_BODY');
   for(const piece of pieces){bars.push({...bar,y:piece.y,z:piece.z});pieceMarks.push({barIndex:index+1,piece:piece.mark});}
  }
  return {status:'OK',detail:{...detail,bars},changed:true,pieceMarks,spliceLayoutEvaluated:true,layoutPurpose:purpose,additionalStrengthCredit:false,basis:purpose==='physical-cover-only'?'all-physical-straight-pieces-at-station; cover-only-no-strength-credit':'actual-single-piece-straight-body-at-station; overlap-transfer-separate'};
 };
}

export function createSpliceLayoutResolver(model,member,details){
 const section=resolveSectionRecord(model,member.secId),nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
 // Wall/slab sections can be RECT without carrying usable bar dimensions, so a
 // missing depth means there is no splice station layout to prepare.
 const depth=Number(section?.params?.H)||Number(section?.params?.B);
 if(!nodes.every(Boolean)||!['RECT','SQUARE'].includes(section?.shape)||!Number.isFinite(depth)||depth<=0)return null;
 return prepareSpliceStationLayouts(model,details,{memberLength:Math.hypot(nodes[1].x-nodes[0].x,nodes[1].y-nodes[0].y,nodes[1].z-nodes[0].z),H:depth/1000});
}
