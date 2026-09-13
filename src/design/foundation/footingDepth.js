import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function evaluateFootingDepth(f){
 const base={codeReferences:getKcscRuleSources(['142070']).map(r=>({...r,clause:'4.2.1(5)'})),qualification:'clause-scoped-not-whole-design',designTransferAllowed:false,scope:'isolated footing; bottom B below bottom L, existing layer convention'};
 if(f.foundationType!=='isolated')return {...base,status:'NOT_CHECKED',ratio:null,reason:'DIRECT_FOOTING_DEPTH_SCOPE_REQUIRED'};
 const axisChecks=['B','L'].map(axis=>{
  const diameter=f.reinforcement?.[`bottom${axis}`]?.diameter,lower=axis==='L'?f.reinforcement?.bottomB?.diameter:0;
  const row={axis,face:'bottom',limit:.15,unit:'m',relation:'>=',codeReferences:base.codeReferences};
  if(![f.thickness,f.cover,diameter].every(x=>Number.isFinite(x)&&x>0)||!Number.isFinite(lower)||lower<0)return {...row,status:'NOT_CHECKED',provided:null,ratio:null,reason:'FOOTING_BOTTOM_DEPTH_INPUT_REQUIRED'};
  const provided=f.thickness-f.cover-diameter/2-lower;
  if(provided<=0)return {...row,status:'NOT_CHECKED',provided,ratio:null,reason:'FOOTING_BOTTOM_DEPTH_GEOMETRY_INVALID'};
  return {...row,provided,ratio:.15/provided,status:provided+1e-10>=.15?'OK':'NG',reason:provided+1e-10>=.15?null:'DIRECT_FOOTING_MINIMUM_DEPTH_150MM'};
 });
 const incomplete=axisChecks.some(r=>r.status==='NOT_CHECKED'),failed=axisChecks.filter(r=>r.status==='NG'),governing=(failed.length?failed:incomplete?axisChecks.filter(r=>r.status==='NOT_CHECKED'):axisChecks).reduce((a,b)=>(b.ratio??0)>(a.ratio??0)?b:a);
 return {...base,...governing,status:failed.length?'NG':incomplete?'NOT_CHECKED':'OK',incomplete,axisChecks,thickness:f.thickness};
}
