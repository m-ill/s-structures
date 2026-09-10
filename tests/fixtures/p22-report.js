import {stableHash} from '../../src/core/stableHash.js';
// Artificial rows only: no address, building geometry, or real project data.
export function createP22Report(){
 const checks=Array.from({length:12},(_,i)=>({memberId:`합성부재-${i+1}`,comboId:'SYNTHETIC',analysisRunId:'synthetic-run',category:'예비 검사',checkId:`CHECK-${i+1}`,status:i%2?'NOT_CHECKED':'NG',ratio:i%2?null:1.2,demand:12,capacity:i%2?null:10,unit:'kN',expression:'합성 자료: 수요 / 내력',reason:i%2?'입력 미확정 - 미검토':'예비 검토 불합격'}));
 const core={project:{id:'P22-SYNTHETIC-PDF'},analysis:{maxDisplacement:0.001,maxEquilibriumResidual:0},designReview:{designRunId:'synthetic-review',summary:{status:'NG',counts:{NG:6,NOT_CHECKED:6}},inputIdentity:{inputHash:stableHash('synthetic-input')},resultHash:stableHash(checks),sourceAnalysisRunIds:['synthetic-run'],checks,messages:[],limitations:['실제 건물 시험이 아닌 한글·페이지 나눔 확인용 합성 자료입니다.','최종 구조설계에 사용할 수 없습니다.'],ruleSources:[{module:'synthetic',method:'test-only',status:'not-qualified'}]}};
 const reportSnapshotHash=stableHash(core);return {reportSnapshotHash,snapshot:{...core,reportSnapshotHash,verdict:{overall:'FAIL'}}};
}
