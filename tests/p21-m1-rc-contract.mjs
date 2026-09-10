import assert from 'node:assert/strict';
import { checkConcreteMember, concreteSectionProps } from '../src/design/concrete.js';

const material={id:'RC',kind:'concrete',Fy:24000};
const member={id:'C',matId:'RC',secId:'S',design:{role:'column'}};
const demand={ax:{x:[0,0,1]},Nmax:1000,Mymax:0,Mzmax:100,Vymax:20,Vzmax:5,
  xs:[0,4],N:[-1000,0],My:[0,0],Mz:[0,100],Vy:[20,20],Vz:[5,5]};
const scope={combo:{id:'A'}};
const section=(b,h=b,shape='RECT')=>({id:'S',shape,dims:shape==='SQUARE'?{B:b}:{B:b,H:h},A:b*h/1e6});
const check=(s=section(400,400,'SQUARE'), d=demand, m=member, params={})=>checkConcreteMember(m,d,s,material,params,scope);
const get=(r,id)=>r.checks.find(x=>x.id===id);
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(b)),`${label}: ${a} != ${b}`);
for(const b of [300,400,500]) {
  const square=check(section(b,b,'SQUARE')),rect=check(section(b,b));
  assert.equal(square.section.h,b/1000);
  for(const id of ['rc-flexure-z','rc-flexure-y','rc-shear-z','rc-shear-y','rc-axial']) close(get(square,id).capacity,get(rect,id).capacity,`${b} square/rect ${id}`);
  close(get(square,'rc-flexure-z').capacity,get(square,'rc-flexure-y').capacity,'square axes');
}
const fixed=check();
close(get(fixed,'rc-flexure-z').capacity,224.91,'400 square capacity from explicit preliminary equation');
close(get(fixed,'rc-column-interaction').ratio,Math.max(1000/2713.776,100/224.91),'concurrent P-M: separate station maxima must not be added');
assert.equal(get(fixed,'rc-column-interaction').x,4);
const unbound=checkConcreteMember(member,demand,section(400),material,{},{});
assert.equal(get(unbound,'rc-column-interaction').status,'NOT_CHECKED');
assert.equal(unbound.ok,false);
const beam={...member,design:{role:'beam'}};
const br=check(section(300,500),demand,beam);
assert.equal(br.role,'beam','authored role is independent of force/moment numeric magnitudes');
assert.equal(get(br,'rc-column-interaction').status,'N_A');
assert.ok(!br.messages.some(x=>/COLUMN_REBAR/.test(x.code)));
close(get(br,'rc-shear-y').capacity,0.75*0.17*Math.sqrt(24)*300*450/1000,'Vy / Mz plane');
close(get(br,'rc-shear-z').capacity,0.75*0.17*Math.sqrt(24)*500*250/1000,'Vz / My plane');
const rotated={...demand,Mymax:demand.Mzmax,Mzmax:demand.Mymax,Vymax:demand.Vzmax,Vzmax:demand.Vymax,
  My:demand.Mz,Mz:demand.My,Vy:demand.Vz,Vz:demand.Vy};
const rr=check(section(500,300),rotated,beam);
for(const type of ['flexure','shear']) {
  close(get(br,`rc-${type}-y`).capacity,get(rr,`rc-${type}-z`).capacity,`${type} rotated capacity`);
  close(get(br,`rc-${type}-y`).ratio,get(rr,`rc-${type}-z`).ratio,`${type} rotated demand`);
}
for(const invalidSection of [{shape:'RECT',dims:{B:400},A:.16},section(0),{shape:'CIRC',dims:{D:400},A:.12},{...section(400),A:.24}]) {
  const r=check(invalidSection);assert.equal(r.status,'NOT_CHECKED');assert.equal(r.ok,false);assert.equal(r.utilization,null);
}
for(const value of [null,0,NaN,Infinity]) {
  const r=check(undefined,demand,member,{members:{C:{As:value}}});assert.equal(r.status,'NOT_CHECKED');
  assert.throws(()=>concreteSectionProps(section(400),{b:value}),error=>error.code.startsWith('RC_'));
}
const tension=check(undefined,{...demand,N:[1000,0]});
assert.equal(tension.status,'NOT_CHECKED');assert.equal(get(tension,'rc-axial-tension').status,'NOT_CHECKED');
const noStrength=checkConcreteMember(member,demand,section(400),{}, {},scope);
assert.equal(noStrength.status,'NOT_CHECKED');
assert.equal(fixed.designTransferAllowed,false);
console.log(JSON.stringify({ok:true,square400Capacity:get(fixed,'rc-flexure-z').capacity,concurrentInteraction:get(fixed,'rc-column-interaction').ratio,scope:'preliminary RC geometry/axis/role/input/concurrent-demand contract; not detailed reinforcement qualification'}));

for (const bad of [undefined, null]) { const r=checkConcreteMember(member,demand,bad,material,{},scope); assert.equal(r.status,'NOT_CHECKED'); assert.equal(r.requiredRebar.AsZ,null); }
assert.equal(check(undefined,demand,{...member,design:{role:'invalid'}}).status,'NOT_CHECKED');
