import {changedDetailCommands} from '../src/compute/product/changedDetailCommands.js';
import assert from 'node:assert/strict';
import {memberCandidateCommands} from '../src/design/rc/memberCandidateCommands.js';
const original={type:'reinforcement-record',id:'R',version:1,memberId:'M',stirrupSpacing:150,bars:[]};
const model={designDetails:{splices:[{id:'S',version:1,reinforcementId:'R@1'}]}};
assert.deepEqual(memberCandidateCommands(model,[original],{omitUnchanged:true}).commands,[],'unchanged region must not remap splice reference');
const other={...original,id:'OTHER'};
const changed=memberCandidateCommands({designDetails:{}},[original,other],{omitUnchanged:true,regionEdits:{OTHER:{spacing:100}}});
assert.equal(changed.commands.length,1);assert.equal(changed.commands[0].id,'OTHER');assert.equal(changed.commands[0].version,2);
assert.equal(original.version,1);assert.equal(other.stirrupSpacing,150);
assert.equal(memberCandidateCommands({designDetails:{}},[original],{omitUnchanged:true,spacing:150}).commands.length,0);
console.log('PASS unchanged region and splice identity preservation with selective changed commands');

const foundation={type:'foundation-record',id:'F',version:1,B:2,groundId:'G@1'},joint={type:'connection-record',id:'J',version:1,tieSpacing:150};
assert.deepEqual(changedDetailCommands([{...foundation,version:2},{...joint,version:2}],[foundation,joint]),[]);
assert.deepEqual(changedDetailCommands([{...foundation,version:2,groundId:'G@2'},{...joint,version:2}],[foundation,joint]),[{...foundation,version:2,groundId:'G@2'}]);
assert.equal(changedDetailCommands([{type:'member-assignment',memberIds:['M'],secId:'S@1'}],[joint]).length,1);
