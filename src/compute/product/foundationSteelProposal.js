import {coupleFootingBarDepth} from './foundationBarDepthCoupling.js';
import {getRebarProductCatalog,REBAR_CATALOG_ID,rebarCatalogProduct,validateCatalogMaterial} from '../../materials/rebarProductCatalog.js';
import {footingMinimumSteel} from '../../design/foundation/footingMinimumSteel.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {minimumFlexuralBarClearSpacing} from '../../design/rc/kdsSpacing.js';
import {footingBarLayout} from '../../design/foundation/footingBarLayout.js';
export function foundationSteelProposal(command,checks,model,{thickness,barDistribution,B,L}={}){
 const no=reason=>({ok:false,reason,edits:[],automaticApplicationAllowed:false});
 const footing=model?.designDetails?.foundations?.find(f=>f.id===command.id&&f.version===command.version);
 if(!footing)return no('CURRENT_FOUNDATION_REINFORCEMENT_REQUIRED');
 if([['B',B],['L',L]].some(([axis,value])=>value!==undefined&&(!Number.isFinite(value)||value<footing[axis]||value>100)))return no('FOOTPRINT_STEEL_DIMENSIONS_INVALID');
 const footprintChanged=B!==undefined&&B!==footing.B||L!==undefined&&L!==footing.L;
 const resize=Number.isFinite(thickness)&&thickness>footing.thickness;
 const redistribute=barDistribution==='kds-centered-band'&&barDistribution!==footing.barDistribution;
 const candidateFooting={...footing,...(redistribute?{barDistribution}:{}),...(B!==undefined?{B}:{}),...(L!==undefined?{L}:{})};
 const fy=resize||redistribute||footprintChanged?resolveMaterialRecord(model,footing.reinforcement?.materialId)?.strength?.steel?.Fy:undefined;
 const groups=new Map(),basis=new Set();
 for(const c of checks){
  if(c.entityId!==`foundation:${command.nodeId}`||!['foundation-flexure','foundation-reinforcement'].includes(c.checkId))continue;
  for(const recorded of c.axisChecks||[]){
   let r=recorded;
   if(!['bottom','top'].includes(r.face)||!['B','L'].includes(r.axis))continue;
   if((resize||redistribute||footprintChanged)&&c.checkId==='foundation-reinforcement'&&['OK','NG'].includes(r.status)&&!r.incomplete){
    const layout=footingBarLayout(candidateFooting,r.face,r.axis);
    const prepared=footingMinimumSteel({width:candidateFooting[r.axis==='B'?'L':'B'],thickness:resize?thickness:footing.thickness,fy,area:layout.area,spacing:layout.maximumSpacing});
    r={...r,...prepared};
   }
   const key=`${r.face}${r.axis}`,g=groups.get(key)||{face:r.face,axis:r.axis,ids:new Set(),need:false,flex:false,area:0,maxSpacing:Infinity,blocked:false};groups.set(key,g);
   if(!['OK','NG'].includes(r.status)||r.incomplete||['MINIMUM_TENSION_STRAIN_NOT_SATISFIED','DIRECT_FOOTING_MINIMUM_DEPTH_150MM'].includes(r.reason)){g.blocked=true;continue;}
   if(c.checkId==='foundation-reinforcement'){
    if(!Number.isFinite(r.requiredArea)||r.requiredArea<=0||!Number.isFinite(r.maximumSpacing)||r.maximumSpacing<=0){g.blocked=true;continue;}
    g.area=Math.max(g.area,r.requiredArea);g.maxSpacing=Math.min(g.maxSpacing,r.maximumSpacing);g.ids.add(c.id);
   }
   if(r.status==='NG'){g.need=true;g.flex||=c.checkId==='foundation-flexure';g.ids.add(c.id);}
  }
 }
 const fields=[],unavailable=[],productChoices=[];let catalog=null;
 if(command.barCatalogId===REBAR_CATALOG_ID){try{validateCatalogMaterial(command,'bar',resolveMaterialRecord(model,footing.reinforcement?.materialId));catalog=getRebarProductCatalog();}catch{catalog=null;}}
 for(const [key,g] of groups){
  if(!g.need)continue;
  if(g.blocked){unavailable.push({field:key,reason:'FOOTING_NON_SPACING_REDESIGN_REQUIRED'});continue;}
  const bar=footing.reinforcement?.[key],current=footingBarLayout(footing,g.face,g.axis),spacing=command[`${g.face}Spacing${g.axis}`];
  if(current.status!=='OK'||!Number.isFinite(spacing)||Math.abs(bar.spacing*1000-spacing)>1e-7){unavailable.push({field:key,reason:'CURRENT_FOOTING_LAYOUT_REQUIRED'});continue;}
  const alternatives=[],barChoices=[{bar}];
  if(catalog){try{
   const currentProduct=rebarCatalogProduct({diameter:command[`${g.face}Diameter${g.axis}`]});
   if(Math.abs(currentProduct.diameterMm/1000-bar.diameter)<1e-10&&Math.abs(currentProduct.areaMm2/1e6-bar.area)<1e-10)for(const product of catalog.products.filter(p=>p.diameterMm>currentProduct.diameterMm&&p.diameterMm<=35).slice(0,2))barChoices.push({bar:{...bar,diameter:product.diameterMm/1000,area:product.areaMm2/1e6},product});
  }catch{/* No verified current nominal product: retain spacing-only search. */}}
  for(const choice of barChoices){
   if(alternatives.length>=3)break;
   let nextFlexCount=0,flexCountStep=0;
   const values=[];if(choice.product&&spacing<=500)values.push(spacing);
   for(let value=Math.min(500,Math.floor((spacing-1e-7)/25)*25);value>=25;value-=25)values.push(value);
   for(const value of values){
    if(alternatives.length>=3)break;
    const proposedBar={...choice.bar,spacing:value/1000},layout=footingBarLayout({...candidateFooting,reinforcement:{...footing.reinforcement,[key]:proposedBar}},g.face,g.axis);
    if(layout.status!=='OK'||layout.minimumSpacing-proposedBar.diameter<minimumFlexuralBarClearSpacing(proposedBar.diameter,Number.isFinite(footing.aggregateMaxSize)&&footing.aggregateMaxSize>0?footing.aggregateMaxSize:0)-1e-10||layout.area<g.area-1e-12||layout.maximumSpacing>g.maxSpacing+1e-10||g.flex&&layout.area<=current.area+1e-12)continue;
    if(g.flex&&layout.count<nextFlexCount)continue;
    alternatives.push({[`${g.face}Spacing${g.axis}`]:value,...(choice.product?{[`${g.face}Diameter${g.axis}`]:choice.product.diameterMm}:{})});
    if(choice.product&&!productChoices.some(p=>p.field===key&&p.designation===choice.product.designation))productChoices.push({field:key,...choice.product,grade:command.barProductGrade,catalogId:command.barCatalogId});
    if(g.flex){if(!flexCountStep)flexCountStep=Math.max(1,Math.ceil(layout.count/2));nextFlexCount=layout.count+flexCountStep;}
   }
  }
  if(!alternatives.length){unavailable.push({field:key,reason:'FOOTING_SPACING_GRID_REQUIRES_REDESIGN'});continue;}
  fields.push({alternatives});for(const id of g.ids)basis.add(id);
 }
 if(!fields.length)return {...no('NO_FOOTING_STEEL_SPACING_PROPOSAL'),unavailable};
 const count=Math.max(...fields.map(f=>f.alternatives.length)),rawEdits=Array.from({length:count},(_,i)=>Object.assign({},...fields.map(f=>f.alternatives[Math.min(i,f.alternatives.length-1)])));
 const depthCoupling=[],edits=[];for(const edit of rawEdits){const coupled=['bottomDiameterB','bottomDiameterL'].some(k=>edit[k]!==undefined)?coupleFootingBarDepth(model,{...candidateFooting,thickness:resize?thickness:footing.thickness},edit):{ok:true,edit};if(coupled.thicknessChanged||!coupled.ok)depthCoupling.push({status:coupled.ok?'ADJUSTED':'UNAVAILABLE',reason:coupled.reason||null,thickness:coupled.edit?.thickness??null});if(coupled.ok)edits.push(coupled.edit);}
 if(!edits.length)return {...no('FOOTING_DIAMETER_DEPTH_REPAIR_UNAVAILABLE'),depthCoupling};
 const minimumSteelThicknesses=[...new Set(edits.map(e=>e.thickness??(resize?thickness:footing.thickness)))];
 return {ok:true,version:'p25-foundation-steel-proposal-v7-depth-coupled',depthCoupling,productChoices,minimumSteelFootprint:{B:candidateFooting.B,L:candidateFooting.L},minimumSteelThickness:minimumSteelThicknesses.length===1?minimumSteelThicknesses[0]:null,minimumSteelThicknesses,barDistribution:candidateFooting.barDistribution,edits,basisCheckIds:[...basis],unavailable,requiredFlexuralAreaCalculated:false,basis:'recorded minimum steel area and maximum spacing; bounded increased-area alternatives for flexure NG, same section solver reevaluation required',requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
