import {buildDetailDrawings} from './detailDrawings.js';
import {buildVectorDetailPdf} from './vectorPdf.js';
import {buildStoredZip} from './storedZip.js';
import {sha256Bytes} from '../../core/stableHash.js';

export function renderPdfVolume(snapshot,font,volume){
 const drawing=buildDetailDrawings(snapshot,{maxPages:600,checkRetention:'omit',pageOffset:volume*60,pageLimit:60});
 const totalPages=drawing.totalPages,volumeCount=Math.ceil(totalPages/60),pageStart=volume*60+1,pageEnd=Math.min(totalPages,(volume+1)*60);
 if(volume>=volumeCount)throw Error('DRAWING_VOLUME_REQUIRED');
 for(const p of drawing.pages)p.commands.push({kind:'text',x:35,y:820,size:8,text:`${volume+1}/${volumeCount}권 · 자료 참조는 전권 통합 쪽수 기준`});
 const bytes=buildVectorDetailPdf(drawing.pages,font);
 return {bytes,mime:'application/pdf',spliceGeometryIssueCount:drawing.spliceGeometryIssues.length,detailHash:drawing.detailHash,preparedGeometryHash:drawing.preparedGeometryHash,...(drawing.designComparison?{designComparison:drawing.designComparison}:{}),analysisSources:drawing.analysisSources,sourceAnalysisRunIds:drawing.sourceAnalysisRunIds,pages:pageEnd-pageStart+1,retainedPages:drawing.retainedPageCount,totalPages,volume,volumeCount,pageStart,pageEnd,nextVolume:volume+1<volumeCount?volume+1:null};
}
export function buildPdfVolumeBundle(snapshot,font){
 const files=[],volumes=[];let first,totalBytes=0;
 for(let volume=0;volume<(first?.volumeCount??1);volume++){
  const result=renderPdfVolume(snapshot,font,volume),{bytes,...metadata}=result;
  first??=metadata;
  if(result.totalPages!==first.totalPages||result.detailHash!==first.detailHash||result.preparedGeometryHash!==first.preparedGeometryHash)throw Error('DRAWING_BUNDLE_SOURCE_MISMATCH');
  totalBytes+=bytes.length;if(totalBytes>32*1024*1024)throw Error('DRAWING_ARTIFACT_SIZE_LIMIT');
  const filename=`volume-${String(volume+1).padStart(2,'0')}.pdf`;
  volumes.push({filename,volume,pages:result.pages,pageStart:result.pageStart,pageEnd:result.pageEnd,byteLength:bytes.length,sha256:sha256Bytes(bytes)});
  files.push({name:filename,bytes});
 }
 const manifest={version:'p25-pdf-bundle-v1',spliceGeometryIssueCount:first.spliceGeometryIssueCount,fontSha256:sha256Bytes(font),evaluationId:snapshot.id,inputHash:snapshot.inputHash,evaluatorVersion:snapshot.evaluatorVersion??null,rulePackHash:snapshot.rulePackHash??null,detailHash:first.detailHash,preparedGeometryHash:first.preparedGeometryHash,...(first.designComparison?{designComparison:first.designComparison}:{}),analysisSources:first.analysisSources,sourceAnalysisRunIds:first.sourceAnalysisRunIds,totalPages:first.totalPages,volumeCount:first.volumeCount,volumes,reviewOnly:true,designTransferAllowed:false};
 files.push({name:'manifest.json',bytes:new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n')});
 return {...first,bytes:buildStoredZip(files),mime:'application/zip',pages:first.totalPages,retainedPages:Math.min(first.totalPages,60),volume:null,pageStart:1,pageEnd:first.totalPages,nextVolume:null,volumes};
}
