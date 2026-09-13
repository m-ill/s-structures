import {STEEL_TEST_INPUT_MAP} from '../materials/steelTestEvidence.js';
import {validateElasticLapInput} from '../design/rc/elasticLapTransfer.js';
import {footingReactionHeight} from '../design/foundation/footingReactionHeight.js';
import {footingColumnGeometry} from '../design/foundation/footingColumnGeometry.js';
import {expandRebarCatalogInput,validateCatalogMaterial,rebarCatalogProduct} from '../materials/rebarProductCatalog.js';
import {spliceGeometry} from '../design/rc/spliceGeometry.js';
import { validatePracticalCommand, practicalInputSchema, PRACTICAL_INPUT_VERSION, DESIGN_RECORD_CHANNELS } from './practicalInputContract.js';
import { validateMaterialRecord } from '../materials/materialSchema.js';
import { validateSectionRecord } from '../materials/sectionSchema.js';
import { resolveMaterialRecord, resolveSectionRecord, parseVersionedId } from '../materials/registry.js';
import { stableHash } from '../core/stableHash.js';
import {LOAD_FAMILIES} from '../loads/loadCaseMetadata.js';
import {footingBarLayout} from '../design/foundation/footingBarLayout.js';

const fail=(code,details)=>{throw Object.assign(new Error(code),{code,details});};
export function getDesignInputSchema({type}={}) {return {ok:true,version:PRACTICAL_INPUT_VERSION,schema:practicalInputSchema(type)};}

export function stagePracticalDesignInput(model,input,warnings) {
  input=expandRebarCatalogInput(input);
  validatePracticalCommand(input);
  if(!['material-record','section-record'].includes(input.type)){stageDetail(model,input,warnings);return;}
  if(input.type==='section-record') {
    const {id,name,version,shape,sourceNote}=input;
    const params=Object.fromEntries(['B','H','D','tw','tf','t'].filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));
    const checked=validateSectionRecord({id,name,version,shape,kind:'parametric',params,inputContract:'p24-section-v1',dimensionUnit:'mm',source:{scope:'project',note:sourceNote}});
    if(!checked.ok)fail('SECTION_INPUT_INVALID',checked.errors);
    appendVersion(model,'sections',checked.normalized);
    return;
  }
  const {id,name,version,kind,E,nu,density,sourceReference,edition,sourceNote,basisStatus,product,grade}=input;
  const G=input.G??E/(2*(1+nu));
  const strength=kind==='steel'?{steel:{Fy:input.Fy,Fu:input.Fu}}
    :kind==='concrete'?{concrete:{fck:input.fck}}
    :kind==='masonry'?{masonry:{fm:input.fm}}
    :{timber:Object.fromEntries(['fb','ft0','fc0','fc90','fv'].map(key=>[key,input[key]]))};
  const specification={reference:sourceReference,edition,note:sourceNote,basisStatus,product,grade};
  if(kind==='steel'&&input.thickness!==undefined)specification.thicknessMm=input.thickness;
  if(kind==='timber')Object.assign(specification,{species:input.species,moisturePercent:input.moisture,serviceClass:input.serviceClass,durationClass:input.durationClass});
  if(kind==='masonry')Object.assign(specification,{unitType:input.unitType,mortar:input.mortar,grout:input.grout,reinforced:input.reinforced});
  const record={id,name,version,kind,inputContract:'p24-material-v1',
    elastic:{E,G,nu,rho:density,...(kind==='timber'?{E90:input.E90}:{} )},
    elasticity:kind==='timber'?'frame-longitudinal':'isotropic',strength,specification,
    source:{scope:'project',note:sourceNote,verificationStatus:'user-specified-unqualified'},
    propertyUnits:{E:'N/mm2',G:'N/mm2',rho:'t/m3'},status:'project-input',nonlinear:null};
  if(Object.keys(STEEL_TEST_INPUT_MAP).some(key=>input[key]!==undefined))record.testEvidence=Object.fromEntries(Object.entries(STEEL_TEST_INPUT_MAP).filter(([key])=>input[key]!==undefined).map(([key,field])=>[field,input[key]]));
  if(['creepCoefficient','creepLoadingAgeDays','creepEvaluationAgeDays','creepElasticModulusAtLoading','creepReference','shrinkageMicrostrain','shrinkageReference'].some(key=>input[key]!==undefined))record.creep={method:'effective-modulus-constant-sustained-load',coefficient:input.creepCoefficient,loadingAgeDays:input.creepLoadingAgeDays,evaluationAgeDays:input.creepEvaluationAgeDays,elasticModulusAtLoading:input.creepElasticModulusAtLoading,reference:input.creepReference,...(input.shrinkageMicrostrain!==undefined||input.shrinkageReference!==undefined?{shrinkageMicrostrain:input.shrinkageMicrostrain,shrinkageReference:input.shrinkageReference}:{})};
  if(['creepAttachmentCoefficient','creepAttachmentAgeDays','creepAttachmentReference','attachmentShrinkageMicrostrain','attachmentShrinkageReference'].some(k=>input[k]!==undefined)){
    record.creep={...record.creep,attachment:{coefficient:input.creepAttachmentCoefficient,evaluationAgeDays:input.creepAttachmentAgeDays,reference:input.creepAttachmentReference,...(input.attachmentShrinkageMicrostrain!==undefined||input.attachmentShrinkageReference!==undefined?{shrinkageMicrostrain:input.attachmentShrinkageMicrostrain,shrinkageReference:input.attachmentShrinkageReference}:{})}};
  }
  const checked=validateMaterialRecord(record);
  if(!checked.ok)fail('MATERIAL_INPUT_INVALID',checked.errors);
  appendVersion(model,'materials',checked.normalized);
  if(checked.normalized.testEvidenceAssessment?.designValueConsistency==='NG')warnings.push({code:'MATERIAL_TEST_STRENGTH_MISMATCH',message:'시험 강도와 설계 입력 강도의 불일치를 확인하세요.',id,issues:checked.normalized.testEvidenceAssessment.issues});
  if(checked.normalized.testEvidenceAssessment?.identityConsistency==='MISMATCH')warnings.push({code:'MATERIAL_CERTIFICATE_IDENTITY_MISMATCH',message:'성적서에 기재된 제품·등급과 설계 재료 명세의 불일치를 확인하세요.',id,issues:checked.normalized.testEvidenceAssessment.identityIssues});
  warnings.push({code:'MATERIAL_SOURCE_NOT_QUALIFIED',message:'재료 입력을 저장했습니다. 입력 출처와 재료별 설계 지원 범위는 별도 검토 대상입니다.',id});
}

