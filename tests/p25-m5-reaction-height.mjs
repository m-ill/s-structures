import {evaluateProvidedFooting} from '../src/design/foundation/providedFooting.js';
import assert from 'node:assert/strict';
import {createModel} from '../src/core/model.js';
import {resolveFootingLoadLedger} from '../src/design/foundation/footingLoadLedger.js';
import {criticalPerimeterActions} from '../src/design/foundation/eccentricPunching.js';
const m=createModel();m.loadCases=[{id:'D',type:'dead'}];const combo={id:'U',type:'strength',factors:{D:1}};
const f={B:3,L:3,thickness:.5,materialId:'concrete@1',reactionBasis:'superstructure-only',footingWeightCaseId:'D',columnOffsetX:.3,columnOffsetY:-.2,reactionMomentReference:'column-center',reactionVerticalReference:'footing-top'};
const reaction={rx:20,ry:30,rz:400,rmx:10,rmy:-20,rmz:5};
const r=resolveFootingLoadLedger(m,f,reaction,combo);
assert.equal(r.ok,true);assert.equal(r.reactionHeightAboveBase,.5);assert.equal(r.totalMx,-85);assert.equal(r.totalMy,-130);
assert.equal(r.columnBaseMx,-5);assert.equal(r.columnBaseMy,-10);assert.equal(r.columnMx,10);assert.equal(r.columnMy,-20);assert.equal(r.totalMz,18);assert.equal(r.columnMz,5);
const explicit=resolveFootingLoadLedger(m,{...f,reactionVerticalReference:'specified-height',reactionHeightAboveBase:.5},reaction,combo);assert.equal(explicit.totalMx,r.totalMx);assert.equal(explicit.totalMy,r.totalMy);
const thicker=resolveFootingLoadLedger(m,{...f,thickness:.7},reaction,combo);assert.equal(thicker.reactionHeightAboveBase,.7);assert.ok(Math.abs(thicker.totalMx+91)<1e-10);assert.ok(Math.abs(thicker.totalMy+126)<1e-10);assert.ok(Math.abs(thicker.columnMx-10)<1e-10);
const base=resolveFootingLoadLedger(m,{...f,reactionVerticalReference:'footing-base',reactionMomentReference:'footing-center'},{...reaction,rmx:r.totalMx,rmy:r.totalMy,rmz:r.totalMz},combo);
assert.equal(base.totalMx,r.totalMx);assert.equal(base.totalMy,r.totalMy);assert.equal(base.columnMx,r.columnMx);assert.equal(base.columnMy,r.columnMy);assert.equal(base.columnMz,r.columnMz);
assert.equal(resolveFootingLoadLedger(m,{...f,reactionVerticalReference:undefined},reaction,combo).reason,'FOOTING_REACTION_HEIGHT_REFERENCE_REQUIRED');
assert.equal(resolveFootingLoadLedger(m,{...f,reactionVerticalReference:'specified-height',reactionHeightAboveBase:-1},reaction,combo).reason,'FOOTING_REACTION_HEIGHT_INVALID');
assert.equal(resolveFootingLoadLedger(m,{...f,reactionHeightAboveBase:.5},reaction,combo).reason,'FOOTING_REACTION_HEIGHT_CONTRACT_INVALID');
const vertical=resolveFootingLoadLedger(m,{...f,reactionVerticalReference:undefined},{...reaction,rx:0,ry:0},combo);assert.equal(vertical.ok,true);
// The interior punching cut uses the base-level moment, not the top joint moment.
const action=criticalPerimeterActions({B:1,L:1,x:.3,y:-.2,reaction,ledger:r,contact:{polygon:[[-1.5,-1.5],[1.5,-1.5],[1.5,1.5],[-1.5,1.5]],pressurePlane:[60,0,0]}});
assert.ok(Math.abs(action.Mx+5)<1e-9);assert.ok(Math.abs(action.My+10)<1e-9);
console.log('PASS reaction height cross-product, base/top joint distinction, thickness following, equivalent reference and missing-input rejection');

m.loadCombinations=[combo];m.designDetails={ground:[{id:'G',version:1,allowableBearing:150,bearingBasis:'gross',friction:.5}]};
const footing={...f,id:'F',version:1,nodeId:'A',groundId:'G@1',cover:.05,columnWidth:.4,columnDepth:.4};
const sliding=evaluateProvidedFooting(m,footing,{combo:{id:'U'},reactions:{A:reaction}})['foundation-sliding'];
assert.equal(sliding.status,'NOT_CHECKED');assert.equal(sliding.reason,'FOUNDATION_BASE_TORSION_SLIDING_REQUIRED');assert.equal(sliding.torsionDemand,18);
assert.equal(evaluateProvidedFooting(m,footing,{combo:{id:'U'},reactions:{A:{...reaction,rmz:-13}}})['foundation-sliding'].status,'OK');
