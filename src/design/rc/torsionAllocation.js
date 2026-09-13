export function torsionSteelAllocation(detail) {
 const fraction=detail.torsionLongitudinalFraction;
 if(detail.torsionDesignMode!=='solid-rectangular-45deg')return {bars:detail.bars,reservedArea:0,fraction:0};
 if(!Number.isFinite(fraction)||fraction<=0||fraction>=1)throw new Error('TORSION_LONGITUDINAL_ALLOCATION_REQUIRED');
 return {fraction,reservedArea:detail.bars.reduce((s,b)=>s+b.area*fraction,0),bars:detail.bars.map(b=>({...b,physicalArea:b.area,area:b.area*(1-fraction)}))};
}
