// Nominal product mass from prepared centreline lengths; no density inference.
export function reinforcementMassQuantity(unitMassKgPerM,groups){
 const base={version:'p25-reinforcement-mass-v1',status:'NOT_CHECKED',unitMassKgPerM:unitMassKgPerM??null,pieceMassKg:null,totalMassKg:null,totalLength:null,pieceCount:null,units:{length:'m',mass:'kg',unitMass:'kg/m'},basis:'product-unit-mass-times-prepared-centerline',fabricationApproved:false,allowancesIncluded:false,allowanceBasis:'nominal centerline only; fabrication tolerances and procurement waste excluded'};
 if(!Number.isFinite(unitMassKgPerM)||unitMassKgPerM<=0)return {...base,unitMassKgPerM:null,reason:'PRODUCT_UNIT_MASS_REQUIRED'};
 if(!Array.isArray(groups)||!groups.length||groups.length>101||groups.some(g=>!g||!Number.isFinite(g.length)||g.length<=0||!Number.isSafeInteger(g.count)||g.count<=0))return {...base,reason:'PREPARED_PIECE_LENGTHS_REQUIRED'};
 const pieceCount=groups.reduce((n,g)=>n+g.count,0),totalLength=groups.reduce((n,g)=>n+g.length*g.count,0),totalMassKg=unitMassKgPerM*totalLength;
 if(!Number.isSafeInteger(pieceCount)||![totalLength,totalMassKg].every(Number.isFinite))return {...base,reason:'REINFORCEMENT_MASS_OVERFLOW'};
 return {...base,status:'OK',reason:null,pieceCount,totalLength,totalMassKg,pieceMassKg:groups.every(g=>g.length===groups[0].length)?groups[0].length*unitMassKgPerM:null};
}
