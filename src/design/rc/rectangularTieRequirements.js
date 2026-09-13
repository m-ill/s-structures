// Dimensional requirements are independent of the number or layout of bars.
// KDS 14 20 50: 4.1.1(2), 4.1.2(2), 4.4.2(3).
export function rectangularTieRequirements({B,H,bars,diameter,spacing,firstStart,firstEnd,tail,insideRadius}){
 const nc=reason=>({status:'NOT_CHECKED',reason,checks:[]});
 if(![B,H,diameter,spacing,tail,insideRadius].every(v=>Number.isFinite(v)&&v>0)||![firstStart,firstEnd].every(v=>Number.isFinite(v)&&v>=0)||!Array.isArray(bars)||!bars.length||bars.length>100||bars.some(b=>!Number.isFinite(b.diameter)||b.diameter<=0))return nc('TIE_DIMENSION_INPUT_REQUIRED');
 const minDb=Math.min(...bars.map(b=>b.diameter)),maxDb=Math.max(...bars.map(b=>b.diameter));
 if(maxDb>.032&&maxDb<.0349||diameter>.016&&diameter<.019||diameter>.0254)return nc('KDS_BAR_SIZE_CLASS_REQUIRED');
 const requiredDiameter=maxDb<=.032?.00953:.0127,maxSpacing=Math.min(16*minDb,48*diameter,B,H),minRadius=(diameter<=.016?2:3)*diameter;
 const checks=[{kind:'tie-diameter',ratio:requiredDiameter/diameter,provided:diameter,required:requiredDiameter},{kind:'tie-spacing',ratio:spacing/maxSpacing,provided:spacing,maximum:maxSpacing},{kind:'start-first-tie',ratio:firstStart/(spacing/2),provided:firstStart,maximum:spacing/2},{kind:'end-first-tie',ratio:firstEnd/(spacing/2),provided:firstEnd,maximum:spacing/2},{kind:'135-hook-tail',ratio:6*diameter/tail,provided:tail,required:6*diameter},{kind:'inside-bend-radius',ratio:minRadius/insideRadius,provided:insideRadius,required:minRadius}];
 return {status:'OK',checks};
}
