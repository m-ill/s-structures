import assert from 'node:assert/strict';
import {anchorBoltTies} from '../src/design/rc/anchorBoltTies.js';
import {stirrupDistribution} from '../src/design/rc/stirrupDistribution.js';
const distribution=spacing=>stirrupDistribution({end:1,tieFirstStart:.03,tieFirstEnd:.03,stirrups:{spacing}},3);
assert.equal(anchorBoltTies({diameter:.0127,length:3,end:'both',distribution:distribution(.06)}).status,'OK');
assert.equal(anchorBoltTies({diameter:.00953,length:3,end:'end',distribution:distribution(.06)}).status,'NG');
assert.equal(anchorBoltTies({diameter:.00953,length:3,end:'both',distribution:distribution(.03)}).status,'OK');
assert.equal(anchorBoltTies({diameter:.008,length:3,end:'both',distribution:distribution(.03)}).status,'NG');
assert.equal(anchorBoltTies({diameter:.01,length:3,distribution:distribution(.03)}).status,'NOT_CHECKED');
console.log('PASS KDS anchor-end tie counts, minimum size and declared end requirement');

assert.equal(anchorBoltTies({diameter:9.53/1000,length:3,end:'both',distribution:distribution(.03)}).status,'OK');
