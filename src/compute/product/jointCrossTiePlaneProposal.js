import {fitCrossTieCage} from '../../design/rc/fitCrossTieCage.js';
import {resolveSectionRecord} from '../../materials/registry.js';
export function jointCrossTiePlaneProposal(command,rows,checks,model,edit={}){
 const no=reason=>({ok:false,reason});
 if(command.jointTieClosure!=='seismic-135'||command.jointHoopForm!=='closed-rectangular-two-leg')return no('JOINT_SEISMIC_HOOP_SCOPE_REQUIRED');
 if(!command.jointCrossTieBarPairs?.length)return no('JOINT_CROSS_TIE_PLANES_NOT_DECLARED');
 const needsFit=['tieSpacing','jointFirstStart','jointFirstEnd','jointBendInsideRadius','jointHookTail','jointCrossTieBarPairs'].some(k=>edit[k]!==undefined)||checks.some(c=>c.entityId===`joint:${command.nodeId}`&&c.checkId==='joint-hoop-detail'&&(c.spatialClosure?.crossTieAssembly?.status==='NG'||c.crossTies?.assemblyStatus==='NG'));
 if(!needsFit)return no('NO_JOINT_CROSS_TIE_PLANE_CHANGE_REQUIRED');
 const column=model?.members?.find(m=>m.id===command.columnMemberId),section=resolveSectionRecord(model,column?.secId),row=rows[0];
 if(!column||![column.n1,column.n2].includes(command.nodeId)||!command.memberIds?.includes(column.id)||!['RECT','SQUARE'].includes(section?.shape))return no('JOINT_COLUMN_REFERENCE_REQUIRED');
 const detail=model.designDetails?.reinforcement?.find(d=>d.id===row?.columnDetailId&&d.version===row.columnDetailVersion&&d.memberId===column.id);
 if(!detail||model.designDetails.reinforcement.some(d=>d.id===detail.id&&d.version>detail.version)||rows.some(r=>r.columnDetailId!==detail.id||r.columnDetailVersion!==detail.version))return no('CURRENT_JOINT_COLUMN_BARS_REQUIRED');
 const c={...command,...edit},fit=fitCrossTieCage({bars:detail.bars,cover:c.jointCover,start:0,end:1,stirrups:{diameter:c.tieDiameter/1000,spacing:c.tieSpacing/1000},tieClosure:'standard-135',tieClosureCorner:c.jointClosureCorner,tieClosureSeparation:c.jointClosureSeparation,tieBendInsideRadius:c.jointBendInsideRadius,tieHookTail:c.jointHookTail,tieFirstStart:c.jointFirstStart,tieFirstEnd:c.jointFirstEnd,crossTieBarPairs:c.jointCrossTieBarPairs,crossTieHookSides:c.jointCrossTieHookSides,crossTiePlaneOffsets:c.jointCrossTiePlaneOffsets},{B:section.params.B/1000,H:(section.params.H||section.params.B)/1000,length:c.jointPanelHeight});
 if(fit.status!=='OK')return no(fit.reason);
 const change={};
 if(fit.planeOffsets.some((s,i)=>Math.abs(Number(s)-Number(c.jointCrossTiePlaneOffsets?.[i]))>1e-10)||fit.planeOffsets.length!==c.jointCrossTiePlaneOffsets?.length)change.jointCrossTiePlaneOffsets=fit.planeOffsets;
 if(fit.hookSides.some((s,i)=>s!==c.jointCrossTieHookSides?.[i]))change.jointCrossTieHookSides=fit.hookSides;
 if(!Object.keys(change).length)return no('NO_JOINT_CROSS_TIE_PLANE_CHANGE_REQUIRED');
 return {ok:true,edit:change,columnDetailId:detail.id,columnDetailVersion:detail.version,planeTrials:fit.planeTrials,orientationTrials:fit.orientationTrials,diagnostics:fit.diagnostics,basis:fit.scope,requiresCandidateEvaluation:true,automaticApplicationAllowed:false};
}
