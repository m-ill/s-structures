import {clipPolygon,polygonMoments} from './compressionContact.js';
// Interior rectangular perimeter, centred on the declared column. Do not apply this model to an
// interrupted edge/corner/opening perimeter or claim flexural transfer credit.
export function criticalPerimeterActions({B,L,x=0,y=0,reaction,ledger,contact}){
 let polygon=contact.polygon;
 for(const [a,b,c] of [[B/2-x,1,0],[B/2+x,-1,0],[L/2-y,0,1],[L/2+y,0,-1]])polygon=clipPolygon(polygon,a,b,c);
 const m=polygonMoments(polygon),[a,b,c]=contact.pressurePlane;
 const soilForce=a*m.A+b*m.X+c*m.Y,soilFirstX=a*m.X+b*m.XX+c*m.XY,soilFirstY=a*m.Y+b*m.XY+c*m.YY;
 return {V:ledger.columnN+ledger.uniformDownwardPressure*B*L-soilForce,Mx:(ledger.columnBaseMx??ledger.columnMx??reaction.rmx)-(soilFirstY-y*soilForce),My:(ledger.columnBaseMy??ledger.columnMy??reaction.rmy)+(soilFirstX-x*soilForce),soilForce,soilFirstX,soilFirstY,columnOffsetX:x,columnOffsetY:y,momentReference:'column-plan-center-at-footing-base',distributedDownwardForce:ledger.uniformDownwardPressure*B*L,units:{force:'kN',moment:'kN.m'}};
}
export function perimeterShearInteraction({B,L,d,V,Mx,My,designStress}){
 if(![B,L,d,designStress].every(x=>Number.isFinite(x)&&x>0)||![V,Mx,My].every(Number.isFinite))return {status:'NOT_CHECKED',ratio:null,reason:'PERIMETER_SHEAR_INPUT_REQUIRED'};
 const area=2*(B+L)*d,Ix=d*(B*L**2/2+L**3/6),Iy=d*(L*B**2/2+B**3/6),directStress=Math.abs(V)/area;
 const remaining=designStress-directStress,momentCapacityX=Math.max(0,remaining)*Ix/(L/2),momentCapacityY=Math.max(0,remaining)*Iy/(B/2);
 const momentStress=Math.abs(Mx)*(L/2)/Ix+Math.abs(My)*(B/2)/Iy,ratio=(directStress+momentStress)/designStress;
 const interaction=remaining>0?momentStress/remaining:momentStress>0?null:0;
 return {status:ratio<=1+1e-10?'OK':'NG',ratio,demandStress:directStress+momentStress,capacity:designStress,directStress,momentStress,interaction,area,Ix,Iy,momentCapacityX,momentCapacityY,V,Mx,My,flexuralTransferCredit:0,scope:'conservative-uniform-stress-bound-on-interior-perimeter; shear-only linear distribution and biaxial interaction',units:{stress:'kPa',area:'m2',inertia:'m4',moment:'kN.m'}};
}
