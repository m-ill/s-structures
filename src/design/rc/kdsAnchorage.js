// KCSC OpenAPI KDS 14 20 52:2024, retrieved 2026-09-11.
// Lengths: mm; stresses: MPa. Clause scope only, not whole-member approval.
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
const source=getKcscRuleSources(['142052'])[0];
const missing=reason=>({status:'NOT_CHECKED',requiredMm:null,reason,source,designTransferAllowed:false});
const result=(clause,rawMm,minimum,extra={})=>({status:'CALCULATED',rawMm,requiredMm:Math.max(minimum,rawMm),unit:'mm',source:{...source,clause},designTransferAllowed:false,...extra});
const valid=x=>['db','fy','fck','lambda'].every(k=>Number.isFinite(x[k])&&x[k]>0)&&x.lambda<=1;
const root=x=>x.lambda*Math.min(Math.sqrt(x.fck),8.4); // 1.2(3)
export function tensionDevelopment(x) {
 if(!valid(x)||!Number.isFinite(x.c)||x.c<=0||!Number.isFinite(x.Ktr)||x.Ktr<0||![0.8,1].includes(x.sizeFactor)||typeof x.topBar!=='boolean'||!['uncoated','galvanized','epoxy'].includes(x.coating))return missing('ANCHORAGE_CONDITIONS_REQUIRED');
 if(x.fy>550&&(x.Ktr===0?x.c/x.db<2.5:x.Ktr/x.db<0.25||(x.c+x.Ktr)/x.db<2.25))return {...missing('HIGH_STRENGTH_CONFINEMENT_NOT_SATISFIED'),status:'NG'};
 let beta=1;
 if(x.coating==='epoxy') {
  if(!Number.isFinite(x.clearCover)||x.clearCover<0||!Number.isFinite(x.clearSpacing)||x.clearSpacing<0)return missing('COATING_GEOMETRY_REQUIRED');
  beta=x.clearCover<3*x.db||x.clearSpacing<6*x.db?1.5:1.2;
 }
 const alpha=x.topBar?1.3:1,alphaBeta=Math.min(alpha*beta,1.7),confinement=Math.min((x.c+x.Ktr)/x.db,2.5);
 return result('4.1.2(1),(3),(5); Eq.4.1-2',0.9*x.db*x.fy/root(x)*alphaBeta*x.sizeFactor/confinement,300,{factors:{alpha,beta,alphaBeta,gamma:x.sizeFactor,confinement},excessSteelReductionApplied:false});
}
export function compressionDevelopment(x) {
 if(!valid(x))return missing('ANCHORAGE_CONDITIONS_REQUIRED');
 return result('4.1.3; Eq.4.1-3',Math.max(0.25*x.db*x.fy/root(x),0.043*x.db*x.fy),200,{reductionApplied:false});
}
export function hookDevelopment(x) {
 if(!valid(x)||![90,180].includes(x.hookAngle)||!['uncoated','galvanized','epoxy'].includes(x.coating))return missing('STANDARD_HOOK_CONDITIONS_REQUIRED');
 return result('4.1.5(1),(2); Eq.4.1-4',0.24*(x.coating==='epoxy'?1.2:1)*x.db*x.fy/root(x),Math.max(150,8*x.db),{reductionApplied:false,geometryCheckRequired:true});
}
export function tensionLap(x) {
 if(!['A','B'].includes(x.spliceClass))return missing('SPLICE_CLASS_REQUIRED');
 if(x.spliceClass==='A'&&!(x.providedRequiredAreaRatio>=2&&Number.isFinite(x.splicedFraction)&&x.splicedFraction>=0&&x.splicedFraction<=0.5))return missing('CLASS_A_EVIDENCE_REQUIRED');
 const base=tensionDevelopment(x);if(base.status!=='CALCULATED')return base;
 // 4.5.2(1) explicitly excludes the development-length 300mm floor.
 return result('4.5.2(1),(2)',base.rawMm*(x.spliceClass==='A'?1:1.3),300,{spliceClass:x.spliceClass,development:base});
}
export function compressionLap(x) {
 if(!valid(x)||x.db>34.9||x.fy>600||x.fck>90)return missing('COMPRESSION_LAP_SCOPE_REQUIRED');
 // Official 2024 Eq.4.5-1 and optional shorter Eq.4.5-2. Keep the
 // concrete-strength increase on the minimum too; take no tie reduction.
 const equation1=(1.4*x.fy/root(x)-52)*x.db;
 const equation2=(x.fy<=400?.072*x.fy:.13*x.fy-24)*x.db;
 const lowStrengthFactor=x.fck<21?4/3:1;
 return result('4.5.3(1); Eq.4.5-1; Eq.4.5-2',Math.max(300,Math.min(equation1,equation2))*lowStrengthFactor,300,{equation1,equation2,lowStrengthFactor,reductionApplied:false,tensionLengthCapApplied:false});
}
