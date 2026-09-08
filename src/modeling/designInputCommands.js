import { previewDesignBasisChangeSet, applyDesignBasisChangeSet } from '../design/designBasisChangeSet.js';
import { DESIGN_BASIS_NUMERIC_FIELDS, OCCUPANCY_LOAD_PRESETS } from '../design/designBasisInput.js';
import { applyDesignBasisLoads } from '../design/loadEstimation.js';
import { previewMassSourceChangeSet, applyMassSourceChangeSet } from '../loads/massSource.js';
import { previewLoadCombinationChangeSet, applyLoadCombinationChangeSet } from '../loads/loadCombinationChangeSet.js';
import { KDS_41_12_00_2022_RULE_PACK } from '../core/kdsLoadCombinations.js';
import { createAnalysisCase } from '../core/analysisCase.js';
import { resolveMaterialRecord, resolveSectionRecord } from '../materials/registry.js';
import { applyModelChangeSet } from './transaction.js';

export const DESIGN_INPUT_TYPES = Object.freeze(['design-basis', 'generate-loads', 'node-mass', 'mass-source', 'load-case', 'load', 'combination', 'generate-combinations', 'member-assignment', 'member-design', 'analysis-case']);
export const DESIGN_INPUT_UNITS = Object.freeze({ length:'m', force:'kN', moment:'kN.m', stress:'N/mm2', displacement:'mm' });
export const MEMBER_DESIGN_FIELDS = Object.freeze({ Ky:'-', Kz:'-', Lb:'m', LbZ:'m', unbracedLength:'m', Cb:'-', C1:'-', ltbK:'-', deflectionLimitTotal:'L/limit', compressionSlendernessLimit:'-', cover:'m', rebarFy:'N/mm2', beamRebarRatio:'-', columnRebarRatio:'-' });
const BASIS_FIELDS = DESIGN_BASIS_NUMERIC_FIELDS.map(x=>x.id);
const own = (x,k)=>Object.prototype.hasOwnProperty.call(x,k);
export function fail(code, details) { throw Object.assign(new Error(code), {code,details}); }
export function object(value, fields) {
  if (!value || typeof value!=='object' || Array.isArray(value)) fail('OBJECT_REQUIRED');
  const extra=Object.keys(value).filter(k=>!fields.includes(k));
  if(extra.length) fail('UNSUPPORTED_FIELDS',{fields:extra});
}
export function finiteJson(value, seen=new Set()) {
  if(typeof value==='number' && !Number.isFinite(value)) fail('NONFINITE_INPUT');
  if(value===undefined || ['function','symbol','bigint'].includes(typeof value)) fail('NON_JSON_INPUT');
  if(value===null || typeof value!=='object') return;
  if(seen.has(value)) fail('CYCLIC_INPUT');
  if(!Array.isArray(value) && ![Object.prototype,null].includes(Object.getPrototypeOf(value))) fail('NON_JSON_INPUT');
  seen.add(value);
  for(const [key,item] of Object.entries(value)) {
    if(['__proto__','constructor','prototype'].includes(key)) fail('UNSAFE_KEY');
    finiteJson(item,seen);
  }
  seen.delete(value);
}
function num(v,min=0,max=1e12) { if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max) fail('NUMBER_OUT_OF_RANGE',{value:v,min,max}); }
function positive(v,max=1e12) {num(v,Number.MIN_VALUE,max);}
function text(v) {if(typeof v!=='string'||!v.trim()||v.length>128) fail('IDENTIFIER_REQUIRED');}
function one(v,values) {if(!values.includes(v)) fail('UNSUPPORTED_VALUE',{value:v,allowed:values});}
function list(v,max=1000) {if(!Array.isArray(v)||!v.length||v.length>max) fail('ARRAY_SIZE_INVALID');}
function target(model,collection,id) {text(id);const row=(model[collection]||[]).find(x=>x.id===id);if(!row) fail('TARGET_NOT_FOUND',{collection,id});return row;}
function ids(model,collection,values) {list(values);if(new Set(values).size!==values.length) fail('DUPLICATE_ID');return values.map(id=>target(model,collection,id));}
function write(model,collection,row,mode) {
  one(mode,['create','update']);text(row.id);
  const result=applyModelChangeSet(model,{changes:[{collection,id:row.id,op:mode==='create'?'add':'replace',value:row}]});
  if(!result.ok) fail('TRANSACTION_INVALID',result.errors);
  model[collection]=result.model[collection];
}
function previewOK(result,warnings) {
  warnings.push(...(result.warnings||[]));
  if(result.errors?.length||result.status==='blocked') fail('CHANGE_SET_BLOCKED',result.errors);
  if(result.conflicts?.length) fail('USER_OWNED_CONFLICT',result.conflicts);
}
function refs(model,factors) {
  object(factors,Object.keys(factors));if(!Object.keys(factors).length) fail('FACTORS_REQUIRED');
  for(const [id,value] of Object.entries(factors)) {target(model,'loadCases',id);num(value,-100,100);}
}

