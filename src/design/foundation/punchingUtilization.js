// Extensions are newly prepared local check rows, not stored input records.
export function punchingUtilization(extensions,shearRatio){
 for(const row of extensions){
  row.ratio=row.available>0&&Number.isFinite(row.required/row.available)?row.required/row.available:null;
  row.status??=row.available<row.required?'NG':'OK';
 }
 const missing=extensions.some(row=>row.status==='NG'&&row.ratio===null),extensionRatio=Math.max(0,...extensions.map(row=>row.ratio??0));
 return {ratio:missing||!Number.isFinite(shearRatio)?null:Math.max(shearRatio,extensionRatio),shearRatio,extensionRatio:missing?null:extensionRatio,ratioBasis:'maximum-shear-and-required-extension',governingCriterion:missing||extensionRatio>shearRatio?'reinforcement-extension':'shear-strength'};
}
