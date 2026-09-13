import assert from 'node:assert/strict';
import {jointTopology} from '../src/design/connection/jointTopology.js';
const nodes=[{id:'J',x:0,y:0,z:0},...[['X+',1,0,0],['X-',-1,0,0],['Y+',0,1,0],['Y-',0,-1,0],['COL',0,0,-1]].map(([id,x,y,z])=>({id,x,y,z}))];
for(const [ids,expected] of [[[],'column-only'],[['X+'],'one-sided'],[['X+','X-'],'two-opposite'],[['X+','Y+'],'two-adjacent'],[['X+','X-','Y+'],'three-sided'],[['X+','X-','Y+','Y-'],'four-sided']]){
 const memberIds=[...ids,'COL'],model={nodes,members:memberIds.map(id=>({id,n1:'J',n2:id}))},joint={nodeId:'J',memberIds};
 const result=jointTopology(model,joint);assert.equal(result.beamArrangement,expected);assert.equal(result.classificationOnly,true);
 assert.deepEqual(jointTopology(model,{...joint,memberIds:[...memberIds].reverse()}),result);
 if(ids.length)assert.equal(jointTopology(model,{...joint,memberIds:['COL']}).reason,'INCOMPLETE_JOINT_MEMBERS');
}
console.log('PASS all orthogonal joint arrangements, ordering invariance and incomplete membership');
