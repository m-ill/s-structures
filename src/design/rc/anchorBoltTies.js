import {repeatedIntervalCoverage} from './repeatedIntervalCoverage.js';
import {getKcscRuleSources} from '../../metadata/kcscRuleSources.js';
export function anchorBoltTies({diameter,length,end,distribution}){
 const base={codeReferences:getKcscRuleSources(['142050']).map(r=>({...r,clause:'4.4.2(3)⑥'})),scope:'additional transverse reinforcement count within 125 mm of declared anchor-bolt member end; bolt anchorage and force transfer separate'};
 if(!Number.isFinite(diameter)||diameter<=0||!Number.isFinite(length)||length<=0||!['start','end','both'].includes(end))return {...base,status:'NOT_CHECKED',reason:'ANCHOR_BOLT_TIE_END_AND_GEOMETRY_REQUIRED',checks:[]};
 const required=diameter>=.0127-1e-12?2:3,ends=end==='both'?['start','end']:[end],checks=[];
 for(const side of ends){
  const range=side==='start'?[0,Math.min(.125,length)]:[Math.max(0,length-.125),length],coverage=repeatedIntervalCoverage(distribution,0,[range]);
  if(coverage.coveredCount===undefined)return {...base,status:'NOT_CHECKED',reason:'ANCHOR_BOLT_TIE_DISTRIBUTION_REQUIRED',checks};
  const provided=coverage.coveredCount;
  checks.push({kind:'anchor-bolt-end-ties',end:side,range,required,provided,minimumDiameter:diameter>=.0127-1e-12?.0127:.00953,diameter,ratio:provided?required/provided:null,status:diameter>=.00953-1e-12&&provided>=required?'OK':'NG'});
 }
 return {...base,status:checks.every(c=>c.status==='OK')?'OK':'NG',checks};
}