// Inputs are deliberately narrower than the legacy permissive normalizers.
// Unsupported fields never disappear into a successful response.
export function stageDesignInputCommand(model,c,context,warnings) {
  one(c.type,DESIGN_INPUT_TYPES);
  if(c.type==='design-basis') {
    object(c,['type','patch']);object(c.patch,[...BASIS_FIELDS,'occupancy','designMethod']);
    for(const [k,v] of Object.entries(c.patch)) {
      if(BASIS_FIELDS.includes(k)) num(v,0,k.includes('Ratio')||k.includes('Factor')||k.includes('Coefficient')?1:1e8);
      else if(k==='occupancy') one(v,Object.keys(OCCUPANCY_LOAD_PRESETS));
      else one(v,['strength','allowable']);
    }
    const p=previewDesignBasisChangeSet(model,c.patch,{includeLoadPreview:false});previewOK(p,warnings);
    applyDesignBasisChangeSet(model,p);
    warnings.push({code:'BASIS_LOADS_REQUIRE_GENERATION',message:'Basis changes do not regenerate physical loads; add generate-loads to the same request when required.'});
  } else if(c.type==='generate-loads') {
    object(c,['type']);
    const result=applyDesignBasisLoads(model,model.designBasis||{}, {replaceGenerated:true});
    const conflicts=(result.application?.conflicts||[]).filter(row=>{
      const compatible=row.code==='load-case-user-modified-conflict' && row.existing?.type===row.proposed?.type
        && ['direction','sign','family'].every(key=>row.existing[key]==null || row.existing[key]===row.proposed[key]);
      if(compatible) warnings.push({code:'MANUAL_LOAD_CASE_PRESERVED',message:`Existing load case ${row.id} is preserved.`,id:row.id});
      return !compatible;
    });
    if(conflicts.length) fail('USER_OWNED_CONFLICT',conflicts);
    warnings.push({code:'GENERATED_LOAD_SCOPE',message:'Project wind/seismic coefficients are supplied inputs; this generator does not independently verify code compliance.'});
  } else if(c.type==='node-mass') {
    object(c,['type','nodeIds','mass','unit']);one(c.unit,['kN.s2/m']);list(c.mass,3);if(c.mass.length!==3) fail('TRANSLATIONAL_MASS_REQUIRED');c.mass.forEach(v=>num(v));
    for(const row of ids(model,'nodes',c.nodeIds)) row.mass=[...c.mass,...(Array.isArray(row.mass)&&row.mass.length===6?row.mass.slice(3):[])];
  } else if(c.type==='mass-source') {
    object(c,['type','id','entries','includeNodeMass','includeMemberMass','includeSelfWeight','gravity','activate']);text(c.id);list(c.entries);
    const seen=new Set();for(const entry of c.entries) {object(entry,['case','factor']);target(model,'loadCases',entry.case);num(entry.factor,0,100);if(seen.has(entry.case)) fail('DUPLICATE_ID');seen.add(entry.case);}
    for(const key of ['includeNodeMass','includeMemberMass','includeSelfWeight','activate']) if(own(c,key)&&typeof c[key]!=='boolean') fail('BOOLEAN_REQUIRED');
    if(own(c,'gravity')) positive(c.gravity,100);
    const {type,activate,...input}=c;
    const p=previewMassSourceChangeSet(model,{...input,origin:'template',sourceId:'p19-design-input'},{activate:activate!==false});previewOK(p,warnings);applyMassSourceChangeSet(model,p);
    for(const row of model.analysisCases||[]) if(row.settings?.massSource?.id===c.id) row.settings.massSource=structuredClone(target(model,'massSources',c.id));
  } else if(c.type==='load-case') {
    object(c,['type','mode','id','name','loadType']);text(c.id);text(c.name);one(c.loadType,['dead','live','roofLive','wind','seismic','snow','rain','temperature','other']);
    const previous=c.mode==='update'?target(model,'loadCases',c.id):{};
    if(previous.type && previous.type!==c.loadType) fail('LOAD_CASE_TYPE_IMMUTABLE');
    write(model,'loadCases',{...previous,id:c.id,name:c.name,type:c.loadType,origin:'manual',userModified:true},c.mode);
  } else if(c.type==='load') {
    object(c,['type','mode','value']);const r=c.value;object(r,['id','type','node','member','P','w','M','at','dir','case','unit']);one(r.type,['nodal','udl','nmoment','mmoment']);target(model,'loadCases',r.case);one(r.dir,['+x','-x','+y','-y','+z','-z']);
    const field=r.type==='nodal'?'P':r.type==='udl'?'w':'M';
    const nodal=['nodal','nmoment'].includes(r.type);
    const allowed=['id','type',nodal?'node':'member',field,'dir','case','unit',...(r.type==='mmoment'?['at']:[])];object(r,allowed);
    target(model,nodal?'nodes':'members',nodal?r.node:r.member);num(r[field],-1e10,1e10);
    if(r.type==='mmoment') num(r.at,0,1);
    one(r.unit,[r.type==='nodal'?'kN':r.type==='udl'?'kN/m':'kN.m']);
    write(model,'loads',{...r,origin:'manual',userModified:true},c.mode);
  } else if(c.type==='combination') {
    object(c,['type','mode','id','name','purpose','factors']);text(c.name);one(c.purpose,['strength','service']);refs(model,c.factors);
    write(model,'loadCombinations',{id:c.id,name:c.name,type:c.purpose,factors:structuredClone(c.factors),origin:'manual',userModified:true},c.mode);
    warnings.push({code:'MANUAL_COMBINATION_REVIEW',message:'Manual combination factors carry no automatic rule-pack approval.'});
  } else if(c.type==='generate-combinations') {
    object(c,['type','rulePackId','method','purpose']);text(c.rulePackId);one(c.method,['strength','allowable']);if(own(c,'purpose')) one(c.purpose,['strength','service']);
    const pack=context.resolveRulePack?.(c.rulePackId) || (c.rulePackId===KDS_41_12_00_2022_RULE_PACK.id?KDS_41_12_00_2022_RULE_PACK:null);
    if(!pack) fail('RULE_PACK_NOT_FOUND');
    const options={method:c.method,mode:'merge',...(c.purpose?{purpose:c.purpose}:{})};
    const p=previewLoadCombinationChangeSet(model,pack,options);previewOK(p,warnings);
    // Approval is obtained from a trusted host resolver, never from command data.
    const approval=context.resolveCombinationApproval?.(model,p) || null;
    const result=applyLoadCombinationChangeSet(model,p,{...options,...(approval?{projectApproval:approval}:{} )});previewOK(result,warnings);
  } else if(c.type==='member-assignment') {
    object(c,['type','memberIds','matId','secId']);if(!c.matId&&!c.secId) fail('ASSIGNMENT_REQUIRED');
    for(const key of ['matId','secId']) if(own(c,key)) text(c[key]);
    if(c.matId&&!resolveMaterialRecord(model,c.matId)) fail('MATERIAL_NOT_FOUND');
    if(c.secId&&!resolveSectionRecord(model,c.secId)) fail('SECTION_NOT_FOUND');
    for(const row of ids(model,'members',c.memberIds)) {if(c.matId) row.matId=c.matId;if(c.secId) row.secId=c.secId;}
  } else if(c.type==='member-design') {
    object(c,['type','memberIds','patch']);object(c.patch,Object.keys(MEMBER_DESIGN_FIELDS));if(!Object.keys(c.patch).length) fail('PATCH_REQUIRED');
    for(const [k,v] of Object.entries(c.patch)) {positive(v,k.includes('Ratio')?0.1:k==='cover'?1:1e6);}
    model.designParams ||= {};model.designParams.members ||= {};
    const aliases=[['Lb','LbZ','unbracedLength'],['C1','Cb']];
    for(const group of aliases) if(group.filter(key=>own(c.patch,key)).length>1) fail('AMBIGUOUS_DESIGN_FIELDS',{fields:group});
    for(const row of ids(model,'members',c.memberIds)) {
      if(row.type!=='frame') fail('MEMBER_DESIGN_UNSUPPORTED',{id:row.id});
      const material=resolveMaterialRecord(model,row.matId),rc=material?.kind==='concrete'||!!material?.strength?.concrete;
      if(!rc && material?.kind!=='steel' && !material?.strength?.steel) fail('MEMBER_DESIGN_MATERIAL_UNSUPPORTED',{id:row.id});
      const rcFields=['cover','rebarFy','beamRebarRatio','columnRebarRatio'];
      if(Object.keys(c.patch).some(key=>rcFields.includes(key)!==rc)) fail('MEMBER_DESIGN_MATERIAL_MISMATCH',{id:row.id});
      const prior={...(model.designParams.members[row.id]||{})};
      if(rc && ['beamRebarRatio','columnRebarRatio'].some(key=>own(c.patch,key)) && ['As','AsZ','AsY','AsTotal'].some(key=>prior[key]!=null)) fail('EXPLICIT_REBAR_AREA_OVERRIDES_RATIO',{id:row.id});
      for(const group of aliases) if(group.some(key=>own(c.patch,key))) for(const key of group) delete prior[key];
      model.designParams.members[row.id]={...prior,...structuredClone(c.patch)};
    }
  } else if(c.type==='analysis-case') {
    object(c,['type','mode','id','name','kind','settings']);text(c.id);text(c.name);one(c.kind,['static','modal','responseSpectrum','buckling','linearTha']);
    const previous=c.mode==='update'?target(model,'analysisCases',c.id):null;
    if(previous && previous.kind!==c.kind) fail('CASE_KIND_IMMUTABLE');
    if(previous && Object.keys(previous.input||{}).length) fail('LEGACY_CASE_INPUT_MAPPING_REQUIRED');
    validateCaseSettings(model,c.kind,c.settings);
    const settings={...(previous?.settings||{}),...structuredClone(c.settings)};
    const row=createAnalysisCase({...previous,id:c.id,name:c.name,kind:c.kind,settings,input:{},status:previous?'stale':'not-run',lastRun:previous?.lastRun||null});
    write(model,'analysisCases',row,c.mode);
  }
}

