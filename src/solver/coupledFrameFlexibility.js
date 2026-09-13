// Work-conjugate order N, My, Mz; strains epsilon, w'', v'' in frame recovery.
// Normalized Cholesky avoids mixing axial and rotational scales in pivot tests.
export function invertPositiveMatrix(matrix,size){
 if(!Array.isArray(matrix)||matrix.length!==size||matrix.some(row=>!Array.isArray(row)||row.length!==size||!row.every(Number.isFinite)))return null;
 const d=matrix.map((row,i)=>Math.sqrt(row[i]));if(d.some(x=>!Number.isFinite(x)||x<=0))return null;
 const a=matrix.map((row,i)=>row.map((x,j)=>x/d[i]/d[j]));
 const l=Array.from({length:size},()=>Array(size).fill(0));
 for(let i=0;i<size;i++)for(let j=0;j<=i;j++){
  if(Math.abs(a[i][j]-a[j][i])>1e-12)return null;
  let v=(a[i][j]+a[j][i])/2;for(let k=0;k<j;k++)v-=l[i][k]*l[j][k];
  if(i===j){if(!(v>1e-13))return null;l[i][j]=Math.sqrt(v);}else l[i][j]=v/l[j][j];
 }
 const inverse=Array.from({length:size},()=>Array(size).fill(0));
 for(let col=0;col<size;col++){
  const y=Array(size).fill(0),x=Array(size).fill(0);
  for(let i=0;i<size;i++){let v=i===col?1:0;for(let j=0;j<i;j++)v-=l[i][j]*y[j];y[i]=v/l[i][i];}
  for(let i=size-1;i>=0;i--){let v=y[i];for(let j=i+1;j<size;j++)v-=l[j][i]*x[j];x[i]=v/l[i][i];}
  for(let i=0;i<size;i++)inverse[i][col]=x[i]/d[i]/d[col];
 }
 return inverse.flat().every(Number.isFinite)?inverse:null;
}
export function sectionAxialBendingFlexibility(section,E){
 return section.axialBendingFlexibility??[[1/(E*section.A),0,0],[0,1/(E*section.Iy),0],[0,0,1/(E*section.Iz)]];
}
export function coupledFrameStiffness(integrate,E,G,L,shear){
 // Basic forces: axial, torsion, MyI, MyJ, MzI, MzJ.
 const f=Array.from({length:6},()=>Array(6).fill(0));
 // The existing integrator supplies physical weights through its scalar sum.
 // Cache no per-station histories; each scalar component is integrated exactly.
 for(let i=0;i<6;i++)for(let j=0;j<=i;j++)f[j][i]=f[i][j]=integrate((section,s)=>{
  const c=sectionAxialBendingFlexibility(section,E),r=[[1,0,0,0,0,0],[0,0,1-s,-s,0,0],[0,0,0,0,-(1-s),s]];
  let v=0;for(let a=0;a<3;a++)for(let b=0;b<3;b++)v+=r[a][i]*c[a][b]*r[b][j];
  if(i===1&&j===1)v+=1/(G*section.J);
  if(shear&&i>=2&&j>=2&&Math.floor(i/2)===Math.floor(j/2))v+=1/(G*(i<4?section.Az:section.Ay)*L*L);
  return v;
 });
 const inverse=invertPositiveMatrix(f,6);if(!inverse)return null;
 const b=Array.from({length:6},()=>Array(12).fill(0));
 b[0][0]=-1;b[0][6]=1;b[1][3]=-1;b[1][9]=1;
 for(const row of [2,3]){b[row][2]=-1/L;b[row][8]=1/L;}b[2][4]=1;b[3][10]=1;
 for(const row of [4,5]){b[row][1]=1/L;b[row][7]=-1/L;}b[4][5]=1;b[5][11]=1;
 const kl=Array.from({length:12},()=>Array(12).fill(0));
 for(let i=0;i<12;i++)for(let j=0;j<12;j++)for(let a=0;a<6;a++)for(let c=0;c<6;c++)kl[i][j]+=b[a][i]*inverse[a][c]*b[c][j];
 const deformation=Array.from({length:6},(_,i)=>integrate((section,s)=>{
  const e=section.initialGeneralizedStrain??[0,0,0];
  const r=[[1,0,0,0,0,0],[0,0,1-s,-s,0,0],[0,0,0,0,-(1-s),s]];
  return r.reduce((sum,row,j)=>sum+row[i]*e[j],0);
 }));
 const basicInitial=inverse.map(row=>-row.reduce((sum,v,i)=>sum+v*deformation[i],0));
 const initialFixedEnd=Array.from({length:12},(_,i)=>b.reduce((sum,row,j)=>sum+row[i]*basicInitial[j],0));
 if(!initialFixedEnd.every(Number.isFinite))return null;
 return {kl,basicFlexibility:f,initialFixedEnd};
}
