import {resolveSectionRecord} from '../../materials/registry.js';
import {perimeterBarLayout} from './perimeterBarLayout.js';
// Recognize coordinates and connections, not a user-editable provenance flag.
// This layout has paired Y faces, four corners and no intermediate Z-face bars.
export function inferGeneratedPairedCage(command,model){
 const bars=command?.bars,n=bars?.length/2;
 if(!model||!Number.isInteger(n)||n<3||n>12||!Array.isArray(command.crossTieBarPairs))return null;
 const member=model.members?.find(m=>m.id===command.memberId),section=member&&resolveSectionRecord(model,member.secId);
 if(!['RECT','SQUARE'].includes(section?.shape))return null;
 let expected;try{expected=perimeterBarLayout(bars,{B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,cover:command.cover,tieDiameter:command.stirrupDiameter/1000,insideRadius:command.tieBendInsideRadius,yCount:n,zCount:2});}catch{return null;}
 if(expected.bars.some((b,i)=>!Number.isFinite(bars[i].y)||!Number.isFinite(bars[i].z)||Math.abs(b.y-bars[i].y)>1e-9||Math.abs(b.z-bars[i].z)>1e-9))return null;
 const normalize=p=>typeof p==='string'&&/^\d+:\d+$/.test(p)?p.split(':').map(Number).sort((a,b)=>a-b).join(':'):null;
 const pairs=command.crossTieBarPairs.map(normalize),wanted=expected.pairs.map(normalize);
 if(pairs.some(p=>p===null)||new Set(pairs).size!==pairs.length||pairs.length!==wanted.length||wanted.some(p=>!pairs.includes(p)))return null;
 return {barsPerFace:n,layersPerFace:1,basis:'verified-generated-paired-face-geometry'};
}
