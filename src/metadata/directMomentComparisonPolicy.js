import {stableHash} from '../core/stableHash.js';
export const DIRECT_MOMENT_COMPARISON_VERSION='p25-direct-moment-comparison-v4-winkler';
// Validates retained evidence consistency, not independent numerical qualification.
export function validDirectMomentComparison(result){
 const c=result.firstOrderMomentComparison,s=result.momentComparisonSummary;
 if(!c||!s||c.version!==DIRECT_MOMENT_COMPARISON_VERSION||s.version!==c.version||c.limit!==1.4||c.absoluteTolerance!==1e-9||c.relativeTolerance!==1e-9||c.units?.moment!=='kN.m'||c.units?.position!=='m'||c.fullMemberQualified!==false||c.designTransferAllowed!==false||s.fullMemberQualified!==false||s.additionalAnalysisCount!==0)return false;
 if(!c.members||Array.isArray(c.members)||typeof c.members!=='object')return false;
 const ids=Object.keys(result.memberForceSources||{}),entries=Object.entries(c.members);
 if(ids.length>20||entries.length!==ids.length||entries.some(([id])=>!ids.includes(id)))return false;
 const statuses=['NOT_CHECKED','EXCEEDS_IN_RECOVERY_INTERVALS','WITHIN_RECOVERY_INTERVALS','EXCEEDS_AT_RECORDED_STATIONS','WITHIN_AT_RECORDED_STATIONS'];
 if(entries.some(([,r])=>!r||r.fullMemberQualified!==false||!statuses.includes(r.status)||r.status==='NOT_CHECKED'&&(typeof r.reason!=='string'||!r.reason)||r.status!=='NOT_CHECKED'&&r.intervalCoverageVerified!==['EXCEEDS_IN_RECOVERY_INTERVALS','WITHIN_RECOVERY_INTERVALS'].includes(r.status)||r.status==='NOT_CHECKED'&&r.intervalCoverageVerified===true))return false;
 return s.comparedMemberCount===entries.length&&s.continuousMemberCount===entries.filter(([,r])=>r.intervalCoverageVerified===true).length&&s.exceedingMemberCount===entries.filter(([,r])=>r.status.startsWith('EXCEEDS_')).length&&s.comparisonHash===stableHash(c);
}
