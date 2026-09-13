// Compact per-phase geometry. It is not a seismic anchorage approval.
// Local column coordinates are y along H, z along B.
export function jointCrossTieTopology(prepared,quantity){
 const base={creditApplied:false,scope:'orthogonal cross-tie body positions and nominal area per repeat phase',units:{length:'m',area:'m2'}};
 const nc=reason=>({...base,status:'NOT_CHECKED',reason,phases:[]});
 const pieces=prepared?.crossTies?.pieces,distribution=prepared?.stirrupDistribution;
 if(!Array.isArray(pieces)||!pieces.length||pieces.length>40||!Number.isSafeInteger(distribution?.count)||distribution.count<1)return nc('JOINT_CROSS_TIE_TOPOLOGY_REQUIRED');
 if(![quantity?.hcB,quantity?.hcH].every(x=>Number.isFinite(x)&&x>0))return nc('JOINT_CROSS_TIE_CORE_REQUIRED');
 const alternating=prepared.crossTies.pattern==='alternating-hook-side',phaseCount=alternating?Math.min(2,distribution.count):1,phases=[];
 if(alternating&&pieces.some(p=>!Number.isInteger(p.sourceIndexOffset)||p.sourceIndexOffset<0||p.sourceIndexOffset>=phaseCount))return nc('JOINT_CROSS_TIE_PHASE_INVALID');
 for(let phase=0;phase<phaseCount;phase++){
  const selected=alternating?pieces.filter(p=>p.sourceIndexOffset===phase):pieces;
  if(!selected.length)return nc('JOINT_CROSS_TIE_PHASE_MISSING');
  const directions=[{steelDirection:'B',coreDimension:'H',hc:quantity.hcH,axis:0},{steelDirection:'H',coreDimension:'B',hc:quantity.hcB,axis:1}].map(d=>({...d,positions:[-d.hc/2,d.hc/2],ties:[],nominalAdditionalArea:0}));
  const marks=new Set();
  for(const p of selected){
   const mark=p.sourceMark||p.mark,line=p.path?.lines?.[1];
   if(typeof mark!=='string'||marks.has(mark))return nc('JOINT_CROSS_TIE_DUPLICATE_SOURCE');marks.add(mark);
   if(!Array.isArray(line)||line.length!==2||line.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite))||!Number.isFinite(p.diameter)||p.diameter<=0)return nc('JOINT_CROSS_TIE_BODY_REQUIRED');
   const delta=line[1].map((v,i)=>v-line[0][i]),length=Math.hypot(...delta);
   if(length<=1e-12)return nc('JOINT_CROSS_TIE_BODY_REQUIRED');
   const direction=directions.find(d=>Math.abs(delta[d.axis])<=1e-10*length);
   if(!direction)return nc('JOINT_DIAGONAL_CROSS_TIE_RULE_REQUIRED');
   const position=(line[0][direction.axis]+line[1][direction.axis])/2;
   if(Math.abs(position)>=direction.hc/2)return {...nc('JOINT_CROSS_TIE_BODY_OUTSIDE_CORE'),witness:{phase,mark:p.mark,steelDirection:direction.steelDirection,coreDimension:direction.coreDimension,position,halfCore:direction.hc/2}};
   const nominalArea=Math.PI*p.diameter**2/4;
   direction.positions.push(position);direction.nominalAdditionalArea+=nominalArea;
   direction.ties.push({mark:p.mark,sourceMark:mark,position,nominalArea});
  }
  for(const d of directions){d.positions.sort((a,b)=>a-b);d.maximumGap=Math.max(...d.positions.slice(1).map((x,i)=>x-d.positions[i]));delete d.axis;}
  phases.push({phase,count:alternating?Math.ceil((distribution.count-phase)/2):distribution.count,directions});
 }
 return {...base,status:'OK',reason:null,phases,nominalHx:Math.max(...phases.flatMap(p=>p.directions.map(d=>d.maximumGap))),directions:['B','H'].map(steelDirection=>({steelDirection,minimumNominalAdditionalArea:Math.min(...phases.map(p=>p.directions.find(d=>d.steelDirection===steelDirection).nominalAdditionalArea))})),qualificationRequired:['opposite-face-anchorage','seismic-end-alternation','support-and-assembly']};
}
