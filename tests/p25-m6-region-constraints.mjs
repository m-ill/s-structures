import assert from 'node:assert/strict';
import {validateRegionConstraints,regionCandidateVariants} from '../src/design/rc/regionCandidateConstraints.js';
const constraints=[{detailId:'A',spacings:[80,100]},{detailId:'B',diameters:[20,25]}];
validateRegionConstraints(constraints,[{id:'A'},{id:'B'}]);
const variants=[...regionCandidateVariants(constraints)];assert.equal(variants.length,4);assert.equal(variants[0].A.spacing,80);assert.equal(variants[3].B.diameter,25);
assert.throws(()=>validateRegionConstraints([{detailId:'C',diameters:[20]}],[{id:'A'}]));
assert.throws(()=>validateRegionConstraints([{detailId:'A',covers:[0]}],[{id:'A'}]));
const enormous=Array.from({length:32},(_,i)=>({detailId:`R${i}`,diameters:[10,13,16,19,22,25,29,32]}));
const iterator=regionCandidateVariants(enormous);for(let i=0;i<16;i++)assert.equal(Object.keys(iterator.next().value).length,32);iterator.return();
console.log('PASS independent region constraints and lazy prefix of 8^32 combinations');

validateRegionConstraints([{detailId:'A',tieFirstStarts:[0,.02],tieFirstEnds:[.02]}],[{id:'A'}]);
assert.throws(()=>validateRegionConstraints([{detailId:'A',tieFirstStarts:[-.01]}],[{id:'A'}]));
assert.throws(()=>validateRegionConstraints([{detailId:'A',spacings:[0]}],[{id:'A'}]));

const hoops=[{detailId:'A',tieClosureCorners:['+y+z','-y-z'],tieClosureSeparations:[0,.03]}];
validateRegionConstraints(hoops,[{id:'A'}]);
const hs=[...regionCandidateVariants(hoops)];assert.equal(hs.length,4);assert.ok(hs.some(x=>x.A.tieClosureCorner==='-y-z'&&x.A.tieClosureSeparation===.03));
assert.throws(()=>validateRegionConstraints([{detailId:'A',tieClosureCorners:['invalid']}],[{id:'A'}]));
assert.throws(()=>validateRegionConstraints([{detailId:'A',tieClosureSeparations:[-1]}],[{id:'A'}]));

validateRegionConstraints([{detailId:'A',closureBarFits:['preserve','contact']}],[{id:'A'}]);
assert.throws(()=>validateRegionConstraints([{detailId:'A',closureBarFits:['approve']}],[{id:'A'}]));
assert.deepEqual([...regionCandidateVariants([{detailId:'A',closureBarFits:['contact']}])][0].A,{closureBarFit:'contact'});

validateRegionConstraints([{detailId:'A',crossTieCageFits:['preserve','separate']}],[{id:'A'}]);
assert.throws(()=>validateRegionConstraints([{detailId:'A',crossTieCageFits:['approve']}],[{id:'A'}]));
