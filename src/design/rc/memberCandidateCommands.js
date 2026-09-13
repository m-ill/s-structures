import {resizeSpliceOffset} from './resizeSpliceOffset.js';
import {parseBarLayerGroups} from '../../metadata/barLayerGroups.js';
import {generatedBarLayerGroups} from './generatedBarLayerGroups.js';
import {stableHash} from '../../core/stableHash.js';
import {fitCrossTieCage} from './fitCrossTieCage.js';
import {fitSpatialHoopBars} from './fitSpatialHoopBars.js';
import {remapSpliceBars,remapSplicePartition} from './remapSpliceBars.js';
import {perimeterBarLayout} from './perimeterBarLayout.js';
import {resizePerimeterBars} from './resizePerimeterBars.js';
import {expandRebarCatalogInput} from '../../materials/rebarProductCatalog.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
import {rectangularLayeredBarLayout,inferRectangularLayers} from './barLayout.js';
const reject=code=>{throw Object.assign(new Error(code),{code});};
export function memberCandidateCommands(model,originals,options={}){
 const {section,regionEdits={}}=options;
 if(!originals.length||originals.length>32||originals.some(c=>c.type!=='reinforcement-record'||c.memberId!==originals[0].memberId))reject('MEMBER_REGION_CANDIDATE_SCOPE');
 const commands=[],layoutCounts=[];
 const latestSplices=new Map();for(const s of model.designDetails?.splices||[])if(!latestSplices.has(s.id)||s.version>latestSplices.get(s.id).version)latestSplices.set(s.id,s);
 for(const original of originals){
  const {startExtension,endExtension,crossTieCageFit,closureBarFit,tieClosureCorner,tieClosureSeparation,spacing,diameter,cover,barsPerFace,layersPerFace,layerClearSpacing,crossTieLayerStep,perimeterYCount,perimeterZCount,tieFirstStart,tieFirstEnd}={...options,...regionEdits[original.id]};
  const perimeterChange=perimeterYCount!=null||perimeterZCount!=null;
  if(original.barLayerGroups&&(original.barLayerGroups.some(g=>g.startsWith('side-'))&&(barsPerFace!=null||layersPerFace!=null||layerClearSpacing!=null)))reject('BAR_LAYER_TOPOLOGY_MAPPING_REQUIRED');
  if(original.barLayerGroups&&perimeterChange&&parseBarLayerGroups(original.barLayerGroups,original.bars).some(g=>g.level>1))reject('BAR_LAYER_TOPOLOGY_MAPPING_REQUIRED');
  let generatedWithoutCrossTies=false;
  if(original.locked)reject('DETAIL_LOCKED');
  const command=structuredClone(original);command.version++;
  for(const [key,value] of Object.entries({startExtension,endExtension}))if(value!=null){if(!Number.isFinite(value)||value<0||value>5)reject('BAR_EXTENSION_CANDIDATE_CONSTRAINT_INVALID');command[key]=value;}
  for(const [key,value] of Object.entries({tieFirstStart,tieFirstEnd}))if(value!=null){if(!Number.isFinite(value)||value<0||value>.5)reject('TIE_END_CANDIDATE_CONSTRAINT_INVALID');command[key]=value;}
  if(tieClosureCorner!=null||tieClosureSeparation!=null){
   if(tieClosureCorner!=null)command.tieClosureCorner=tieClosureCorner;
   if(tieClosureSeparation!=null)command.tieClosureSeparation=tieClosureSeparation;
   if(command.tieClosure!=='standard-135'||!['+y+z','+y-z','-y+z','-y-z'].includes(command.tieClosureCorner)||!Number.isFinite(command.tieClosureSeparation)||command.tieClosureSeparation<0||command.tieClosureSeparation>1)reject('HOOP_CLOSURE_STRATEGY_INPUT_REQUIRED');
  }
  if(spacing!=null)command.stirrupSpacing=spacing;if(cover!=null)command.cover=cover;
  if(crossTieLayerStep!=null&&!perimeterChange){
   if(!Number.isFinite(crossTieLayerStep)||crossTieLayerStep<.005||crossTieLayerStep>.1||!command.crossTieBarPairs?.length||command.crossTieBarPairs.length>20)reject('CROSS_TIE_LAYER_STRATEGY_INPUT_REQUIRED');
   command.crossTiePlaneOffsets=command.crossTieBarPairs.map((_,i)=>String(Number(((i+1)*crossTieLayerStep).toPrecision(12))));
  }
  if(diameter!=null){
   for(const b of command.bars){b.diameter=diameter;if(command.barCatalogId){delete b.nominalAreaMm2;delete b.designation;}}
   if(command.barCatalogId)Object.assign(command,expandRebarCatalogInput(command));
  }
  let count=barsPerFace;
  if(command.crossTieBarPairs?.length&&(count||layersPerFace||layerClearSpacing))reject('CROSS_TIE_TOPOLOGY_CHANGE_MAPPING_REQUIRED');
  if(perimeterChange){
   if(count||layersPerFace||layerClearSpacing||!['ordinary-tied-column','ordinary-flexural-member'].includes(command.confinementSystem)||command.tieClosure!=='standard-135')reject('PERIMETER_CANDIDATE_SCOPE_REQUIRED');
   const member=model.members.find(m=>m.id===original.memberId),sec=section||resolveSectionRecord(model,member?.secId)?.params;
   if(!sec)reject('PERIMETER_RESIZE_SECTION_REQUIRED');
   const layout=perimeterBarLayout(command.bars,{B:sec.B/1000,H:(sec.H||sec.B)/1000,cover:command.cover,tieDiameter:command.stirrupDiameter/1000,insideRadius:command.tieBendInsideRadius,yCount:perimeterYCount,zCount:perimeterZCount});
   command.bars=layout.bars;
   if(original.barLayerGroups)command.barLayerGroups=layout.barLayerGroups;
   generatedWithoutCrossTies=layout.pairs.length===0;
   if(layout.pairs.length){
    // A separated-cage fit replaces these provisional planes using actual hoop
    // and repeated-station geometry; this seed is not a detailing clearance rule.
    const layerStep=crossTieLayerStep??(crossTieCageFit==='separate'?command.stirrupDiameter/1000+1e-6:NaN);
    if(!Number.isFinite(layerStep)||layerStep<.005||layerStep>.1)reject('CROSS_TIE_LAYER_STRATEGY_INPUT_REQUIRED');
    command.crossTieBarPairs=layout.pairs;command.crossTieHookSides=layout.pairs.map(()=>'left');
    command.crossTiePlaneOffsets=layout.pairs.map((_,i)=>String(Number(((i+1)*layerStep).toPrecision(12))));
   }else for(const key of ['crossTieBarPairs','crossTieHookSides','crossTiePlaneOffsets'])delete command[key];
  }else if(command.crossTieBarPairs?.length&&(section||command.cover!==original.cover||diameter!=null)){
   const member=model.members.find(m=>m.id===original.memberId),prior=resolveSectionRecord(model,member?.secId)?.params,next=section||prior;
   if(!prior||!next)reject('PERIMETER_RESIZE_SECTION_REQUIRED');
   const geometry=(sec,c)=>({B:sec.B/1000,H:(sec.H||sec.B)/1000,cover:c.cover,tieDiameter:c.stirrupDiameter/1000,insideRadius:c.tieBendInsideRadius});
   command.bars=resizePerimeterBars(original.bars,command.bars,{prior:geometry(prior,original),next:geometry(next,command)});
  }else if(count||layersPerFace||layerClearSpacing||section||command.cover!==original.cover){
   let inferred={};if(count==null||layersPerFace==null||layersPerFace>1&&layerClearSpacing==null)inferred=inferRectangularLayers(original.bars);
   count??=inferred.barsPerFace;
   const layers=layersPerFace??inferred.layersPerFace??1,clear=layerClearSpacing??inferred.layerClearSpacing;
   const member=model.members.find(m=>m.id===original.memberId),sec=section||resolveSectionRecord(model,member.secId).params;
   command.bars=rectangularLayeredBarLayout(command.bars,{B:sec.B/1000,H:(sec.H||sec.B)/1000,cover:command.cover,tieDiameter:command.stirrupDiameter/1000,barsPerFace:count,layersPerFace:layers,layerClearSpacing:clear,...(command.confinementStandard?{tieInsideRadius:command.tieBendInsideRadius}:{})});
   if(original.barLayerGroups)command.barLayerGroups=generatedBarLayerGroups(original,command.bars);
  }
  if(closureBarFit!=null&&!['preserve','contact'].includes(closureBarFit))reject('SPATIAL_FIT_MODE_INVALID');
  if(closureBarFit==='contact'){
   const member=model.members.find(m=>m.id===original.memberId),sec=section||resolveSectionRecord(model,member?.secId)?.params;
   if(!sec)reject('SPATIAL_FIT_SECTION_REQUIRED');
   const prior=resolveSectionRecord(model,member?.secId)?.params;
   const fit=fitSpatialHoopBars({...command,bars:command.bars.map(b=>({...b,diameter:b.diameter/1000})),stirrups:{diameter:command.stirrupDiameter/1000}},{B:sec.B/1000,H:(sec.H||sec.B)/1000},{source:{detail:{...original,bars:original.bars.map(b=>({...b,diameter:b.diameter/1000})),stirrups:{diameter:original.stirrupDiameter/1000}},section:{B:prior?.B/1000,H:(prior?.H||prior?.B)/1000}}});
   if(fit.status!=='OK')reject(fit.reason);
   command.bars=command.bars.map((b,i)=>({...b,y:fit.bars[i].y,z:fit.bars[i].z}));
  }
  if(crossTieCageFit!=null&&!['preserve','separate'].includes(crossTieCageFit))reject('CROSS_TIE_FIT_MODE_INVALID');
  if(crossTieCageFit==='separate'&&!generatedWithoutCrossTies){
   const member=model.members.find(m=>m.id===original.memberId),sec=section||resolveSectionRecord(model,member?.secId)?.params;
   const a=model.nodes.find(n=>n.id===member?.n1),b=model.nodes.find(n=>n.id===member?.n2);
   if(!sec||!a||!b)reject('CROSS_TIE_FIT_MEMBER_REQUIRED');
   const length=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*(command.end-command.start);
   const fit=fitCrossTieCage({...command,bars:command.bars.map(b=>({...b,diameter:b.diameter/1000})),stirrups:{diameter:command.stirrupDiameter/1000,spacing:command.stirrupSpacing/1000}},{B:sec.B/1000,H:(sec.H||sec.B)/1000,length});
   if(fit.status!=='OK')reject(fit.reason);
   command.crossTiePlaneOffsets=fit.planeOffsets;command.crossTieHookSides=fit.hookSides;
  }
  if(command.barLayerGroups){try{parseBarLayerGroups(command.barLayerGroups,command.bars);}catch{reject('BAR_LAYER_GEOMETRY_CHANGED');}}
  if(options.omitUnchanged&&stableHash({...command,version:original.version})===stableHash(original))continue;
  commands.push(command);layoutCounts.push(count??null);
  const partition=count&&!perimeterChange?remapSplicePartition(original.bars,command.bars,[...latestSplices.values()].filter(s=>s.reinforcementId===`${original.id}@${original.version}`)):null;
  for(const splice of latestSplices.values())if(splice.reinforcementId===`${original.id}@${original.version}`){
   if(splice.locked)reject('DETAIL_LOCKED');
   const next=practicalCommandFromRecord('splice-record',splice);next.version++;next.reinforcementId=`${command.id}@${command.version}`;
   if(count||perimeterChange)next.barIndices=partition?.get(splice.id)||remapSpliceBars(original.bars,command.bars,splice.barIndices,{perimeterChange});
   if(diameter!=null){
    const ds=new Set(splice.barIndices.map(i=>original.bars[Number(i)-1]?.diameter));if(ds.size!==1)reject('SPLICE_DIAMETER_MAPPING_REQUIRED');
    const prior=[...ds][0],actual=command.bars[Number(next.barIndices[0])-1]?.diameter;
    if(next.barIndices.some(i=>command.bars[Number(i)-1]?.diameter!==actual))reject('SPLICE_DIAMETER_MAPPING_REQUIRED');
    const resized=resizeSpliceOffset(next.offsetY,next.offsetZ,prior,actual);
    next.offsetY=resized.offsetY;next.offsetZ=resized.offsetZ;
   }
   commands.push(next);
  }
 }
 if(commands.length>98)reject('CANDIDATE_COMMAND_LIMIT'); // reserve section + assignment slots
 return {commands,layoutCounts};
}
