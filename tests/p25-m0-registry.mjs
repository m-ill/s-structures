import assert from 'node:assert/strict';
import {designContext} from './fixtures/p24/context.js';
const ctx=designContext();
try {
 const before=JSON.stringify(ctx.model);
 const data=await ctx.call('get_design_rule_catalog');
 assert.equal(data.version,'p25-rule-catalog-v5-service-methods');
 assert.equal(data.profiles.length,3);
 assert.deepEqual(data.serviceabilityMethods.map(m=>m.id),['instant-live-curvature','long-term-curvature','instant-live-frame']);
 const long=data.serviceabilityMethods.find(m=>m.id==='long-term-curvature');
 assert.equal(long.axialForceSupported,false);assert.equal(long.postAttachmentDeflection,true);
 assert.ok(long.conditionalFields.some(f=>f.field==='servicePreAttachmentReference'));
 const frame=data.serviceabilityMethods.find(m=>m.id==='instant-live-frame');
 assert.equal(frame.axialForceSupported,true);assert.equal(frame.postAttachmentDeflection,false);
 assert.equal(frame.methodReviewRequired,true);
 assert.ok(data.serviceabilityMethods.every(m=>m.automaticFallbackAllowed===false));

 assert.ok(data.rulePackHash);assert.ok(data.rules.some(r=>r.checkIds.includes('rc-stability')&&r.sources[0].sha256));
 assert.equal(new Set(data.rules.map(r=>r.id)).size,data.rules.length);
 assert.ok(data.documents.find(x=>x.id==='142020').clauses.includes('4.1.1'));
 assert.ok(data.profiles.every(x=>x.productionQualified===false));
 assert.ok(data.requiredSources.some(x=>x.status==='MANUFACTURER_TABLE_CAPTURED_KS_EDITION_AND_CERTIFICATE_PENDING'));
 assert.equal(data.rebarProducts.source.certificateVerified,false);assert.equal(data.rebarProducts.source.ksEditionConfirmed,false);
 assert.equal(data.gaps.length,32);
 assert.deepEqual(data,ctx.bridge.getDesignRuleCatalog());
 data.documents[0].clauses.length=0;
 assert.ok((await ctx.call('get_design_rule_catalog')).documents[0].clauses.length>0);
 assert.equal(JSON.stringify(ctx.model),before);
 console.log('PASS P25-T00 real WebMCP registry, source gaps, profiles, 32 gap owners, immutable query');
}finally{await ctx.dispose();}
