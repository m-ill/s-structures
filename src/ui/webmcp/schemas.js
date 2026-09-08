export const id={type:'string',minLength:1,maxLength:128};
export const hash={type:'string',pattern:'^[a-f0-9]{64}$'};
export const object=(properties={},required=[])=>({type:'object',properties,required,additionalProperties:false});
export const array=(items,maxItems=100,minItems=1)=>({type:'array',items,minItems,maxItems});
export const choice=(...values)=>({type:'string',enum:values});
const number={type:'number',minimum:-1e12,maximum:1e12},positive={type:'number',minimum:0,maximum:1e12},bool={type:'boolean'};
const mode=choice('create','update');
const numeric=keys=>Object.fromEntries(keys.map(key=>[key,positive]));
import { DESIGN_BASIS_NUMERIC_FIELDS, OCCUPANCY_LOAD_PRESETS } from '../../design/designBasisInput.js';
import { MEMBER_DESIGN_FIELDS } from '../../modeling/designInputCommands.js';
const settings=object({comboId:id,pDeltaMethod:choice('off','direct','legacy'),modalModeCount:positive,massSource:id,prestressed:bool,gravityCombinationId:id,modeCount:positive,maxIterations:positive,preloadCombinationId:id,integration:choice('direct','modal'),direction:choice('x','y','z'),dampingRatio:positive,dt:positive,accelerations:array(number,2000),accelerationUnit:choice('m/s2','g'),accelerationScale:positive,timeUnit:choice('s'),spectrum:object({method:choice('SRSS','CQC'),directions:array(choice('x','y','z'),3),dampingRatio:positive,scale:positive,points:array(object({period:positive,sa:positive},['period','sa']),500)},['method','directions','dampingRatio','scale','points'])});
export const caseCommand=object({type:choice('analysis-case'),mode,id,name:id,kind:choice('static','modal','responseSpectrum','buckling','linearTha'),settings},['type','mode','id','name','kind','settings']);
export const command={oneOf:[
 object({type:choice('design-basis'),patch:object({...numeric(DESIGN_BASIS_NUMERIC_FIELDS.map(x=>x.id)),occupancy:choice(...Object.keys(OCCUPANCY_LOAD_PRESETS)),designMethod:choice('strength','allowable')})},['type','patch']),
 object({type:choice('generate-loads')},['type']),
 object({type:choice('node-mass'),nodeIds:array(id),mass:array(positive,3,3),unit:choice('kN.s2/m')},['type','nodeIds','mass','unit']),
 object({type:choice('mass-source'),id,entries:array(object({case:id,factor:positive},['case','factor'])),includeNodeMass:bool,includeMemberMass:bool,includeSelfWeight:bool,gravity:positive,activate:bool},['type','id','entries']),
 object({type:choice('load-case'),mode,id,name:id,loadType:choice('dead','live','roofLive','wind','seismic','snow','rain','temperature','other')},['type','mode','id','name','loadType']),
 object({type:choice('load'),mode,value:object({id,type:choice('nodal','udl','nmoment','mmoment'),node:id,member:id,P:number,w:number,M:number,at:positive,dir:choice('+x','-x','+y','-y','+z','-z'),case:id,unit:choice('kN','kN/m','kN.m')},['id','type','dir','case','unit'])},['type','mode','value']),
 object({type:choice('combination'),mode,id,name:id,purpose:choice('strength','service'),factors:{type:'object',properties:{},additionalProperties:number,maxProperties:100}},['type','mode','id','name','purpose','factors']),
 object({type:choice('generate-combinations'),rulePackId:id,method:choice('strength','allowable'),purpose:choice('strength','service')},['type','rulePackId','method']),
 object({type:choice('member-assignment'),memberIds:array(id),matId:id,secId:id},['type','memberIds']),
 object({type:choice('member-design'),memberIds:array(id),patch:object(numeric(Object.keys(MEMBER_DESIGN_FIELDS)))},['type','memberIds','patch']),caseCommand
]};
export const pagination={offset:{type:'integer',minimum:0,maximum:1000000},limit:{type:'integer',minimum:1,maximum:20}};
