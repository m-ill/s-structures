import {encodeQuantityCsv} from './quantityCsv.js';
import {buildDetailDrawings,drawingsToSvg} from './detailDrawings.js';
import {renderPdfVolume,buildPdfVolumeBundle} from './pdfVolumeBundle.js';
import {encodeBoundedJson} from './boundedJson.js';
let endpoint;
if(typeof self!=='undefined')endpoint=self;
else {const {parentPort}=await import('node:worker_threads');endpoint=parentPort;}
const handle=event=>{
 const {snapshot,format,page,font,volume=0}=endpoint.addEventListener?event.data:event;
 try{
  if(format==='pdf'||format==='pdf-bundle'){const result=format==='pdf'?renderPdfVolume(snapshot,font,volume):buildPdfVolumeBundle(snapshot,font);endpoint.postMessage({ok:true,result},[result.bytes.buffer]);return;}
  const drawing=buildDetailDrawings(snapshot,{maxPages:600,checkRetention:['json','csv'].includes(format)?'reference':'omit',...(format==='svg'?{pageOffset:page,pageLimit:1}:format==='csv'?{pageOffset:600,pageLimit:1}:{})});let bytes,mime;
  const totalPages=drawing.totalPages;
  if(format==='svg'){
   if(page>=totalPages)throw Error('DRAWING_PAGE_REQUIRED');
   bytes=new TextEncoder().encode(drawingsToSvg(drawing.pages[0]));mime='image/svg+xml';
  }else if(format==='csv'){bytes=encodeQuantityCsv(drawing);mime='text/csv;charset=utf-8';}else {bytes=encodeBoundedJson(drawing);mime='application/json';}
  endpoint.postMessage({ok:true,result:{bytes,mime,spliceGeometryIssueCount:drawing.spliceGeometryIssues.length,detailHash:drawing.detailHash,preparedGeometryHash:drawing.preparedGeometryHash,pages:totalPages,retainedPages:drawing.retainedPageCount,totalPages,volume:null,volumeCount:null,pageStart:null,pageEnd:null,nextVolume:null,...(drawing.designComparison?{designComparison:drawing.designComparison}:{}),analysisSources:drawing.analysisSources,sourceAnalysisRunIds:drawing.sourceAnalysisRunIds}},[bytes.buffer]);
 }catch(error){endpoint.postMessage({ok:false,code:error.code||error.message});}
};
if(endpoint.addEventListener)endpoint.addEventListener('message',handle);else endpoint.on('message',handle);
