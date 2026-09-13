// Frame rotations ry=-w', rz=v'; generalized strains [u',w'',v''].
export function frameAxialBendingRows(L,x){
 const t=x/L,c=[(-6+12*t)/L**2,(-4+6*t)/L,(6-12*t)/L**2,(-2+6*t)/L];
 const rows=Array.from({length:3},()=>Array(12).fill(0));rows[0][0]=-1/L;rows[0][6]=1/L;
 [2,4,8,10].forEach((i,j)=>{rows[1][i]=c[j]*(j%2?-1:1);});
 [1,5,7,11].forEach((i,j)=>{rows[2][i]=c[j];});return rows;
}
export function withoutFrameRigidMotion(u,L){
 const q=[...u];for(let i=0;i<3;i++){q[i]=0;q[i+6]=u[i+6]-u[i];}
 q[7]-=L*u[5];q[8]+=L*u[4];for(let i=3;i<6;i++){q[i]=0;q[i+6]=u[i+6]-u[i];}return q;
}
