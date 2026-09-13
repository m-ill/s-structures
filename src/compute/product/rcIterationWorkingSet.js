import {retainedBytes} from '../../core/resourceBudget.js';
import {directMemoryAdmission} from '../../solver/pdelta/constraintContext.js';
// Admission accounting shared by execution and candidates; never measured heap.
export function estimateRcIterationWorkingSet(model,settings={}){
 const combos=['fully-cracked-elastic','kds-elastic-second-order'].includes(settings.stiffnessMode)?settings.comboIds?.length:(model.loadCombinations||[]).filter(c=>c.enabled!==false).length;
 const sourceBytes=retainedBytes(model),memberCount=model.members?.length||0,comboCount=Math.max(1,combos||0);
 const refined=settings.stiffnessMode==='kds-elastic-second-order',nodeCount=(model.nodes?.length||0)+(refined?memberCount*(2**(settings.maxRefinements??2)-1):0);
 const barCounts=new Map();
 for(const d of model.designDetails?.reinforcement||[])barCounts.set(d.memberId,Math.max(barCounts.get(d.memberId)||0,d.bars?.length||0));
 const barCount=(model.members||[]).reduce((n,m)=>n+(barCounts.get(m.id)||0),0);
 const components={
  denseWorking:directMemoryAdmission({nodes:{length:nodeCount}},{maxWorkingBytes:Number.MAX_SAFE_INTEGER}).estimatedBytes,
  sourceCopies:sourceBytes*6,
  // 100 is the existing per-member profile cap. Covers bounded current/final
  // section states and transfer serialization across requested combinations.
  resultRecords:memberCount*(refined?600:100)*4096*comboCount,
  // Retained local displacement fields, relative extrema and transfer copies.
  refinedServiceRecords:refined?memberCount*2**(settings.maxRefinements??2)*4096*4*comboCount:0,
  // Saved/proposed station vectors and structured transfer copies. Includes
  // conservative number/key overhead; no 100-bar object rows are retained.
  barForceRecords:settings.stiffnessMode==='fully-cracked-elastic'?barCount*100*64*4*comboCount:0,
  // Up to 620 sampled six-component positions plus the retained integration
  // descriptor; reserve transfer and preparation copies before Worker launch.
  integratedDisplacements:settings.stiffnessMode==='fully-cracked-elastic'?memberCount*comboCount*(620*256+32768)*4:0,
  runtime:1024*1024,
 };
 const estimatedBytes=Math.ceil(Object.values(components).reduce((sum,x)=>sum+x,0));
 if(!Number.isSafeInteger(estimatedBytes)||estimatedBytes<0)throw Error('RESOURCE_SIZE_INVALID');
 return {version:'p25-rc-working-set-v5-integrated-displacements',estimatedBytes,components,fullDofs:(model.nodes?.length||0)*6,maximumAnalysisDofs:nodeCount*6,memberCount,comboCount,measuredHeap:false,basis:'conservative-dense-working-set-and-bounded-profile-transfer-estimate'};
}
