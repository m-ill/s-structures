import {parseBarLayerGroups} from '../../metadata/barLayerGroups.js';
// Only the rectangular row generator owns this mapping. Do not infer arbitrary
// source roles from proximity or transfer indices through a new perimeter.
export function generatedBarLayerGroups(original,bars){
 const source=parseBarLayerGroups(original.barLayerGroups,original.bars);
 if(!source)return undefined;
 if(source.some(g=>g.face==='side')||!['top','bottom'].every(face=>source.some(g=>g.face===face)))throw Object.assign(Error('BAR_LAYER_TOPOLOGY_MAPPING_REQUIRED'),{code:'BAR_LAYER_TOPOLOGY_MAPPING_REQUIRED'});
 const groups=[];
 for(const [face,sign] of [['bottom',-1],['top',1]]){
  const ys=[...new Set(bars.filter(b=>Math.sign(b.y)===sign).map(b=>b.y))].sort((a,b)=>Math.abs(b)-Math.abs(a));
  for(const [i,y] of ys.entries())groups.push(`${face}-${i+1}:${bars.flatMap((b,index)=>b.y===y?[index+1]:[]).join('/')}`);
 }
 parseBarLayerGroups(groups,bars);
 return groups;
}
