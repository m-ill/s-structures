import {stirrupDistribution} from './stirrupDistribution.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';

// A necessary check at one demand station. Passing sampled stations does not
// establish a continuous demand envelope or reinforcement continuity at joints.
export function torsionExtensionAt({detail,memberLength,x,bt,d}){
 const base={codeReferences:getKcscRuleSources(['142022']).map(r=>({...r,clause:'4.5.4(6)'})),units:{length:'m'},designTransferAllowed:false,scope:'station-wise extension inside one continuous straight-bar detail; envelope and adjoining-detail continuity separate'};
 const nc=(reason,more={})=>({...base,status:'NOT_CHECKED',ratio:null,reason,...more});
 if(![memberLength,bt,d].every(v=>Number.isFinite(v)&&v>0)||!Number.isFinite(x)||x<0||x>memberLength||!detail)return nc('TORSION_EXTENSION_GEOMETRY_REQUIRED');
 const start=detail.start*memberLength,end=detail.end*memberLength,requiredExtension=bt+d;
 if(![start,end].every(Number.isFinite)||start<0||end>memberLength||start>=end||x<start||x>end)return nc('TORSION_EXTENSION_REGION_REQUIRED');
 const requiredStart=x-requiredExtension,requiredEnd=x+requiredExtension,required={requiredExtension,requiredStart,requiredEnd,station:x,bt,d};
 if(requiredStart<start-1e-10||requiredEnd>end+1e-10)return nc('TORSION_ADJOINING_REINFORCEMENT_CONTINUITY_REQUIRED',required);
 if(detail.startFabricationShape!=='straight'||detail.endFabricationShape!=='straight')return nc('TORSION_EXTENSION_AXIAL_BAR_GEOMETRY_REQUIRED',required);
 const a=detail.endSetbackStart,b=detail.endSetbackEnd,first=detail.tieFirstStart,last=detail.tieFirstEnd,spacing=detail.stirrups?.spacing,sa=detail.startExtension??0,sb=detail.endExtension??0;
 if(![a,b,first,last,sa,sb].every(v=>Number.isFinite(v)&&v>=0)||![spacing,detail.cover].every(v=>Number.isFinite(v)&&v>0)||a<detail.cover||b<detail.cover)return nc('TORSION_EXTENSION_BAR_AND_TIE_END_OFFSETS_REQUIRED',required);
 const length=end-start,tieEnd=length-last;
 if(a+b>=length+sa+sb||first>tieEnd||tieEnd>length)return {...base,...required,status:'NG',ratio:null,reason:'TORSION_EXTENSION_END_GEOMETRY_INVALID'};
 const distribution=stirrupDistribution(detail,length);
 if(distribution.status!=='OK'||!distribution.explicitEnds||!distribution.count)return nc(distribution.reason||'TORSION_EXTENSION_TIE_DISTRIBUTION_REQUIRED',required);
 const provided={longitudinalStart:start+a-sa,longitudinalEnd:end-b+sb,transverseStart:start+distribution.first,transverseEnd:start+distribution.last};
 const deficits={longitudinalStart:Math.max(0,provided.longitudinalStart-requiredStart),longitudinalEnd:Math.max(0,requiredEnd-provided.longitudinalEnd),transverseStart:Math.max(0,provided.transverseStart-requiredStart),transverseEnd:Math.max(0,requiredEnd-provided.transverseEnd)};
 const shortage=Math.max(...Object.values(deficits)),ok=shortage<=1e-10;
 return {...base,...required,provided,deficits,status:ok?'OK':'NG',ratio:null,reason:ok?null:'TORSION_REINFORCEMENT_EXTENSION_SHORT',tieCount:distribution.count};
}