function appendVersion(model,collection,record) {
  model[collection] ||= [];
  const prior=model[collection].find(row=>row.id===record.id&&Number(row.version||1)===record.version);
  if(prior&&stableHash(prior)!==stableHash(record))fail('IMMUTABLE_LIBRARY_VERSION',{collection,id:record.id,version:record.version});
  if(!prior)model[collection].push(record);
}

export function getDesignRecords(model,{channel,id,version,offset=0,limit=20}={}) {
  if(!DESIGN_RECORD_CHANNELS.includes(channel))fail('DESIGN_CHANNEL_UNSUPPORTED');
  if(id!==undefined&&(typeof id!=='string'||!id.trim()||id.length>128))fail('INVALID_RECORD_ID');
  if(version!==undefined&&(!Number.isInteger(version)||version<1||version>1000000))fail('INVALID_RECORD_VERSION');
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>20)fail('INVALID_PAGINATION');
  if(version!==undefined&&id===undefined)fail('VERSION_REQUIRES_ID');
  const library=['materials','sections'].includes(channel);
  let rows=library?model[channel]||[]:model.designDetails?.[channel]||[];
  if(id!==undefined) {
    const record=library?(channel==='materials'?resolveMaterialRecord:resolveSectionRecord)(model,version?`${id}@${version}`:id):resolveDetail(rows,id,version);
    rows=record?[record]:[];
  }
  return {ok:true,version:PRACTICAL_INPUT_VERSION,channel,total:rows.length,offset,nextOffset:offset+limit<rows.length?offset+limit:null,rows:structuredClone(rows.slice(offset,offset+limit))};
}

