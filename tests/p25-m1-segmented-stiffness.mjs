import assert from 'node:assert/strict';
import {resolveMemberTaper,localTaperedK12,integrateTaperedProperties,taperedMemberMass} from '../src/solver/taperedMember.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<=Math.abs(b)*1e-12,`${a} != ${b}`);
const base={id:'a',A:.02,Ay:.016,Az:.016,Iy:.0001,Iz:.0004,J:.00005};
const weak={...base,id:'b',A:.01,Iy:base.Iy/10,Iz:base.Iz/10};
const sec=id=>id==='a'?base:weak;
const make=(end,points)=>resolveMemberTaper({}, {secId:'a',taper:{profile:'segments',gaussPoints:points,segments:[{start:0,end,sectionId:'b'},{start:end,end:1,sectionId:'a'}]}},base,{section:sec});
for(const boundary of [.001,.173,.499])for(const points of [5,10]){
 const t=make(boundary,points),L=4,E=2e8;
 assert.equal(t.ok,true);
 const props=integrateTaperedProperties(t,L);
 near(props.A,L*(boundary*weak.A+(1-boundary)*base.A));
 near(taperedMemberMass({density:7850},t,L),7850*props.A);
 const r=localTaperedK12({E,G:E/2.6},t,L);
 assert.equal(r.ok,true);
 // Tip-force compliance integral: integral (L-x)^2/(EI) dx.
 const expected=L**3/(3*E)*((1-(1-boundary)**3)/weak.Iz+(1-boundary)**3/base.Iz);
 const K=r.kl,a=K[7][7],b=K[7][11],d=K[11][11];
 near(d/(a*d-b*b),expected);
}
console.log('PASS segmented stiffness and mass integrate every interval, including 0.1% root segment');

// Exercise the real assembly/recovery path, not only the local flexibility kernel.
const {analyzeModel,createCantileverTipLoad}=await import('../src/index.js');
const {materialOf,sectionOf}=await import('../src/core/catalogs.js');
const model=createCantileverTipLoad().model,member=model.members[0],start=model.sections[0];
model.sections.push({...structuredClone(start),id:'soft-root',name:'Soft root',Iy:start.Iy/10,Iz:start.Iz/10});
member.taper={profile:'segments',gaussPoints:5,segments:[{start:0,end:.001,sectionId:'soft-root'},{start:.001,end:1,sectionId:member.secId}]};
const result=analyzeModel(model),run=result.byCombo.D_ONLY;
assert.equal(result.ok,true);
const nodes=[member.n1,member.n2].map(id=>model.nodes.find(n=>n.id===id));
const L=Math.hypot(nodes[1].x-nodes[0].x,nodes[1].y-nodes[0].y,nodes[1].z-nodes[0].z);
const E=materialOf(model,member.matId).E,I=sectionOf(model,member.secId).Iz;
const P=Math.abs(model.loads.find(l=>l.node===member.n2).P);
const expected=P*L**3/(3*E*I)*(10*(1-.999**3)+.999**3);
near(Math.abs(run.disp[member.n2][2]),expected);
near(run.memberResults[member.id].taper.stationSections[0].Iz,I/10);
near(run.memberResults[member.id].taper.stationSections.at(-1).Iz,I);
assert.ok(run.summary.equilibriumResidual<1e-10);
console.log('PASS real segmented frame assembly, end displacement, station sections and equilibrium');

// The recovered internal curve must integrate the same piecewise EI as assembly.
const x=L/2,a0=.001*L;
const primitive=s=>x*L*s-(x+L)*s*s/2+s**3/3;
const midExpected=P/(E*I)*(10*primitive(a0)+primitive(x)-primitive(a0));
near(Math.abs(run.memberResults[member.id].shape[10][2]),midExpected);
// A fixed-fixed distributed load must close both displacement and rotation.
const loaded=structuredClone(model);loaded.nodes.find(n=>n.id===member.n2).support='fixed';
loaded.loads=[{id:'Q',type:'udl',member:member.id,dir:'-z',w:2,case:'D'}];
const fixed=analyzeModel(loaded);assert.equal(fixed.ok,true);
const trace=fixed.byCombo.D_ONLY.memberResults[member.id].deformationRecovery;
assert.ok(trace.endDisplacementResidual<1e-12,JSON.stringify(trace));
assert.ok(trace.endRotationResidual<1e-12,JSON.stringify(trace));
console.log('PASS variable-section internal shape and fixed-fixed load compatibility');

