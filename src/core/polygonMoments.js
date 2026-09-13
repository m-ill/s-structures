// Exact clipping and area moments for convex counter-clockwise polygons.
export function clipPolygon(points,a,b,c) {
 const out=[];
 for(let i=0;i<points.length;i++) {
  const p=points[i],q=points[(i+1)%points.length],fp=a+b*p[0]+c*p[1],fq=a+b*q[0]+c*q[1];
  if(fp>=0)out.push(p);
  if((fp>=0)!==(fq>=0)){const t=fp/(fp-fq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
 }
 return out;
}
export function polygonMoments(points) {
 let A=0,X=0,Y=0,XX=0,XY=0,YY=0;
 for(let i=0;i<points.length;i++){const [x,y]=points[i],[u,v]=points[(i+1)%points.length],s=x*v-u*y;A+=s/2;X+=(x+u)*s/6;Y+=(y+v)*s/6;XX+=(x*x+x*u+u*u)*s/12;YY+=(y*y+y*v+v*v)*s/12;XY+=(2*x*y+x*v+u*y+2*u*v)*s/24;}
 return {A,X,Y,XX,XY,YY};
}
