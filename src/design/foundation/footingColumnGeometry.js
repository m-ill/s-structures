// Footing axes are global X/B and Y/L. Signed cut distances are measured
// outward from the footing centre; physical coordinates equal side * cut.
export function footingColumnGeometry(f){
 const x=f.columnOffsetX??0,y=f.columnOffsetY??0;
 const fail=reason=>({ok:false,reason});
 if(![f.B,f.L,f.columnWidth,f.columnDepth].every(v=>Number.isFinite(v)&&v>0)||![x,y].every(Number.isFinite))return fail('FOOTING_COLUMN_GEOMETRY_REQUIRED');
 const axes={};
 for(const [axis,span,column,offset] of [['B',f.B,f.columnWidth,x],['L',f.L,f.columnDepth,y]]){
  if(Math.abs(offset)+column/2>span/2+1e-10)return fail('COLUMN_OUTSIDE_FOOTING');
  axes[axis]={span,column,offset,low:offset-column/2,high:offset+column/2,cut:side=>column/2+side*offset};
 }
 return {ok:true,x,y,axes};
}
