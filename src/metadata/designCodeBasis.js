import {practicalRuleFor,PRACTICAL_RULE_PACK_HASH} from './practicalRuleImplementations.js';
import {getKcscRuleSources,KCSC_RULE_SOURCES} from './kcscRuleSources.js';
import {referenceClauseExists} from './designRuleCatalog.js';
const officialSources=KCSC_RULE_SOURCES;
const targets={
 'material-test-evidence':[['142001','3.1.1']],
 'rc-stability':[['142020','4.4.6']],
 'rc-section-strength':[['142020','4.1.1, 4.1.2'],['142010','4.2.3']],
 'rc-shear-y':[['142022','4'],['142010','4.2.3(2)']], 'rc-shear-z':[['142022','4'],['142010','4.2.3(2)']],
 'rc-cover':[['142050','4.3.1, 4.3.6']], 'rc-spacing':[['142050','4.2.2'],['142001','3.1.1(2)']], 'rc-reinforcement-ratio':[['142020','4.2, 4.3'],['142030','4.2.1(3); Eq.4.2-2']],
 'rc-confinement':[['142050','4.4']], 'rc-splices':[['142052','4.5.1'],['142052','4.5.2'],['142052','4.5.3'],['142050','4.2.2'],['142001','3.1.1']], 'rc-anchorage':[['142052','4.1, 4.5']],
 'rc-serviceability':[['142030','4.1, 4.2'],['142020','4.2.3(4); Eq.4.2-3; Eq.4.2-4']], 'rc-deflection':[['142030','4.2.1']], 'rc-torsion':[['142022','4'],['142010','4.2.3(2)']],
 'rc-code-compliance':[['412000','4']],
 'slab-thickness':[['142070','4.1.1.3(1)'],['142030','4.2.1']],
 'slab-flexure':[['142070','4.1.1.1'],['142020','4.1']],
 'slab-one-way-shear':[['142022','4.2.1(1); 4.3.3(1)']],
 'slab-bar-spacing':[['142070','4.1.1.3(2)']],
 'slab-shrinkage-temperature':[['142050','4.6.1; 4.6.2'],['142070','4.1.1.3(3)']],
 'slab-two-way-moments':[['142070','4.1.1.1(2); 부록 표 4-1~4-4']],
 'wall-thickness':[['142072','4.3.2(3)']],
 'wall-minimum-vertical-reinforcement':[['142072','4.2(2)']],
 'wall-minimum-horizontal-reinforcement':[['142072','4.2(3)']],
 'wall-bar-spacing':[['142072','4.2(5)']],
 'wall-reinforcement-layers':[['142072','4.2(4)']],
 'wall-axial-strength':[['142072','4.3.2(2)'],['142020','4.3.1']],
 'joint-shear':[['142080','4.6 (special moment frame applicability must be established)'],['142010','4.2.3(2)']],
 'joint-confinement':[['142080','4.6 (special moment frame applicability must be established)'],['142001','1.4']],
 'joint-hoop-detail':[['142080','4.5.4, 4.6.2'],['142001','1.4']],
 'joint-probable-forces':[['142080','4.6.1']],
 'joint-member-strength-ratio':[['142080','4.5.2'],['142020','4.1'],['142010','4.2.3']], 'joint-bar-congestion':[['142050','4.2.2'],['142080','4.6']], 'joint-anchorage':[['142052','4.1'],['142080','4.6'],['142050','4.1']],
 'foundation-flexure':[['142070','4.2'],['142010','4.2.3(2)'],['142022','4.2.1(1); 4.3.3(1); 4.11.1']], 'foundation-one-way-shear':[['142022','4'],['142070','4.2'],['142010','4.2.3(2)']],
 'foundation-punching':[['142022','4.11']], 'foundation-anchorage':[['142052','4.1'],['142070','4.2']],
 'foundation-ground-review':[['142070','4.2'],['115005','1.9, 4.2']],
 'foundation-bearing':[['115005','4.1.2']],
 'foundation-sliding':[['115005','1.9(5), 4.1.7(1)']],
 'foundation-overturning':[['115005','1.9(4)']],
 'foundation-plan-clearance':[['142070','4.2.1']],
 'foundation-footprint-fit':[['142070','4.2.1']],
 'foundation-differential-settlement':[['115005','4.2.6']],
 'foundation-settlement':[['115005','4.2.1, 4.2.6']],
 'foundation-column-transfer':[['142070','4.2.3'],['142052','4.1'],['142010','4.2.3(2)'],['142020','4.7']],
 'foundation-depth':[['142070','4.2.1(5)']],
 'foundation-spacing':[['142050','4.2.2'],['142001','3.1.1(2)④']],
 'foundation-reinforcement':[['142020','4.2.2'],['142050','4.6.2'],['142010','4.2.3(2)'],['142022','4.2.1(1); 4.3.3(1); 4.11.1'],['142070','4.2.1(5); 4.2.2.2(1),(2)']], 'foundation-distribution':[['142070','4.2.2.1'],['142010','4.2.3(2)'],['142022','4.2.1(1); 4.3.3(1); 4.11.1']],
 'foundation-code-compliance':[['142070','4.2'],['412000','4']],
};
function reviewReferences(checkId,result,proposed){
 let selected=targets[checkId]||[];
 if(checkId==='rc-stability'&&result.method==='refined-direct-elastic-second-order')selected=[['142020','4.4.2(2),(3),(4); 4.4.4']];
 // The appendix has its own numbering; a default main-body target with the
 // same number must not appear to be the basis of an appendix calculation.
 if(checkId==='rc-serviceability'&&proposed.length&&proposed.every(r=>r.documentPart==='appendix'))return proposed;
 return selected.map(([id,clause])=>({...getKcscRuleSources([id])[0],clause}));
}
export function designCodeBasis(checkId,result={}) {
 const proposed=result.codeReferences||((result.qualification==='clause-scoped-not-whole-design'&&result.governing?.source)?[result.governing.source]:[]);
 const complete=ref=>officialSources.some(source=>source.code===ref?.code&&source.edition===ref.edition&&source.url===ref.url&&source.sha256===ref.sha256)&&referenceClauseExists(ref);
 const blockers=[];
 if(result.incomplete===true)blockers.push('CHECK_INCOMPLETE');
 if(result.locationCoverage?.complete===false)blockers.push('LOCATION_COVERAGE_INCOMPLETE');
 if(result.methodReviewRequired)blockers.push('METHOD_REVIEW_REQUIRED');
 if(!['OK','NG','WARN','N_A'].includes(result.status))blockers.push('CHECK_NOT_EVALUATED');
 if(!proposed.length)blockers.push('CODE_REFERENCES_MISSING');
 else if(!proposed.every(complete))blockers.push('CODE_REFERENCE_NOT_VERIFIED');
 const applied=blockers.length?[]:proposed;
 const reviewTargets=[...(!applied.length?proposed:[]),...reviewReferences(checkId,result,proposed)];
 const uniqueTargets=[...new Map(reviewTargets.map(r=>[JSON.stringify([r.code,r.edition,r.documentPart||'main',r.clause,r.sha256]),r])).values()];
 return {version:'p25-code-basis-v5-method-specific-targets',rule:practicalRuleFor(checkId),rulePackHash:PRACTICAL_RULE_PACK_HASH,status:applied.length?'CLAUSE_APPLIED':'NOT_ESTABLISHED',blockers,verificationScope:'source-and-clause-heading; equation-mapping-and-independent-review-separate',
  applied:structuredClone(applied),
  reviewTargets:uniqueTargets.map(x=>({...x,applicability:'TO_BE_CONFIRMED'})),
  calculationBasis:result.qualification||'missing-or-unqualified-input',
  reason:applied.length?null:`KDS application not established: ${blockers.join(', ')}; calculation assumptions are not code certification`,
  wholeDesignQualified:false};
}
