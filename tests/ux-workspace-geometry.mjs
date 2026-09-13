import assert from 'node:assert/strict';
import {defaultWorkRect,anchorMenuRect} from '../src/ui/workspaceUxShell.js';
for(const [width,height] of [[1440,900],[1024,768],[390,680]]){const r=defaultWorkRect(width,height,48);assert.ok(r.left>=8&&r.top>=48);assert.ok(r.left+r.width<=width-8&&r.top+r.height<=height-8);}
assert.deepEqual(anchorMenuRect({left:1000,bottom:740},{width:280,height:600},{width:1024,height:768}),{left:736,top:160,width:280,height:600});
const narrow=anchorMenuRect({left:0,bottom:45},{width:300,height:1000},{width:240,height:300});assert.equal(narrow.width,224);assert.equal(narrow.height,284);assert.equal(narrow.top,8);
console.log('PASS UX default placement and menu boundary geometry');