function validateCaseSettings(model,kind,s) {
  const modal=['modalModeCount','massSource','prestressed','gravityCombinationId'];
  const fields={static:['comboId','pDeltaMethod'],modal,responseSpectrum:[...modal,'spectrum'],buckling:['modeCount','maxIterations','preloadCombinationId'],linearTha:['integration','modalModeCount','direction','dampingRatio','dt','accelerations','accelerationUnit','accelerationScale','timeUnit','massSource']};
  object(s,fields[kind]);
  for(const key of ['comboId','gravityCombinationId','preloadCombinationId']) if(own(s,key)) target(model,'loadCombinations',s[key]);
  for(const key of ['modalModeCount','modeCount','maxIterations']) if(own(s,key)) {positive(s[key],10000);if(!Number.isInteger(s[key])) fail('INTEGER_REQUIRED');}
  if(own(s,'pDeltaMethod')) one(s.pDeltaMethod,['off','direct','legacy']);
  if(own(s,'prestressed')&&typeof s.prestressed!=='boolean') fail('BOOLEAN_REQUIRED');
  if(own(s,'massSource')) {
    // The solver consumes a definition, not a string ID. Keep this mapping explicit.
    text(s.massSource);target(model,'massSources',s.massSource);
    s.massSource=structuredClone(target(model,'massSources',s.massSource));
  }
  if(own(s,'spectrum')) {
    const p=s.spectrum;object(p,['method','directions','dampingRatio','scale','points']);one(p.method,['SRSS','CQC']);list(p.directions,3);p.directions.forEach(x=>one(x,['x','y','z']));num(p.dampingRatio,0,0.99);positive(p.scale);list(p.points,5000);
    let prior=-1;for(const point of p.points) {object(point,['period','sa']);num(point.period);num(point.sa);if(point.period<=prior) fail('SPECTRUM_PERIOD_ORDER');prior=point.period;}
    if(new Set(p.directions).size!==p.directions.length) fail('DUPLICATE_DIRECTION');
  }
  if(kind==='linearTha') {
    one(s.integration,['direct','modal']);one(s.direction,['x','y','z']);num(s.dampingRatio,0,0.99);positive(s.dt);list(s.accelerations,100000);s.accelerations.forEach(v=>num(v,-1e5,1e5));one(s.accelerationUnit,['m/s2','g']);one(s.timeUnit,['s']);if(own(s,'accelerationScale')) positive(s.accelerationScale);
  }
}
