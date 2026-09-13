import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {evaluateFootingBarAnchorage} from '../src/design/foundation/footingAnchorage.js';
const m=createModel(),bar={diameter:.02,spacing:.15},f={B:3,L:3,thickness:.6,cover:.05,columnWidth:.4,columnDepth:.4,materialId:'concrete@1',barShape:'straight',concreteWeight:'normal',barCoating:'uncoated',reinforcement:{materialId:'steel@1',bottomB:bar,bottomL:bar,topB:bar,topL:bar}};
const r=evaluateFootingBarAnchorage(m,f);assert.equal(r.status,'OK');assert.equal(r.checks.length,4);assert.equal(r.checks.find(x=>x.face==='top').topCastFactor,1.3);
assert.equal(evaluateFootingBarAnchorage(m,{...f,B:.8}).status,'NG');
assert.equal(evaluateFootingBarAnchorage(m,{...f,barShape:undefined}).status,'NOT_CHECKED');
console.log('PASS footing bar development, casting factor and separate column-transfer scope');
