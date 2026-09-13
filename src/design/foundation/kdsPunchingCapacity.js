import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function kdsPunchingCapacity({fck,d,b0,rho,lambda,columnPosition}) {
 const codeReferences=getKcscRuleSources(['142022','142010']).map(x=>({...x,clause:x.id==='142022'?'4.11.1; 4.11.2(2), Eq.4.11-1..8':'4.2.3(2)'}));
 const base={codeReferences,qualification:'clause-scoped-not-whole-design',designTransferAllowed:false};
 if(![fck,d,b0,rho,lambda].every(x=>Number.isFinite(x)&&x>0)||fck<18||fck>90||rho>0.03||lambda>1||!['interior','edge','corner'].includes(columnPosition))return {...base,status:'NOT_CHECKED',reason:'PUNCHING_RULE_INPUT_RANGE',capacity:null};
 const alphaS={interior:1,edge:1.33,corner:2}[columnPosition],effectiveRho=Math.max(0.005,rho);
 const ks=Math.max(0.75,Math.min(1.1,(300/d)**0.25)),kbo=Math.min(1.25,4/Math.sqrt(alphaS*b0/d));
 const fte=0.2*Math.sqrt(fck),fcc=2*fck/3,cotPsi=Math.sqrt(fte*(fte+fcc))/fte;
 const cu=d*(25*Math.sqrt(effectiveRho/fck)-300*effectiveRho/fck);
 const vc=lambda*ks*kbo*fte*cotPsi*cu/d,Vc=vc*b0*d/1000;
 return {...base,status:'CALCULATED',capacity:0.75*Vc,nominalCapacity:Vc,phi:0.75,unit:'kN',factors:{ks,kbo,fte,fcc,cotPsi,cu,alphaS,effectiveRho},requirements:['reinforcement-extension-h-plus-development-length','combined-moment-transfer-4.11.7'],input:{fck,d,b0,rho,lambda,columnPosition}};
}
