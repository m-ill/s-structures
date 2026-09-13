import assert from 'node:assert/strict';
import {classAStrengthStations} from '../src/design/rc/classAStrengthStations.js';
import {evaluateKdsSection} from '../src/design/rc/kdsStrength.js';
const rows=[{x:0,N:0,My:0,Mz:0},{x:1,N:0,My:0,Mz:1},{x:2,N:0,My:0,Mz:2},{x:3,N:0,My:0,Mz:-1},{x:4,N:0,My:0,Mz:-2},{x:5,N:1,My:0,Mz:1},{x:6,N:0,My:1,Mz:2},{x:7,N:0,My:2,Mz:4},{x:8,N:0,My:2.001,Mz:4}];
const before=JSON.stringify(rows),selected=classAStrengthStations(rows);assert.deepEqual(selected.stations.map(t=>t.x),[0,2,4,5,7,8]);assert.equal(JSON.stringify(rows),before);
assert.equal(classAStrengthStations([...rows,{...rows[2],x:9,signConvention:'frame'}]).selectedCount,7);
const section={B:.3,H:.6},bars=[-1,1].flatMap(y=>[-1,1].map(z=>({y:y*.2,z:z*.08,diameter:.02,area:Math.PI*.02**2/8,physicalArea:Math.PI*.02**2/4}))),material={fc:24,fy:400,Es:200000};
const full=rows.map(r=>evaluateKdsSection(section,bars,material,r)),reduced=selected.stations.map(r=>evaluateKdsSection(section,bars,material,r));assert.ok(full.every(r=>r.status==='OK'));assert.equal(Math.max(...full.map(r=>r.ratio)),Math.max(...reduced.map(r=>r.ratio)));
const overloaded=[...rows,{x:10,N:0,My:0,Mz:1e6}],over=classAStrengthStations(overloaded);assert.ok(over.stations.some(r=>evaluateKdsSection(section,bars,material,r).status==='NG'));
console.log('PASS exact N/direction/sign groups retain strongest demands and zero bending; full KDS sweep agrees');

assert.equal(classAStrengthStations(Array(601).fill(rows[0])).status,'NOT_CHECKED');assert.equal(classAStrengthStations([{N:0,My:NaN,Mz:0}]).status,'NOT_CHECKED');
