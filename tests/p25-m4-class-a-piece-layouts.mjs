import assert from 'node:assert/strict';
import {classAActualPieceLayouts} from '../src/design/rc/classAActualPieceLayouts.js';
const detail={id:'R',version:1,memberId:'M',start:0,end:1,bars:[{y:-.2,z:-.06,area:.001,diameter:.02},{y:-.2,z:.06,area:.001,diameter:.02}]};
const splice={id:'S1',version:1,memberId:'M',reinforcementId:'R@1',barIndices:['1'],start:.1,end:.3,offsetY:0,offsetZ:.02,continuationSide:'offset-toward-end'};
const splices=[splice,{...splice,id:'S2',barIndices:['2'],start:.7,end:.9}],before=JSON.stringify({detail,splices});
const result=classAActualPieceLayouts(detail,splices,4);assert.equal(result.status,'OK');assert.equal(result.layouts.length,3);
const key=layout=>layout.map((b,i)=>Math.abs(b.z-detail.bars[i].z)>.001?1:0).join('');assert.deepEqual(result.layouts.map(key).sort(),['00','10','11']);assert.equal(JSON.stringify({detail,splices}),before);
const reverse=classAActualPieceLayouts(detail,[...splices].reverse(),4);assert.deepEqual(reverse.layouts,result.layouts);
const simultaneous=classAActualPieceLayouts(detail,[splice,{...splices[1],start:.1,end:.3}],4);assert.equal(simultaneous.layouts.length,4);
const many={...detail,bars:Array.from({length:8},(_,i)=>({...detail.bars[0],z:i*.03}))};
const grouped=Array.from({length:8},(_,i)=>({...splice,id:'S'+i,barIndices:[String(i+1)],start:i<4?.1:.7,end:i<4?.3:.9}));
const bounded=classAActualPieceLayouts(many,grouped,4);assert.equal(bounded.status,'OK');assert.equal(bounded.layouts.length,31);
assert.equal(classAActualPieceLayouts(many,grouped.map(s=>({...s,start:.1,end:.3})),4).reason,'CLASS_A_ACTUAL_PIECE_LAYOUT_LIMIT');
console.log('PASS actual coexistence excludes impossible staggered lanes, covers lap endpoints and bounds simultaneous combinations');

const incoming=classAActualPieceLayouts(detail,splices.map(s=>({...s,continuationSide:'offset-toward-start'})),4);assert.deepEqual(incoming.layouts.map(key).sort(),['00','01','11']);
const touching=classAActualPieceLayouts(detail,[{...splice,end:.5},{...splices[1],start:.5}],4);assert.equal(touching.layouts.length,4,'closed shared endpoint includes both partners for both bars');
assert.equal(classAActualPieceLayouts(detail,Array.from({length:101},(_,i)=>({...splice,id:'LIMIT'+i})),4).reason,'CLASS_A_ACTUAL_PIECE_INPUT_LIMIT');
assert.equal(classAActualPieceLayouts({...detail,bars:Array(101).fill(detail.bars[0])},splices,4).reason,'CLASS_A_ACTUAL_PIECE_INPUT_LIMIT');
