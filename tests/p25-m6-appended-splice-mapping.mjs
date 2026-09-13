import assert from 'node:assert/strict';
import {appendedSpliceCommands} from '../src/compute/product/appendedSpliceCommands.js';
const source={type:'reinforcement-record',id:'R',version:1,memberId:'C',bars:[{y:-.1,z:-.1},{y:.1,z:.1}]},target={...source,version:2,bars:[...source.bars,{y:0,z:.1}]};
const splice={id:'SP',name:'SP',version:2,sourceNote:'specified splice',memberId:'C',reinforcementId:'R@1',barIndices:['1','2'],start:.2,end:.5,offsetY:.02,offsetZ:0,spliceType:'tension-B',spliceSystem:'ordinary-no-seismic-detail',continuationSide:'offset-toward-end',transferStiffness:100,transferElasticSlipLimit:.001,transferReference:'test'};
const model={designDetails:{splices:[{...splice,version:1,reinforcementId:'R@0'},splice]}};const before=structuredClone(model);
const out=appendedSpliceCommands(model,[source],[target]);assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.commands.length,1);
assert.equal(out.commands[0].version,3);assert.equal(out.commands[0].reinforcementId,'R@2');assert.deepEqual(out.commands[0].barIndices,['1','2','3']);
for(const key of ['start','end','offsetY','offsetZ','spliceType','continuationSide','transferStiffness','transferElasticSlipLimit','transferReference'])assert.equal(out.commands[0][key],splice[key]);
assert.deepEqual(model,before);assert.equal(out.changes[0].addedBarIndices[0],3);
for(const [patch,reason] of [[{locked:true},'DETAIL_LOCKED'],[{reinforcementId:'R@3'},'CURRENT_SPLICE_REINFORCEMENT_REQUIRED'],[{barIndices:['1']},'JOINT_ADDITIONAL_BAR_SPLICE_MAPPING_REQUIRED']])assert.equal(appendedSpliceCommands({designDetails:{splices:[{...splice,...patch}]}},[source],[target]).reason,reason);
assert.equal(appendedSpliceCommands(model,[source],[{...target,bars:[{y:9,z:9},...target.bars.slice(1)]}]).reason,'APPENDED_SPLICE_BAR_IDENTITY_REQUIRED');
console.log('PASS latest all-bar splice mapping, unchanged transfer inputs, partial/stale/locked rejection and immutable model');

const original={...source,bars:[[-.1,-.1],[-.1,.1],[.1,-.1],[.1,.1]].map(([y,z])=>({y,z,diameter:20}))},expanded={...original,version:2,bars:[...original.bars,[-.1,0],[.1,0],[0,-.1],[0,.1]].map(b=>Array.isArray(b)?{y:b[0],z:b[1],diameter:20}:b)};
const groups=[{...splice,id:'A',barIndices:['1','4'],start:.1,end:.3},{...splice,id:'B',barIndices:['2','3'],start:.5,end:.7}];
const partition=appendedSpliceCommands({designDetails:{splices:groups}},[original],[expanded]);assert.equal(partition.ok,true,JSON.stringify(partition));
assert.deepEqual(partition.commands.map(c=>c.barIndices.length),[4,4]);
assert.deepEqual(partition.commands.flatMap(c=>c.barIndices).map(Number).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
for(let i=0;i<2;i++){assert.deepEqual(partition.commands[i].barIndices.slice(0,2),groups[i].barIndices);assert.equal(partition.commands[i].start,groups[i].start);assert.equal(partition.commands[i].end,groups[i].end);assert.equal(partition.changes[i].mappingStrategy,'balanced-existing-partition');}
const reversed=appendedSpliceCommands({designDetails:{splices:[...groups].reverse()}},[original],[expanded]);assert.deepEqual(reversed.commands,partition.commands);
const duplicate={designDetails:{splices:[groups[0],{...groups[1],barIndices:['2','4']}]}};assert.equal(appendedSpliceCommands(duplicate,[original],[expanded]).reason,'JOINT_ADDITIONAL_BAR_SPLICE_MAPPING_REQUIRED');
console.log('PASS complete staggered partition, preserved old identities/intervals, balanced appended selection and order independence');

assert.equal(appendedSpliceCommands({designDetails:{splices:groups}},[original],[{...expanded,bars:[...expanded.bars.slice(0,7),{...expanded.bars[7],y:NaN}]}]).reason,'APPENDED_SPLICE_BAR_IDENTITY_REQUIRED');
assert.equal(appendedSpliceCommands({designDetails:{splices:groups}},[original],[{...expanded,bars:[...expanded.bars.slice(0,7),{...expanded.bars[7],diameter:25}]}]).reason,'SPLICE_PARTITION_HOMOGENEOUS_PRODUCT_REQUIRED');

const nominalOriginal={...original,bars:original.bars.map(b=>({...b,nominalAreaMm2:314,designation:'D20'}))},nominalExpanded={...expanded,bars:expanded.bars.map(b=>({...b,nominalAreaMm2:314,designation:'D20'}))};
const changedNominal={...nominalExpanded,bars:nominalExpanded.bars.map((b,i)=>i===0?{...b,nominalAreaMm2:320}:b)};
assert.equal(appendedSpliceCommands({designDetails:{splices:groups}},[nominalOriginal],[changedNominal]).reason,'APPENDED_SPLICE_BAR_IDENTITY_REQUIRED');
