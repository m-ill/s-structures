// Explicit design roles; indices refer to the current reinforcement record.
export function parseBarLayerGroups(values,bars){
 if(values===undefined)return null;
 const fail=()=>{throw Object.assign(Error('BAR_LAYER_GROUPS_INVALID'),{code:'BAR_LAYER_GROUPS_INVALID'});};
 if(!Array.isArray(values)||!values.length||values.length>50||!Array.isArray(bars)||!bars.length||bars.length>100)fail();
 const used=new Set(),names=new Set(),groups=[];
 for(const value of values){
  const m=typeof value==='string'&&/^(top-[1-9][0-9]?|bottom-[1-9][0-9]?|side-left|side-right):([1-9][0-9]*(?:\/[1-9][0-9]*)*)$/.exec(value);
  if(!m||value.length>128||names.has(m[1]))fail();names.add(m[1]);
  const [face,level]=m[1].split('-'),indices=m[2].split('/').map(Number);
  for(const i of indices){if(!Number.isSafeInteger(i)||i>bars.length||used.has(i))fail();used.add(i);}
  const selected=indices.map(i=>bars[i-1]);
  if(selected.some(b=>![b?.y,b?.z].every(Number.isFinite)))fail();
  if(face!=='side'){
   if(selected.some(b=>face==='top'?b.y<=0:b.y>=0)||Math.max(...selected.map(b=>b.y))-Math.min(...selected.map(b=>b.y))>1e-9)fail();
  }else if(selected.some(b=>level==='left'?b.z>=0:b.z<=0))fail();
  groups.push({name:m[1],face,level:face==='side'?null:Number(level),indices,y:selected[0].y});
 }
 if(used.size!==bars.length)fail();
 for(const face of ['top','bottom']){
  const rows=groups.filter(g=>g.face===face).sort((a,b)=>a.level-b.level);
  if(rows.some((g,i)=>g.level!==i+1||i>0&&Math.abs(g.y)>=Math.abs(rows[i-1].y)-1e-9))fail();
 }
 const top=groups.find(g=>g.name==='top-1'),bottom=groups.find(g=>g.name==='bottom-1');
 const primary=groups.filter(g=>g.face!=='side').flatMap(g=>g.indices.map(i=>bars[i-1].z));
 for(const g of groups.filter(g=>g.face==='side')){
  if(!top||!bottom||g.indices.some(i=>bars[i-1].y>=top.y||bars[i-1].y<=bottom.y))fail();
  const edge=g.name==='side-left'?Math.min(...primary):Math.max(...primary);
  if(g.indices.some(i=>g.name==='side-left'?bars[i-1].z>edge+1e-9:bars[i-1].z<edge-1e-9))fail();
 }
 return groups;
}
