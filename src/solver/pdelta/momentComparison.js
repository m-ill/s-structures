import {DIRECT_MOMENT_COMPARISON_VERSION} from '../../metadata/directMomentComparisonPolicy.js';
import {stableHash} from '../../core/stableHash.js';
import {continuousMomentComparisonPoints} from './continuousMomentComparison.js';
export function compareFirstSecondOrderMoments(first,second){
 const limit=1.4,absoluteTolerance=1e-9,relativeTolerance=1e-9,members={};
 for(const [id,originalSecond] of Object.entries(second.memberResults||{})){
  let a=first.memberResults?.[id],b=originalSecond;
  const nc=reason=>({status:'NOT_CHECKED',reason,fullMemberQualified:false});
  if(!first.ok||!second.ok||!a){members[id]=nc('MOMENT_COMPARISON_SOURCE_REQUIRED');continue;}
  const axesMatch=Number.isFinite(a.ax?.L)&&a.ax.L>0&&a.ax.L===b.ax?.L&&['x','y','z'].every(k=>a.ax?.[k]?.length===3&&b.ax?.[k]?.length===3&&Array.from(a.ax[k]).every((v,i)=>Number.isFinite(v)&&Number.isFinite(b.ax[k][i])&&Math.abs(v-b.ax[k][i])<=1e-10));
  if(!axesMatch){members[id]=nc('MOMENT_COMPARISON_AXES_MISMATCH');continue;}
  const continuous=continuousMomentComparisonPoints(a,b,limit,relativeTolerance),intervalCoverageVerified=continuous.status==='OK';
  if(continuous.reason==='CONTINUOUS_MOMENT_SOURCE_MISMATCH'){members[id]=nc(continuous.reason);continue;}
  if(intervalCoverageVerified){
   const expand=(row,key)=>({...row,xs:continuous.points.map(p=>p.x),stationSides:continuous.points.map(p=>p.side),My:continuous.points.map(p=>p[key].My),Mz:continuous.points.map(p=>p[key].Mz)});
   a=expand(a,'first');b=expand(b,'second');
  }
  const n=a.xs?.length,side=(r,i)=>r.stationSides?.[i]??'point';
  if(!n||n>(intervalCoverageVerified?1200:600)||b.xs?.length!==n||!Array.from(a.xs).every((x,i)=>Number.isFinite(x)&&x===b.xs[i]&&side(a,i)===side(b,i)&&['point','left','right'].includes(side(a,i))&&(!i||x>a.xs[i-1]||x===a.xs[i-1]&&side(a,i-1)==='left'&&side(a,i)==='right'))){members[id]=nc('MOMENT_COMPARISON_GRID_MISMATCH');continue;}
  if(!['My','Mz'].every(k=>a[k]?.length===n&&b[k]?.length===n&&Array.from(a[k]).every(Number.isFinite)&&Array.from(b[k]).every(Number.isFinite))){members[id]=nc('MOMENT_COMPARISON_VALUES_INVALID');continue;}
  if(['My','Mz'].some(k=>[a,b].some(r=>Array.from(r[k]).some(v=>Math.abs(v)>Number.MAX_VALUE*absoluteTolerance/4)))){members[id]=nc('MOMENT_COMPARISON_VALUES_OUT_OF_RANGE');continue;}
  const axes={};
  for(const axis of ['My','Mz']){
   let governing=null,maxScore=-Infinity,exceedanceCount=0,zeroReferenceExceedance=false,maximumFiniteRatio=0;
   for(let i=0;i<n;i++){
    const before=a[axis][i],after=b[axis][i],reference=Math.abs(before),value=Math.abs(after),tolerance=absoluteTolerance+relativeTolerance*Math.max(reference,value);
    const excess=value-limit*reference,exceeds=excess>tolerance,ratio=reference>absoluteTolerance?value/(limit*reference):value<=absoluteTolerance?0:null;
    if(exceeds)exceedanceCount++;if(exceeds&&ratio===null)zeroReferenceExceedance=true;
    if(ratio!==null)maximumFiniteRatio=Math.max(maximumFiniteRatio,ratio);
    const score=excess/Math.max(reference,tolerance);
    if(score>maxScore){maxScore=score;governing={x:a.xs[i],side:side(a,i),firstOrder:before,secondOrder:after,ratio,excess,tolerance};}
   }
   axes[axis]={governing,exceedanceCount,zeroReferenceExceedance,maximumFiniteRatio};
  }
  const exceeds=Object.values(axes).some(a=>a.exceedanceCount);
  members[id]={status:intervalCoverageVerified?(exceeds?'EXCEEDS_IN_RECOVERY_INTERVALS':'WITHIN_RECOVERY_INTERVALS'):(exceeds?'EXCEEDS_AT_RECORDED_STATIONS':'WITHIN_AT_RECORDED_STATIONS'),axes,stationCount:n,intervalCoverageVerified,intervalCount:continuous.intervalCount??null,continuousComparisonReason:continuous.reason??null,comparisonBasis:continuous.basis??'recorded-stations-only',sourceHash:stableHash({first:{xs:Array.from(a.xs),My:Array.from(a.My),Mz:Array.from(a.Mz),recovery:a.forceRecoveryInput},second:{My:Array.from(b.My),Mz:Array.from(b.Mz),recovery:b.forceRecoveryInput},ax:a.ax,sides:Array.from(a.xs,(_,i)=>side(a,i))}),fullMemberQualified:false};
 }
 return {version:DIRECT_MOMENT_COMPARISON_VERSION,limit,absoluteTolerance,relativeTolerance,units:{moment:'kN.m',position:'m'},basis:'same Direct run first-order seed and converged result; verified recovery intervals when available, otherwise matched recorded stations',members,fullMemberQualified:false,designTransferAllowed:false};
}
