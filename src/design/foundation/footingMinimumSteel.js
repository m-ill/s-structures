import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function footingMinimumSteel({width,thickness,fy,area,spacing}){
 const base={codeReferences:getKcscRuleSources(['142020','142050']).map(r=>({...r,clause:r.id==='142020'?'4.2.2(3)':'4.6.2(1),(2)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![width,thickness,fy,area,spacing].every(x=>Number.isFinite(x)&&x>0)||fy>600)return {...base,status:'NOT_CHECKED',ratio:null,reason:'FOOTING_MINIMUM_REINFORCEMENT_INPUT_REQUIRED'};
 const minimumRatio=Math.max(.0014,fy<=400?.002:.002*400/fy);
 // KDS 14 20 50 4.6.2(2): 1,800 mm2 per metre of width, independent of thickness.
 const uncappedRequiredArea=minimumRatio*width*thickness,capPerUnitWidth=.0018,maximumRequiredArea=capPerUnitWidth*width;
 const requiredArea=Math.min(uncappedRequiredArea,maximumRequiredArea),maximumSpacing=Math.min(3*thickness,.45);
 const criteria=[
  {id:'minimum-area',provided:area,limit:requiredArea,relation:'>=',unit:'m2',ratio:requiredArea/area,reason:'FOOTING_MINIMUM_STEEL_AREA_INSUFFICIENT',codeReferences:base.codeReferences},
  {id:'maximum-spacing',provided:spacing,limit:maximumSpacing,relation:'<=',unit:'m',ratio:spacing/maximumSpacing,reason:'FOOTING_MAXIMUM_REINFORCEMENT_SPACING_EXCEEDED',codeReferences:base.codeReferences.filter(r=>r.id==='142020')}
 ].map(c=>({...c,status:c.ratio<=1+1e-10?'OK':'NG'}));
 const governing=criteria.reduce((a,b)=>b.ratio>a.ratio?b:a),failedCriteria=criteria.filter(c=>c.status==='NG').map(c=>c.id),ratio=governing.ratio;
 return {...base,status:failedCriteria.length?'NG':'OK',reason:failedCriteria.length?governing.reason:null,ratio,area,requiredArea,minimumRatio,spacing,maximumSpacing,criteria,failedCriteria,governingCriterion:governing.id,
  areaBasis:{width,thickness,uncappedRequiredArea,maximumRequiredArea,capPerUnitWidth,capApplied:uncappedRequiredArea>maximumRequiredArea,units:{width:'m',thickness:'m',uncappedRequiredArea:'m2',maximumRequiredArea:'m2',capPerUnitWidth:'m2/m'}},
  units:{area:'m2',spacing:'m'},scope:'uniform-thickness-footing-minimum-area-and-spacing; severe-restraint reinforcement and development separate'};
}
