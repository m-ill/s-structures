// Integrate the explicit stress-strain law over a rectangle. Split at projected
// corners and the plateau transition; Gaussian integration acts on smooth spans.
const quadrature=(()=>{
 const n=12,rows=[];
 for(let i=1;i<=n;i++){
  let z=Math.cos(Math.PI*(i-.25)/(n+.5)),derivative;
  for(let j=0;j<30;j++){
   let p=1,previous=0;
   for(let k=1;k<=n;k++){const next=((2*k-1)*z*p-(k-1)*previous)/k;previous=p;p=next;}
   derivative=n*(z*p-previous)/(z*z-1);const dz=p/derivative;z-=dz;if(Math.abs(dz)<1e-15)break;
  }
  rows.push([z,2/((1-z*z)*derivative**2)]);
 }
 return rows;
})();
export function parabolicStress(strain,fc,law){
 if(strain<=0)return 0;
 return .85*fc*(strain>=law.epsco?1:1-(1-strain/law.epsco)**law.exponent);
}
export function parabolicConcreteResponse({B,H},fc,law,theta,c){
 const ny=Math.cos(theta),nz=Math.sin(theta),edge=Math.abs(ny)*H/2+Math.abs(nz)*B/2;
 const corners=[[-H/2,-B/2],[H/2,-B/2],[H/2,B/2],[-H/2,B/2]],q=corners.map(([y,z])=>ny*y+nz*z);
 const lo=Math.max(Math.min(...q),edge-c),hi=Math.max(...q);
 const breaks=[lo,hi,...q,edge-c+c*law.epsco/law.epscu].filter(x=>x>=lo&&x<=hi).sort((a,b)=>a-b).filter((x,i,a)=>!i||x-a[i-1]>1e-12);
 let force=0,firstY=0,firstZ=0,area=0;
 for(let i=1;i<breaks.length;i++){
  const mid=(breaks[i]+breaks[i-1])/2,half=(breaks[i]-breaks[i-1])/2;
  for(const [node,weight] of quadrature){
   const at=mid+half*node,points=[];
   for(let k=0;k<4;k++){
    const j=(k+1)%4,delta=q[j]-q[k];if(Math.abs(delta)<1e-14)continue;
    const t=(at-q[k])/delta;
    if(t>=0&&t<=1)points.push([corners[k][0]+t*(corners[j][0]-corners[k][0]),corners[k][1]+t*(corners[j][1]-corners[k][1])]);
   }
   if(points.length!==2)continue;
   const [a,b]=points,dA=Math.hypot(a[0]-b[0],a[1]-b[1])*weight*half;
   const df=parabolicStress(law.epscu*(1-(edge-at)/c),fc,law)*dA*1000;
   area+=dA;force+=df;firstY+=df*(a[0]+b[0])/2;firstZ+=df*(a[1]+b[1])/2;
  }
 }
 return {N:-force,My:firstZ,Mz:-firstY,compressionArea:area};
}
