import {footingBarLayout} from './footingBarLayout.js';
import {minimumFlexuralBarClearSpacing} from '../rc/kdsSpacing.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function evaluateFootingSpacing(f){
 const known=Number.isFinite(f.aggregateMaxSize)&&f.aggregateMaxSize>0,axisChecks=[];
 for(const face of ['bottom','top'])for(const axis of ['B','L']){
  const bar=f.reinforcement?.[face+axis];if(!bar)continue;
  const layout=footingBarLayout(f,face,axis);
  if(layout.status!=='OK'){axisChecks.push({axis,face,status:'NOT_CHECKED',reason:layout.reason});continue;}
  if(layout.count<2){axisChecks.push({axis,face,status:'N_A',reason:'NO_ADJACENT_PARALLEL_BARS'});continue;}
  const clearSpacing=layout.minimumSpacing-bar.diameter,required=minimumFlexuralBarClearSpacing(bar.diameter,known?f.aggregateMaxSize:0),ratio=required/Math.max(1e-12,clearSpacing);
  axisChecks.push({axis,face,status:ratio>1+1e-10?'NG':known?'OK':'NOT_CHECKED',ratio:ratio>1+1e-10||known?ratio:null,clearSpacing,requiredClearSpacing:required,aggregateVerified:known,reason:ratio>1+1e-10?'FOOTING_CLEAR_SPACING_INSUFFICIENT':known?null:'FOOTING_AGGREGATE_SIZE_REQUIRED'});
 }
 const ng=axisChecks.some(r=>r.status==='NG'),incomplete=!known||!axisChecks.length||axisChecks.some(r=>r.status==='NOT_CHECKED');
 return {status:ng?'NG':incomplete?'NOT_CHECKED':'OK',ratio:ng||!incomplete?Math.max(0,...axisChecks.map(r=>r.ratio??0)):null,incomplete,reason:ng?'FOOTING_CLEAR_SPACING_INSUFFICIENT':incomplete?'FOOTING_SPACING_INPUT_REQUIRED':null,...(!known?{requiredInputFields:['aggregateMaxSize'],blockerKind:'input-required'}:{}),axisChecks,codeReferences:getKcscRuleSources(['142050','142001']).map(r=>({...r,clause:r.id==='142050'?'4.2.2(1),(2)':'3.1.1(2)④'})),aggregateBasis:{document:'KDS 14 20 01',clause:'3.1.1(2)④',editionStatus:'PUBLIC_CAPTURE_EDITION_REVIEW_REQUIRED'},qualification:'clause-scoped-not-whole-design',designTransferAllowed:false,units:{length:'m'},scope:'within each parallel single-bar footing layer; crossing layers, bundles, laps and placement tolerances separate'};
}
