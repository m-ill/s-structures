import assert from 'node:assert/strict';
import {resolveMaterialRecord,resolveSectionRecord} from '../src/materials/registry.js';
let unrelatedReads=0,oldVersionReads=0;
const unrelated=Array.from({length:1000},(_,i)=>({id:'unused-'+i,get elastic(){unrelatedReads++;return {E:200000,G:80000};}}));
const old={id:'wanted',version:1,get elastic(){oldVersionReads++;return {E:190000,G:75000};}};
const wanted={id:'wanted',version:2,kind:'steel',elastic:{E:200000,G:80000},strength:{steel:{Fy:400,Fu:560}}};
const model={materials:[...unrelated,old,wanted]};
assert.equal(resolveMaterialRecord(model,'wanted').version,2);assert.equal(unrelatedReads,0);assert.equal(oldVersionReads,0);
assert.equal(resolveMaterialRecord(model,'wanted@1').elastic.E,190000);assert.ok(oldVersionReads>0);assert.equal(unrelatedReads,0);
wanted.elastic.E=205000;assert.equal(resolveMaterialRecord(model,'wanted@2').elastic.E,205000);
assert.equal(resolveMaterialRecord(model,'missing'),null);assert.equal(unrelatedReads,0);
let sectionReads=0;
const sectionModel={sections:[{id:'unused',get params(){sectionReads++;return {B:300,H:500};}},{id:'rect',version:1,kind:'parametric',shape:'RECT',params:{B:300,H:500}}]};
assert.ok(resolveSectionRecord(sectionModel,'rect').A>0);assert.equal(sectionReads,0);
const make=(E,version=1,extra={})=>({id:'shared',version,E,G:E/2,Fy:275,Fu:410,...extra});
const scoped={materials:[null,make(1)],globalMaterials:[make(2,9)],officeMaterials:[make(3,9)]};
assert.equal(resolveMaterialRecord(scoped,'shared').elastic.E,1);assert.equal(resolveMaterialRecord(scoped,'shared@9').elastic.E,2);
scoped.materials=[make(4,9,{deleted:true})];assert.equal(resolveMaterialRecord(scoped,'shared@9').elastic.E,4);assert.equal(resolveMaterialRecord(scoped,'shared@9')._softDeletedReference,true);assert.equal(resolveMaterialRecord(scoped,'shared').elastic.E,2);
scoped.materials.push(make(5,9));assert.equal(resolveMaterialRecord(scoped,'shared@9').elastic.E,5);
// Preserve per-collection rank, including nonmatching and null rows.
const ranked={globalMaterials:[make(9,1,{id:'other'}),make(6,9)],officeMaterials:[null,make(7,9)]};assert.equal(resolveMaterialRecord(ranked,'shared@9').elastic.E,7);
const sourced={materials:[make(8,1,{source:{scope:'global'}})],globalMaterials:[make(9,1,{source:{scope:'project'}})]};assert.equal(resolveMaterialRecord(sourced,'shared').elastic.E,9);
assert.equal(resolveMaterialRecord({},'shared',[make(11)]).elastic.E,11);assert.equal(resolveMaterialRecord({},'steel@1').kind,'steel');
const isolated=resolveMaterialRecord({materials:[wanted]},'wanted');isolated.elastic.E=1;assert.equal(wanted.elastic.E,205000);
console.log('PASS selective registry normalization: 1000 unrelated records unread, historical versions skipped, scope/rank/soft-delete/version/defaults preserved, no stale persistent cache');

const {buildMaterialLibraryReport}=await import('../src/materials/libraryReport.js');
const {buildLibraryAudit}=await import('../src/materials/registry.js');
const detailsOnly={materials:[{...wanted,id:'rebar',version:1}],designDetails:{reinforcement:[{id:'R',version:1,barMaterialId:'old@1'},{id:'R',version:2,barMaterialId:'rebar@1',stirrupMaterialId:'ties@1',stirrups:{diameter:.01}}],connections:[{id:'J',version:1,jointMaterialId:'joint-concrete@1',reinforcement:{materialId:'joint-bars@1'}}],foundations:[{id:'F',version:1,materialId:'footing-concrete@1',reinforcement:{materialId:'footing-bars@1'}}]}};
const detailedAudit=buildLibraryAudit(detailsOnly),detailedReport=buildMaterialLibraryReport(detailsOnly);
assert.deepEqual(detailedAudit.resolvedReferences.materials.map(r=>r.ref),['footing-bars@1','footing-concrete@1','joint-bars@1','joint-concrete@1','rebar@1','ties@1']);assert.equal(detailedAudit.unresolvedReferences.length,5);assert.equal(detailedReport.summary.materialReferenceCount,6);assert.equal(detailedReport.summary.unresolvedReferenceCount,5);assert.equal(detailedReport.review.registryReady,false);assert.ok(detailedReport.review.blockers.includes('unresolved-library-references'));assert.equal(detailedReport.materials.some(r=>r.ref==='old@1'),false);
console.log('PASS material audit/report includes latest rebar/joint/footing references and blocks unresolved detail materials');

const external={globalMaterials:[{id:'bad-global',version:1,kind:'steel',elastic:{E:-1,G:80000},strength:{steel:{Fy:400,Fu:560}}}],officeSections:[{id:'bad-office',version:1,kind:'direct',properties:{A:-1,Iy:1,Iz:1}}],members:[{id:'M',matId:'bad-global@1',secId:'bad-office@1'}]};
const externalAudit=buildLibraryAudit(external),externalReport=buildMaterialLibraryReport(external);assert.equal(externalAudit.materialErrors.length,0);assert.ok(externalAudit.referencedValidation.materials[0].errors.includes('elastic.E'));assert.ok(externalAudit.referencedValidation.sections[0].errors.includes('properties.A'));assert.equal(externalReport.review.registryReady,false);assert.ok(externalReport.review.blockers.includes('referenced-material-schema-errors'));assert.ok(externalReport.review.blockers.includes('referenced-section-schema-errors'));assert.equal(externalReport.summary.referencedMaterialErrorCount,1);
external.materials=[{...wanted,id:'bad-global',version:1}];assert.equal(buildLibraryAudit(external).referencedValidation.materials[0].errors.length,0);external.members=[];assert.equal(buildLibraryAudit(external).referencedValidation.materials.length,0);
console.log('PASS active external library records are validated after scope selection; unused/shadowed records do not contaminate referenced validation');
