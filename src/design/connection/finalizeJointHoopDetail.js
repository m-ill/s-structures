const replaced=new Set(['rounded-tie-corner-support','supported-bar-clearance','corner-support-coverage','spatial-tie-corner-support']);
export const jointHoopDimensionChecks=detail=>(detail.checks||[]).filter(c=>!replaced.has(c.kind));
// Replace only the nominal corner predicates now checked against actual paths.
// Every physical/dimensional requirement remains separately visible.
export function finalizeJointHoopDetail(joint,prepared,detail,credit){
 const checks=jointHoopDimensionChecks(detail),readiness=[];
 const add=(id,r,reason)=>{
  readiness.push({id,status:['OK','NG'].includes(r?.status)?r.status:'NOT_CHECKED',reason:r?.status==='OK'?null:r?.reason||reason});
  if(r?.incomplete&&r.status!=='NOT_CHECKED')readiness.push({id:`${id}-coverage`,status:'NOT_CHECKED',reason:r.incompleteReasons?.[0]||reason});
 };
 const requiredKinds=['tie-diameter','tie-spacing','start-first-tie','end-first-tie','135-hook-tail','inside-bend-radius'];
 const missing=requiredKinds.some(kind=>!checks.some(c=>c.kind===kind)),dimensionNG=checks.some(c=>c.status==='NG'||Number.isFinite(c.ratio)&&c.ratio>1+1e-10),dimensionNC=missing||checks.some(c=>c.status==='NOT_CHECKED'||!Number.isFinite(c.ratio));
 add('dimensions',{status:dimensionNG?'NG':dimensionNC?'NOT_CHECKED':'OK'},'JOINT_TRANSVERSE_DIMENSIONS_REQUIRED');
 if(dimensionNG&&dimensionNC)add('dimension-coverage',null,'JOINT_TRANSVERSE_DIMENSIONS_REQUIRED');
 const tail=joint.jointHookTail,required=detail.requiredSeismicTail;
 add('seismic-tail',{status:![tail,required].every(v=>Number.isFinite(v)&&v>0)?'NOT_CHECKED':tail>=required-1e-10?'OK':'NG'},'JOINT_SEISMIC_HOOK_TAIL_REQUIRED');
 const closure=prepared.outerHoop?.closureGeometry;
 for(const [id,r,reason] of [
  ['distribution',prepared.stirrupDistribution,'JOINT_HOOP_DISTRIBUTION_REQUIRED'],
  ['outer-hoop-shape',closure,'JOINT_OUTER_HOOP_SHAPE_REQUIRED'],
  ['outer-hoop-self-assembly',closure?.selfAssembly,'JOINT_OUTER_HOOP_ASSEMBLY_REQUIRED'],
  ['hoop-cross-tie-assembly',closure?.crossTieAssembly,'JOINT_HOOP_CROSS_TIE_ASSEMBLY_REQUIRED'],
  ['transverse-longitudinal-assembly',detail.transverseLongitudinalAssembly,'JOINT_TRANSVERSE_LONGITUDINAL_ASSEMBLY_REQUIRED'],
  ['outer-hoop-support',detail.outerHoopSupport,'JOINT_OUTER_HOOP_ACTUAL_SUPPORT_REQUIRED'],
  ['longitudinal-support',detail.longitudinalSupport,'JOINT_LONGITUDINAL_LATERAL_SUPPORT_REQUIRED'],
 ])add(id,r,reason);
 if(joint.jointCrossTieBarPairs?.length){
  add('cross-tie-assembly',prepared.crossTies?.assembly,'JOINT_CROSS_TIE_ASSEMBLY_REQUIRED');
  add('cross-tie-support',detail.crossTieSupport,'JOINT_ALL_CROSS_TIE_CONTACT_REQUIRED');
  add('cross-tie-eligibility',credit,'JOINT_CROSS_TIE_ELIGIBILITY_REQUIRED');
 }
 const superseded=new Set(['JOINT_HOOP_CAGE_ASSEMBLY_REQUIRED','FOUR_CORNER_BARS_REQUIRED_ADDITIONAL_TIES_NOT_MODELLED','RECTANGULAR_CORNER_SUPPORT_GEOMETRY_REQUIRED','SPATIAL_CORNER_SUPPORT_COVERAGE_REQUIRED']);
 for(const reason of detail.incompleteReasons||[])if(!superseded.has(reason))add('retained-source-coverage',null,reason);
 const ng=readiness.find(r=>r.status==='NG'),pending=readiness.filter(r=>r.status==='NOT_CHECKED');
 return {...detail,checks:[...checks,...(detail.longitudinalSupport?.checks||[])],status:ng?'NG':pending.length?'NOT_CHECKED':'OK',ratio:ng||pending.length?null:Math.max(0,...checks.map(c=>c.ratio),required/tail),reason:ng?.reason||pending[0]?.reason||null,incomplete:pending.length>0,incompleteReasons:[...new Set(pending.map(r=>r.reason))],readiness,methodReviewRequired:true,fabricationApproved:false,scope:'current spatial hoop and declared cross-tie dimensions, contact, lateral support and assembly; whole-design and fabrication qualification separate'};
}
