// These selectors activate existing calculation owners. They are not defaults
// and do not establish the project's applicable KDS edition or clause coverage.
const selectors={
 'rc-section-strength':['strengthStandard','KDS-142020-2022'],
 'rc-shear-y':['shearStandard','KDS-142022-2022'],
 'rc-shear-z':['shearStandard','KDS-142022-2022'],
 'rc-spacing':['spacingStandard','KDS-142050-2022'],
 'rc-cover':['coverStandard','KDS-142050-2022'],
 'rc-reinforcement-ratio':['detailingStandard','KDS-142020-2022'],
 'rc-confinement':['confinementStandard','KDS-142050-2022'],
 'rc-serviceability':['crackControlStandard','KDS-142020-2022'],
 'rc-torsion':['torsionStandard','KDS-142022-2022'],
};
export function missingRcRuleResult(checkId,details){
 const base={status:'NOT_CHECKED',ratio:null,designTransferAllowed:false};
 if(!details.length)return {...base,reason:'MISSING_REINFORCEMENT',blockerKind:'input-required'};
 const selector=selectors[checkId];
 if(!selector)return {...base,reason:'RULE_UNAVAILABLE',blockerKind:'rule-review-required'};
 const [field,supportedStandard]=selector;
 const selected=details.some(d=>d[field]===supportedStandard);
 return {...base,reason:selected?'DESIGN_RULE_SCOPE_REVIEW_REQUIRED':'DESIGN_STANDARD_SELECTION_REQUIRED',blockerKind:selected?'scope-review-required':'input-required',requiredInputFields:selected?[]:[field],supportedStandard,
  ruleSelection:details.map(d=>({detailId:d.id,detailVersion:d.version,field,value:d[field]??null})),
  automaticSelectionAllowed:false};
}

// Only known absent records receive a create-input target. Ambiguous or
// unsupported records require review and must not be replaced automatically.
export function missingDetailInputDiagnostic(entityId,result){
 if(result.status!==undefined&&result.status!=='NOT_CHECKED')return result;
 let target;
 if(result.reason==='MISSING_FOUNDATION_GEOMETRY'&&entityId.startsWith('foundation:'))target={type:'foundation-record',nodeId:entityId.slice(11)};
 else if(result.reason==='MISSING_CONNECTION_DETAILS'&&entityId.startsWith('joint:'))target={type:'connection-record',nodeId:entityId.slice(6)};
 else if(result.reason==='MISSING_REINFORCEMENT')target={type:'reinforcement-record',memberId:entityId};
 return target?{...result,blockerKind:'input-required',requiredInputRecords:[target],automaticSelectionAllowed:false}:result;
}
