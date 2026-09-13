// Roots in normalized cell coordinate avoid powers of the full member length.
export function normalizedQuadraticRoots(a,b,c){
 const scale=Math.max(Math.abs(a),Math.abs(b),Math.abs(c));if(!scale)return [];
 a/=scale;b/=scale;c/=scale;
 if(a===0)return b===0?[]:[-c/b];
 let d=b*b-4*a*c;
 if(d<0&&d>=-1e-14*Math.max(b*b,Math.abs(4*a*c)))d=0;
 if(d<0)return [];
 const q=-.5*(b+(b>=0?1:-1)*Math.sqrt(d));
 return q===0?[-b/(2*a)]:[q/a,c/q];
}
