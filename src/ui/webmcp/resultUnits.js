// Raw result numbers are never rescaled by WebMCP. Model units describe display.
const staticUnits = Object.freeze({length:'m',displacement:'m',rotation:'rad',force:'kN',moment:'kN.m'});
export function resultSliceUnits(kind, path, displayUnits) {
  let valueUnit=null, componentUnits=null;
  if(kind==='static') {
    if(/\.(dmax|dmaxM|xs)$/.test(path))valueUnit='m';
    if(/\.memberResults\.[^.]+\.(N|Vy|Vz)$/.test(path))valueUnit='kN';
    if(/\.memberResults\.[^.]+\.(My|Mz|Tq)$/.test(path))valueUnit='kN.m';
    if(/\.disp\.[^.]+$/.test(path))componentUnits=['m','m','m','rad','rad','rad'];
    if(/\.reactions\.[^.]+$/.test(path))componentUnits=['kN','kN','kN','kN.m','kN.m','kN.m'];
  }
  const rawResultUnits=kind==='static'?staticUnits:null;
  return {units:rawResultUnits,solverUnitPolicy:rawResultUnits,rawResultUnits,displayUnits,
    unitContract:{version:'p21-result-slice-units-v1',kind,path,valueUnit,componentUnits,
      valuesRescaled:false,fieldMetadataRequired:valueUnit===null&&componentUnits===null,
      note:'Raw values; mixed records and unrecognized fields require their own field units. Display units must not be applied to raw numbers.'}};
}
