import {requiresOffsetAwareDesign} from '../../core/memberDesignGeometry.js';
import {memberAxes} from '../../core/memberAxes.js';
import {resolveSectionRecord} from '../../materials/registry.js';
import {practicalCommandFromRecord} from '../../modeling/practicalInputContract.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function sectionFoundationCommands(model,memberId){
 const latest=new Map();for(const r of model.designDetails?.foundations||[])if(!latest.has(r.id)||latest.get(r.id).version<r.version)latest.set(r.id,r);
 const member=model.members.find(m=>m.id===memberId);
 return [...latest.values()].filter(r=>r.columnMemberId===memberId&&[member?.n1,member?.n2].includes(r.nodeId)).map(r=>practicalCommandFromRecord('foundation-record',r));
}
export function coupleSectionFoundations(model,memberId,section,originals,commands){
 if(!section||!originals.length)return [];
 const member=model.members.find(m=>m.id===memberId),nodes=[member?.n1,member?.n2].map(id=>model.nodes.find(n=>n.id===id)),prior=resolveSectionRecord(model,member?.secId);
 if(requiresOffsetAwareDesign(member)||!nodes.every(Boolean)||Math.abs(nodes[0].x-nodes[1].x)>1e-9||Math.abs(nodes[0].y-nodes[1].y)>1e-9||!['RECT','SQUARE'].includes(prior?.shape))fail('SECTION_FOUNDATION_MAPPING_REQUIRED');
 const axes=memberAxes(nodes[0],nodes[1],member.localAxis);
 if(!axes.y.some(x=>Math.abs(x)>1-1e-9)||!axes.z.some(x=>Math.abs(x)>1-1e-9))fail('SECTION_FOUNDATION_ORTHOGONAL_MAPPING_REQUIRED');
 const dimensions=s=>({columnWidth:(Math.abs(axes.y[0])*(s.H||s.B)+Math.abs(axes.z[0])*s.B)/1000,columnDepth:(Math.abs(axes.y[1])*(s.H||s.B)+Math.abs(axes.z[1])*s.B)/1000});
 const before=dimensions(prior.params),after=dimensions(section),changed=[];
 for(const original of originals){
  if(original.locked)fail('DETAIL_LOCKED');
  if(Object.keys(before).some(k=>!Number.isFinite(original[k])||Math.abs(original[k]-before[k])>1e-9))fail('SECTION_FOUNDATION_SOURCE_DIMENSION_MISMATCH');
  const index=commands.findIndex(c=>c.type==='foundation-record'&&c.id===original.id),next={...(index<0?original:commands[index]),...after,version:original.version+1};
  if(index<0)commands.push(next);else commands[index]=next;
  changed.push(next);
 }
 return changed;
}
