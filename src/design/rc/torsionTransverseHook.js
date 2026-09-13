import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function torsionTransverseHook({B,H,cover,tieDiameter,insideRadius,tail,closure,corner,bars}){
 const base={codeReferences:getKcscRuleSources(['142022','142050']).map(r=>({...r,clause:r.id==='142022'?'4.5.3(2)':'4.1.1(2); 4.1.2(2)'})),units:{length:'m'},designTransferAllowed:false,scope:'declared 135-degree standard hook at selected longitudinal corner bar; paired hook and cage fabrication separate'};
 const nc=reason=>({...base,status:'NOT_CHECKED',ratio:null,reason});
 if(closure!=='standard-135'||!['+y+z','+y-z','-y+z','-y-z'].includes(corner)||![B,H,cover,tieDiameter,insideRadius,tail].every(v=>Number.isFinite(v)&&v>0)||!Array.isArray(bars)||!bars.length||bars.length>100)return nc('TORSION_135_HOOK_GEOMETRY_REQUIRED');
 if(tieDiameter>.0254||tieDiameter>.016&&tieDiameter<.019)return nc('TORSION_HOOK_BAR_SIZE_CLASS_REQUIRED');
 const requiredTail=6*tieDiameter,requiredRadius=(tieDiameter<=.016?2:3)*tieDiameter,ratio=Math.max(requiredTail/tail,requiredRadius/insideRadius);
 const sy=corner[0]==='+'?1:-1,sz=corner[2]==='+'?1:-1,cy=H/2-cover-tieDiameter-insideRadius,cz=B/2-cover-tieDiameter-insideRadius;
 const supported=bars.flatMap((bar,index)=>{if(![bar.y,bar.z,bar.diameter].every(Number.isFinite)||bar.diameter<=0)return [];const dy=sy*bar.y-cy,dz=sz*bar.z-cz,gap=insideRadius-bar.diameter/2-Math.hypot(dy,dz);return dy>=0&&dz>=0&&Math.abs(gap)<=1e-6?[index+1]:[];});
 const ok=ratio<=1+1e-10&&cy>0&&cz>0&&supported.length>0;
 return {...base,status:ok?'OK':'NG',ratio,reason:ok?null:'TORSION_135_HOOK_REQUIREMENT_NOT_SATISFIED',corner,supportedBarIndices:supported,requiredTail,providedTail:tail,requiredInsideRadius:requiredRadius,providedInsideRadius:insideRadius};
}
