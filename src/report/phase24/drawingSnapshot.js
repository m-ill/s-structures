import {stableHash} from '../../core/stableHash.js';
import {selectDetailGeometryModel} from '../../core/detailGeometryModel.js';
// Select before cloning or structured worker serialization. Callers must clone
// this borrowed view before storing/mutating it; the workflow owns the source.
export function selectDrawingSnapshot(snapshot){
 const model=selectDetailGeometryModel(snapshot.model);
 return {...(snapshot.designComparison?{designComparison:snapshot.designComparisonDetails??snapshot.designComparison}:{}),id:snapshot.id,inputHash:snapshot.inputHash,evaluatorVersion:snapshot.evaluatorVersion,rulePackHash:snapshot.rulePackHash,model,checks:snapshot.checks,summary:snapshot.summary,preparedDetails:snapshot.preparedDetails,sets:snapshot.sets.map(row=>selectReportSource(row,{includeCreepEffects:true}))};
}

export function selectReportSource(row,{includeCreepEffects=false}={}){
 const stiffnessProvenance=row.set?.stiffnessProvenance??row.stiffnessProvenance;
 const creepEffects=row.set?row.set.creepEffects:row.creepEffects;
 const creepEvidence=creepEffects?{memberCount:Object.keys(creepEffects).length,sha256:stableHash(creepEffects),basis:'stored-per-member-time-effect-evidence'}:row.set?undefined:row.creepEvidence;
 return {...(creepEvidence?{creepEvidence}:{}),...(includeCreepEffects&&creepEffects?{creepEffects}:{}),...(stiffnessProvenance?{stiffnessProvenance}:{}),source:{...row.source},resultHash:row.resultHash??null,...(row.splicePolicy?{splicePolicy:row.splicePolicy}:{}),...(row.iterationPolicy?{iterationPolicy:row.iterationPolicy}:{}),...(row.analysisProof?{analysisProof:row.analysisProof}:{}),...(row.globalMethodQualified!==undefined?{globalMethodQualified:row.globalMethodQualified}:{})};
}
