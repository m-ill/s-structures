// Compact discovery contract. Full input limits are in the shared tool schema.
export function getRcDirectCapabilities(){
 return {version:1,stiffnessMode:'kds-elastic-second-order',
  tools:['run_rc_service_iteration','get_rc_service_iteration','cancel_rc_service_iteration'],
  checks:['rc-stability','rc-deflection'],limits:{maxFrameDivisions:8},
  pending:['long-term-creep-and-shrinkage','independent-method-qualification'],productionQualified:false};
}