const free=structuredClone(model);free.loads=[{id:'Q',type:'udl',member:member.id,dir:'-z',w:2,case:'D'}];
const qRun=analyzeModel(free).byCombo.D_ONLY;
const qExpected=2*L**4/(8*E*I)*(10*(1-.999**4)+.999**4);
near(Math.abs(qRun.disp[member.n2][2]),qExpected);
near(Math.abs(qRun.memberResults[member.id].shape.at(-1)[2]),qExpected);
for(const load of [
 {type:'point',P:3,t:.213,dir:'-z'},
 {type:'trapezoid',w1:1,w2:3,from:.13,to:.87,dir:'+y'},
 {type:'udl-partial',w:2,from:.12,to:.71,dir:'+x'},
 {type:'mmoment',M:2,at:.33,axis:'x'},
 {type:'mmoment',M:2,at:.33,axis:'z'}
]){
 const f=structuredClone(loaded);f.loads=[{id:'test',member:member.id,case:'D',...load}];
 const r=analyzeModel(f);assert.equal(r.ok,true,JSON.stringify(r.diagnostics));
 const trace=r.byCombo.D_ONLY.memberResults[member.id].deformationRecovery;
 assert.ok(trace.endDisplacementResidual<1e-12,JSON.stringify({load,trace}));
 assert.ok(trace.endRotationResidual<1e-12,JSON.stringify({load,trace}));
}
console.log('PASS distributed-load independent tip integral and point/partial/trapezoid/couple compatibility');

for(const thermal of [
 {type:'temperature',dT:30,alpha:1e-5},
 {type:'tgradient',dTtop:30,dTbot:0,h:.2,alpha:1e-5}
]){
 const f=structuredClone(model);f.loads=[{id:'heat',member:member.id,case:'D',...thermal}];
 const output=analyzeModel(f);assert.equal(output.ok,true);
 const r=output.byCombo.D_ONLY,shape=r.memberResults[member.id].shape;
 const expected=thermal.type==='temperature'?30e-5*L:-30e-5/.2*L*L/2;
 const direction=thermal.type==='temperature'?0:2;
 near(shape.at(-1)[direction],expected);
 near(r.disp[member.n2][direction],expected);
 f.nodes.find(n=>n.id===member.n2).support='fixed';
 const fixed=analyzeModel(f);assert.equal(fixed.ok,true);
 const trace=fixed.byCombo.D_ONLY.memberResults[member.id].deformationRecovery;
 assert.ok(trace.endDisplacementResidual<1e-12,JSON.stringify(trace));
 assert.ok(trace.endRotationResidual<1e-12,JSON.stringify(trace));
}
console.log('PASS thermal free deformation and restrained compatibility through actual frame solver');

const {taperedForceDisplacement}=await import('../src/solver/memberForceField.js');
const varying=make(.173,5);varying.segments[0].section.H=.4;varying.segments[1].section.H=.2;
const thermal=[{type:'initial-strain',alphaDeltaT:.0003,explicitDepth:null}];
const freeThermal=taperedForceDisplacement(new Array(12).fill(0),thermal,4,4,{E:2e8,G:8e7},varying);
const aThermal=.173*4,firstMoment=4*aThermal-aThermal*aThermal/2;
near(freeThermal[1],-.0003*(firstMoment/.4+(8-firstMoment)/.2));
near(freeThermal[5],-.0003*(aThermal/.4+(4-aThermal)/.2));
console.log('PASS thermal gradient uses local segment depth when no load depth is specified');
