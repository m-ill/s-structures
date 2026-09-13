import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
import {roundedHoopPerimeterLayout} from './roundedHoopPerimeterLayout.js';
export function torsionPerimeterDetail(input,{preparedLayout}={}){
 const base={codeReferences:getKcscRuleSources(['142022']).map(r=>({...r,clause:'4.5.4(5)'})),units:{length:'m'},designTransferAllowed:false,scope:'longitudinal distribution on rounded closed stirrup; anchorage and extension separate'};
 if(!Number.isFinite(input.spacing)||input.spacing<=0)return {...base,status:'NOT_CHECKED',ratio:null,reason:'TORSION_PERIMETER_GEOMETRY_REQUIRED'};
 const layout=preparedLayout??roundedHoopPerimeterLayout(input);
 if(!layout.positions){const reasons={HOOP_PERIMETER_GEOMETRY_REQUIRED:'TORSION_PERIMETER_GEOMETRY_REQUIRED',HOOP_PERIMETER_BAR_REQUIRED:'TORSION_PERIMETER_BAR_REQUIRED',HOOP_BEND_OUTSIDE_SECTION:'TORSION_HOOP_BEND_OUTSIDE_SECTION'};return {...base,status:layout.status,ratio:null,reason:reasons[layout.reason]||layout.reason};}
 const {cornerCount,maximumGap,perimeter,positions,gaps,failures}=layout;
 const diameterRatio=Math.max(...input.bars.map(bar=>Math.max(.00953,input.spacing/24)/bar.diameter)),ratio=Math.max(diameterRatio,(maximumGap??perimeter)/.3),ng=layout.status==='NG'||ratio>1+1e-10;
 return {...base,status:ng?'NG':'OK',ratio,reason:ng?'TORSION_LONGITUDINAL_DISTRIBUTION_NOT_SATISFIED':null,cornerCount,maximumGap,maximumAllowedGap:.3,diameterRatio,perimeter,positions,gaps,failures};
}
