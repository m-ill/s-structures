import {rebarCatalogProduct} from '../../materials/rebarProductCatalog.js';
import {resolveMaterialRecord} from '../../materials/registry.js';
import {evaluateFootingDepth} from '../../design/foundation/footingDepth.js';
import {footingMinimumSteel} from '../../design/foundation/footingMinimumSteel.js';
import {footingBarLayout} from '../../design/foundation/footingBarLayout.js';
import {minimumFlexuralBarClearSpacing} from '../../design/rc/kdsSpacing.js';
export function coupleFootingBarDepth(model,footing,edit){
 const result={...edit},reinforcement={...footing.reinforcement};
 const failure=reason=>({ok:false,reason});
 for(const face of ['bottom','top'])for(const axis of ['B','L']){
  const key=face+axis,bar=reinforcement[key];if(!bar)continue;
  const diameter=edit[`${face}Diameter${axis}`],spacing=edit[`${face}Spacing${axis}`];
  const product=diameter===undefined?null:rebarCatalogProduct({diameter});
  reinforcement[key]={...bar,...(product?{diameter:product.diameterMm/1000,area:product.areaMm2/1e6}:{}),...(spacing===undefined?{}:{spacing:spacing/1000})};
 }
 const candidate={...footing,reinforcement},depth=evaluateFootingDepth(candidate);
 if(depth.status!=='NG'||depth.incomplete)return {ok:true,edit:result,depthStatus:depth.status};
 const increase=Math.max(...depth.axisChecks.map(c=>Math.max(0,c.limit-c.provided)));
 const thickness=Math.ceil((footing.thickness+increase-1e-10)/.025)*.025;
 if(!Number.isFinite(thickness)||thickness<=footing.thickness)return failure('FOOTING_DIAMETER_DEPTH_GEOMETRY_REQUIRED');
 candidate.thickness=thickness;result.thickness=thickness;
 const fy=resolveMaterialRecord(model,reinforcement.materialId)?.strength?.steel?.Fy;
 for(const face of ['bottom','top'])for(const axis of ['B','L']){
  const key=face+axis,bar=reinforcement[key];if(!bar)continue;
  const values=[bar.spacing*1000];for(let mm=Math.min(500,Math.floor((bar.spacing*1000-1e-7)/25)*25);mm>=25;mm-=25)values.push(mm);
  let matched=false;
  for(const mm of values){
   const trial={...candidate,reinforcement:{...reinforcement,[key]:{...bar,spacing:mm/1000}}},layout=footingBarLayout(trial,face,axis);
   if(layout.status!=='OK'||layout.minimumSpacing-bar.diameter<minimumFlexuralBarClearSpacing(bar.diameter,footing.aggregateMaxSize||0)-1e-10)continue;
   const minimum=footingMinimumSteel({width:trial[axis==='B'?'L':'B'],thickness,fy,area:layout.area,spacing:layout.maximumSpacing});
   if(minimum.status!=='OK')continue;
   if(mm!==bar.spacing*1000)result[`${face}Spacing${axis}`]=mm;
   reinforcement[key]={...bar,spacing:mm/1000};matched=true;break;
  }
  if(!matched)return failure('FOOTING_DIAMETER_DEPTH_STEEL_REDESIGN_REQUIRED');
 }
 return {ok:true,edit:result,depthStatus:evaluateFootingDepth(candidate).status,thicknessChanged:true,requiresFullReevaluation:true};
}