function resolveDetail(rows,id,version) {return rows.filter(row=>row.id===id&&(version===undefined||row.version===version)).sort((a,b)=>b.version-a.version)[0]||null;}
function reference(model,collection,id) {const row=(model[collection]||[]).find(row=>row.id===id);if(!row)fail('DESIGN_REFERENCE_NOT_FOUND',{collection,id});return row;}
function materialReference(model,ref,kind) {
  if(!parseVersionedId(ref).version)fail('MATERIAL_VERSION_REQUIRED',{ref});
  const row=resolveMaterialRecord(model,ref);if(!row||row.kind!==kind)fail('DESIGN_MATERIAL_MISMATCH',{ref,required:kind});return row;
}
function stageDetail(model,input,warnings) {
  if(model.designDetails&&model.designDetails.version!==PRACTICAL_INPUT_VERSION)fail('DESIGN_DETAILS_VERSION_UNSUPPORTED');
  model.designDetails ||= {version:PRACTICAL_INPUT_VERSION};
  const {type,...data}=input;
  let record={...structuredClone(data),inputContract:PRACTICAL_INPUT_VERSION};
  const channel={'splice-record':'splices','design-profile-record':'profiles','reinforcement-record':'reinforcement','connection-record':'connections','foundation-record':'foundations','ground-record':'ground'}[type];
  if(['reinforcement-record','connection-record','foundation-record'].includes(type)){
    for(const role of (type==='reinforcement-record'?['bar','stirrup']:['bar'])){
      const keys=[`${role}Product`,`${role}Batch`,`${role}BatchReference`];
      if(keys.some(key=>input[key]!==undefined)){
        if(keys.some(key=>typeof input[key]!=='string'||!input[key].trim()||input[key].length>256))fail('MATERIAL_BATCH_ASSIGNMENT_FIELDS_REQUIRED',{role,fields:keys});
        if(role==='stirrup'&&input.stirrupDiameter===undefined||role==='bar'&&input.barMaterialId===undefined)fail('MATERIAL_BATCH_ASSIGNMENT_REINFORCEMENT_REQUIRED',{role});
      }
    }
  }
  if(type==='splice-record') {
    validateElasticLapInput(record);
    const geometry=spliceGeometry(model,record,{allowHistorical:true});if(geometry.status!=='OK')fail(geometry.reason);
  } else if(type==='design-profile-record') {
    const partition=[...input.requiredFamilies,...(input.excludedFamilies||[])];
    if(partition.length!==LOAD_FAMILIES.length||new Set(partition).size!==partition.length||LOAD_FAMILIES.some(x=>!partition.includes(x)))fail('LOAD_FAMILY_PARTITION_REQUIRED');
    if((model.designDetails.profiles||[]).some(row=>row.id!==input.id))fail('SINGLE_PROJECT_PROFILE_REQUIRED');
    if(input.confirmedCaseIds.some(id=>!model.loadCases?.some(row=>row.id===id)))fail('CONFIRMED_CASE_MISSING');
  } else if(type==='reinforcement-record') {
    const member=reference(model,'members',input.memberId);
    if(member.type!=='frame'||resolveMaterialRecord(model,member.matId)?.kind!=='concrete')fail('RC_FRAME_REQUIRED');
    materialReference(model,input.barMaterialId,'steel');
    if(input.stirrupMaterialId)materialReference(model,input.stirrupMaterialId,'steel');
    validateCatalogMaterial(input,'bar',resolveMaterialRecord(model,input.barMaterialId));
    validateCatalogMaterial(input,'stirrup',resolveMaterialRecord(model,input.stirrupMaterialId||input.barMaterialId));
    if(input.start>=input.end)fail('REINFORCEMENT_REGION_INVALID');
    const section=resolveSectionRecord(model,member.secId);
    if(!['RECT','SQUARE'].includes(section?.shape))fail('REINFORCEMENT_SECTION_UNSUPPORTED');
    const width=section.params?.B/1000,depth=(section.params?.H??section.params?.B)/1000;
    if(!Number.isFinite(width)||!Number.isFinite(depth)||width<=0||depth<=0)fail('REINFORCEMENT_SECTION_GEOMETRY_REQUIRED');
    const stirrupFields=['stirrupDiameter','stirrupLegs','stirrupSpacing'];
    const supplied=stirrupFields.filter(key=>input[key]!==undefined);
    if(supplied.length!==0&&supplied.length!==3)fail('STIRRUP_FIELDS_REQUIRED');
    const diameter=(input.stirrupDiameter||0)/1000;
    const positions=new Set();
    const bars=input.bars.map(bar=>{
      const key=`${bar.y}:${bar.z}`;if(positions.has(key))fail('DUPLICATE_BAR_POSITION');positions.add(key);
      const d=bar.diameter/1000;
      if(Math.abs(bar.y)+d/2+input.cover+diameter>depth/2+1e-12||Math.abs(bar.z)+d/2+input.cover+diameter>width/2+1e-12)fail('BAR_OUTSIDE_SECTION');
      return input.barAreaBasis==='specified-nominal'?{y:bar.y,z:bar.z,diameter:d,area:bar.nominalAreaMm2/1e6,nominalArea:bar.nominalAreaMm2/1e6,geometricArea:Math.PI*d*d/4,designation:bar.designation,...(input.barCatalogId?{unitMassKgPerM:rebarCatalogProduct(bar).unitMassKgPerM}:{})}:{...bar,diameter:d,area:Math.PI*d*d/4};
    });
    for(let i=0;i<bars.length;i++)for(let j=0;j<i;j++) {
      if(Math.hypot(bars[i].y-bars[j].y,bars[i].z-bars[j].z)<(bars[i].diameter+bars[j].diameter)/2-1e-12)fail('OVERLAPPING_REINFORCEMENT');
    }
    if(bars.reduce((sum,b)=>sum+b.area,0)>=width*depth)fail('REINFORCEMENT_AREA_EXCEEDS_SECTION');
    const {stirrupDiameter,stirrupLegs,stirrupSpacing,...rest}=record;
    record={...rest,bars,barUnits:{coordinates:'m',diameter:'m',area:'m2'},areaBasis:input.barAreaBasis||'geometric-diameter',stirrups:supplied.length?{diameter,legs:stirrupLegs,spacing:stirrupSpacing/1000,...(input.stirrupAreaBasis==='specified-nominal'?{area:input.stirrupNominalAreaMm2/1e6,geometricArea:Math.PI*diameter**2/4,areaBasis:'specified-nominal'}:{})}:null};
    if(input.stirrupCatalogId&&record.stirrups)record.stirrups.unitMassKgPerM=rebarCatalogProduct({diameter:input.stirrupDiameter}).unitMassKgPerM;
  } else if(type==='connection-record') {
    reference(model,'nodes',input.nodeId);
    if(input.jointMaterialId)materialReference(model,input.jointMaterialId,'concrete');
    if(input.columnMemberId&&!input.memberIds.includes(input.columnMemberId))fail('JOINT_COLUMN_REFERENCE_REQUIRED');
    for(const id of input.memberIds){const member=reference(model,'members',id);if(![member.n1,member.n2].includes(input.nodeId))fail('CONNECTION_NODE_MISMATCH',{id});
      const kind=resolveMaterialRecord(model,member.matId)?.kind;
      if(kind!==(input.connectionType.startsWith('rc-')?'concrete':input.connectionType))fail('CONNECTION_MATERIAL_MISMATCH',{id});}
    if(input.connectionType==='rc-joint'&&input.memberIds.length<2)fail('JOINT_MEMBERS_REQUIRED');
    if(input.restraint==='semi-rigid'&&input.rotationalStiffness===undefined)fail('CONNECTION_STIFFNESS_REQUIRED');
    const keys=['barMaterialId','tieDiameter','tieSpacing','tieLegs'];
    if(keys.some(key=>input[key]!==undefined)) {
      if(!input.connectionType.startsWith('rc-')||keys.some(key=>input[key]===undefined))fail('JOINT_REINFORCEMENT_FIELDS_REQUIRED');
      materialReference(model,input.barMaterialId,'steel');
      record.reinforcement={materialId:input.barMaterialId,diameter:input.tieDiameter/1000,spacing:input.tieSpacing/1000,legs:input.tieLegs};
      if(input.barCatalogId){validateCatalogMaterial(input,'bar',resolveMaterialRecord(model,input.barMaterialId));const product=rebarCatalogProduct({diameter:input.tieDiameter});Object.assign(record.reinforcement,{area:product.areaMm2/1e6,geometricArea:Math.PI*record.reinforcement.diameter**2/4,designation:product.designation,unitMassKgPerM:product.unitMassKgPerM,areaBasis:'specified-nominal'});}
      for(const key of keys)delete record[key];
    }
  } else if(type==='foundation-record') {
    const vertical=footingReactionHeight(input);if(!vertical.ok)fail(vertical.reason);
    if(input.columnWidth!==undefined||input.columnDepth!==undefined||input.columnOffsetX||input.columnOffsetY){const geometry=footingColumnGeometry(input);if(!geometry.ok)fail(geometry.reason);}
    if((input.columnOffsetX||input.columnOffsetY)&&!input.reactionMomentReference)fail('FOOTING_REACTION_MOMENT_REFERENCE_REQUIRED');
    reference(model,'nodes',input.nodeId);materialReference(model,input.materialId,'concrete');
    const ref=parseVersionedId(input.groundId);
    if(!ref.version||!resolveDetail(model.designDetails.ground||[],ref.id,ref.version))fail('GROUND_REFERENCE_NOT_FOUND');
    if(input.cover>=input.thickness||2*input.cover>=Math.min(input.B,input.L))fail('FOUNDATION_COVER_INVALID');
    const keys=['barMaterialId','bottomDiameterB','bottomDiameterL','bottomSpacingB','bottomSpacingL'];
    if(keys.some(key=>input[key]!==undefined)) {
      if(keys.some(key=>input[key]===undefined))fail('FOUNDATION_REINFORCEMENT_FIELDS_REQUIRED');
      materialReference(model,input.barMaterialId,'steel');
      if(input.cover+(input.bottomDiameterB+input.bottomDiameterL)/1000>=input.thickness)fail('FOUNDATION_REINFORCEMENT_OUTSIDE');
      record.reinforcement={materialId:input.barMaterialId,bottomB:{diameter:input.bottomDiameterB/1000,spacing:input.bottomSpacingB/1000},bottomL:{diameter:input.bottomDiameterL/1000,spacing:input.bottomSpacingL/1000}};
      for(const key of keys)delete record[key];
    }
    const topKeys=['topDiameterB','topDiameterL','topSpacingB','topSpacingL'];
    if(topKeys.some(key=>input[key]!==undefined)){
      if(topKeys.some(key=>input[key]===undefined)||!record.reinforcement)fail('FOUNDATION_TOP_REINFORCEMENT_FIELDS_REQUIRED');
      const totalDiameter=(input.topDiameterB+input.topDiameterL+input.bottomDiameterB+input.bottomDiameterL)/1000;
      if(2*input.cover+totalDiameter>=input.thickness)fail('FOUNDATION_REINFORCEMENT_OUTSIDE');
      record.reinforcement.topB={diameter:input.topDiameterB/1000,spacing:input.topSpacingB/1000};
      record.reinforcement.topL={diameter:input.topDiameterL/1000,spacing:input.topSpacingL/1000};
      for(const key of topKeys)delete record[key];
    }
    if(record.reinforcement)for(const face of ['bottom','top'])for(const axis of ['B','L']){
      const bar=record.reinforcement[`${face}${axis}`];if(!bar)continue;
      if(input.barCatalogId){validateCatalogMaterial(input,'bar',resolveMaterialRecord(model,input.barMaterialId));const p=rebarCatalogProduct({diameter:bar.diameter*1000});Object.assign(bar,{area:p.areaMm2/1e6,designation:p.designation,unitMassKgPerM:p.unitMassKgPerM,areaBasis:'specified-nominal'});}
      const width=axis==='B'?input.L:input.B;
      if(2*input.cover+bar.diameter>=width||bar.spacing<bar.diameter)fail('FOUNDATION_REINFORCEMENT_OUTSIDE');
      if(input.barDistribution==='kds-centered-band'){
        const layout=footingBarLayout(record,face,axis);
        if(layout.status!=='OK')fail(layout.reason);
      }
    }
  }
  appendVersion(model.designDetails,channel,record);
  warnings.push({code:'DETAIL_REVIEW_PENDING',message:'실제 상세 입력을 저장했습니다. 내력·상세 규칙 검토와 해석 가정 일치 확인이 필요합니다.',id:input.id});
}
