import assert from 'node:assert/strict';
import {validateDependentCandidates,dependentCandidateVariants} from '../src/design/rc/dependentCandidates.js';
const model={members:[{id:'M',n1:'A',n2:'B'}]};
const commands=[{type:'connection-record',id:'J',nodeId:'B',memberIds:['M','N'],version:2},{type:'foundation-record',id:'F',nodeId:'A',version:1}];
const rows=[{connectionId:'J',detailCandidates:[{tieSpacing:100},{tieSpacing:80}]},{foundationId:'F',detailCandidates:[{B:2,L:2},{B:3,L:3}]}];
validateDependentCandidates(model,'M',rows,commands);
const variants=[...dependentCandidateVariants(rows,commands)];
assert.equal(variants.length,4);assert.equal(variants[0][0].version,3);assert.equal(variants[0][1].version,2);
assert.equal(variants[3][0].tieSpacing,80);assert.equal(variants[3][1].B,3);assert.equal(commands[0].version,2);
for(const bad of [[...rows,rows[0]],[{connectionId:'J',detailCandidates:[{fy:500}]}],[{foundationId:'F',detailCandidates:[]}],[{connectionId:'J',detailCandidates:[{tieLegs:2.5}]}]])assert.throws(()=>validateDependentCandidates(model,'M',bad,commands));
assert.throws(()=>validateDependentCandidates(model,'M',rows,[{...commands[0],locked:true},commands[1]]),/DETAIL_LOCKED/);
assert.throws(()=>validateDependentCandidates(model,'M',rows,[{...commands[0],memberIds:['N']},commands[1]]),/DEPENDENT_DETAIL_UNRELATED/);
assert.throws(()=>validateDependentCandidates(model,'M',rows,[commands[0],{...commands[1],nodeId:'C'}]),/DEPENDENT_DETAIL_UNRELATED/);
assert.deepEqual([...dependentCandidateVariants()], [[]]);
console.log('PASS dependent candidates: connected targets, explicit variables, lazy combinations, versions and immutable originals');

validateDependentCandidates(model,'M',[{connectionId:'J',detailCandidates:[{jointFirstStart:0,jointFirstEnd:.025}]}],commands);
assert.throws(()=>validateDependentCandidates(model,'M',[{connectionId:'J',detailCandidates:[{jointFirstStart:-.01}]}],commands));

validateDependentCandidates(model,'M',[{connectionId:'J',detailCandidates:[{jointCrossTieHookSides:['left','right']}]}],commands);
assert.throws(()=>validateDependentCandidates(model,'M',[{connectionId:'J',detailCandidates:[{jointCrossTieHookSides:['up']}]}],commands));

const diameterRows=[{foundationId:'F',detailCandidates:[{bottomDiameterB:15.9,bottomSpacingB:100}]}];validateDependentCandidates(model,'M',diameterRows,commands);assert.equal([...dependentCandidateVariants(diameterRows,commands)][0][0].bottomDiameterB,15.9);assert.equal(commands[1].bottomDiameterB,undefined);console.log('PASS dependent foundation diameter edits preserve source commands');

const {REBAR_CATALOG_ID}=await import('../src/materials/rebarProductCatalog.js');
const catalogCommands=commands.map(c=>({...c,barCatalogId:REBAR_CATALOG_ID}));
for(const [connectionId,foundationId,edit] of [['J',undefined,{tieDiameter:14}],[undefined,'F',{bottomDiameterB:14}],[undefined,'F',{topDiameterL:17}]]){
 const r=connectionId?{connectionId,detailCandidates:[edit]}:{foundationId,detailCandidates:[edit]};
 assert.throws(()=>validateDependentCandidates(model,'M',[r],catalogCommands),{code:'REBAR_CATALOG_SIZE_MISMATCH'});
}
validateDependentCandidates(model,'M',[{connectionId:'J',detailCandidates:[{tieDiameter:13}]},{foundationId:'F',detailCandidates:[{bottomDiameterB:15.9,topDiameterL:19}]}],catalogCommands);
assert.equal(catalogCommands[0].tieDiameter,undefined);
console.log('PASS dependent catalogue products admitted before candidate execution; nominal designations preserved for typed staging');
