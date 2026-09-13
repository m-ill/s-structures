import assert from 'node:assert/strict';
import { designContext } from './fixtures/p24/context.js';
import { designInputCommandFromFields } from '../src/ui/indexDesignInput.js';
import { practicalCommandFromRecord } from '../src/modeling/practicalInputContract.js';
const ctx=designContext();
try {
  const command={type:'section-record',id:'P24-RECT',name:'Test rectangular section',version:1,shape:'RECT',dimensionUnit:'mm',B:300,H:500,sourceNote:'Synthetic geometry'};
  const inputHash=ctx.bridge.getWorkflowInputIdentity().inputHash;
  const plan=await ctx.call('preview_design_changes',{inputHash,requestId:'T02-preview',commands:[command]});
  assert.equal(plan.ok,true);
  assert.equal(ctx.bridge.getWorkflowInputIdentity().inputHash,inputHash);
  await ctx.call('apply_design_changes',{handle:plan.handle,requestId:'T02-apply'});
  const record=(await ctx.call('get_design_records',{channel:'sections',id:command.id,version:1})).rows[0];
  assert.ok(Math.abs(record.properties.A-0.15)<1e-14);
  assert.ok(Math.abs(record.properties.Iy-0.5*0.3**3/12)<1e-14);
  assert.ok(Math.abs(record.properties.Iz-0.3*0.5**3/12)<1e-14);
  const revised={...command,version:2,H:600};
  const next=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'T02-next',commands:[revised]});
  assert.ok(next.changes.rows.some(row=>row.path==='sections[P24-RECT@2]'&&row.before===null&&row.after.version===2),'preview must show appended version without replacing version 1');
  await ctx.call('apply_design_changes',{handle:next.handle,requestId:'T02-next-apply'});
  assert.equal((await ctx.call('get_design_records',{channel:'sections',id:command.id,version:1})).rows[0].params.H,500);
  assert.ok(Math.abs((await ctx.call('get_design_records',{channel:'sections',id:command.id,version:2})).rows[0].properties.A-0.18)<1e-14);
  const form=designInputCommandFromFields('section-record',Object.fromEntries(Object.entries(command).filter(([key])=>key!=='type').map(([k,v])=>[k,String(v)])));
  assert.deepEqual(form,command);
  for(const profile of [{shape:'H',B:300,H:500,tw:10,tf:20},{shape:'CIRC',D:400}]) {
    const typed={type:'section-record',id:`P24-${profile.shape}`,name:'Reload profile',version:1,dimensionUnit:'mm',sourceNote:'Synthetic profile',...profile};
    const preview=await ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:`T02-${profile.shape}`,commands:[typed]});
    await ctx.call('apply_design_changes',{handle:preview.handle,requestId:`T02-apply-${profile.shape}`});
    const stored=(await ctx.call('get_design_records',{channel:'sections',id:typed.id})).rows[0];
    assert.deepEqual(practicalCommandFromRecord('section-record',stored),typed);
  }
  await assert.rejects(ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'T02-override',commands:[{...revised,version:3,A:100}]}));
  await assert.rejects(ctx.call('preview_design_changes',{inputHash:ctx.bridge.getWorkflowInputIdentity().inputHash,requestId:'T02-immutable',commands:[{...command,H:700}]}));
  console.log('PASS T02/T18 section dimensions, independent A/I, immutable versions, UI/WebMCP, override rejection');
} finally {await ctx.dispose();}
