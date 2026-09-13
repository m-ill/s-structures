export function validJointPlaneOffsets(value){
 return Array.isArray(value)&&value.length>0&&value.length<=20&&value.every(x=>typeof x==='string'&&x.length<=32&&x.trim()!==''&&Number.isFinite(Number(x))&&Math.abs(Number(x))<=1);
}
