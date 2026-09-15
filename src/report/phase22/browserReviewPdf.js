import {buildVectorDetailPdf,readTrueType} from '../phase24/vectorPdf.js';
import {loadBundledDrawingFont} from '../phase24/drawingExportService.js';
import {formatDesignCodeBasis} from '../designCodeBasisFormat.js';
import {REPORT_CONTRACT} from '../reportContract.js';
import { sha256Bytes,stableHash } from '../../core/stableHash.js';

const encode=text=>new TextEncoder().encode(text);
const fail=code=>{throw Object.assign(new Error(code),{code});};
// Raster pages embed browser-rendered Korean glyphs without shipping local fonts.
// Original searchable data remains in the matching JSON/HTML/CSV artifacts.
export function buildImagePdf(pages,{width=595.28,height=841.89,maxBytes=32*1024*1024}={}) {
  if(!pages.length||pages.length>400)fail('PDF_PAGE_LIMIT');
  const parts=[],offsets=[0];let size=0;
  const add=data=>{const bytes=typeof data==='string'?encode(data):data;size+=bytes.length;if(size>maxBytes)fail('PDF_SIZE_LIMIT');parts.push(bytes);};
  const object=(id,body)=>{offsets[id]=size;add(`${id} 0 obj\n`);add(body);add('\nendobj\n');};
  const stream=(id,dict,bytes)=>{offsets[id]=size;add(`${id} 0 obj\n<<${dict} /Length ${bytes.length}>>\nstream\n`);add(bytes);add('\nendstream\nendobj\n');};
  add('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
  pages.forEach((page,i)=>{
    if(!(page.bytes instanceof Uint8Array)||page.bytes[0]!==255||page.bytes[1]!==216||!Number.isSafeInteger(page.width)||!Number.isSafeInteger(page.height)||page.width<1||page.height<1)fail('PDF_IMAGE_INVALID');
    const id=3+i*3;
    object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
    stream(id+1,` /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,page.bytes);
    stream(id+2,'',encode(`q ${width} 0 0 ${height} 0 0 cm /Im Do Q`));
  });
  const start=size;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for(const offset of offsets.slice(1))add(`${String(offset).padStart(10,'0')} 00000 n \n`);
  add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);
  const result=new Uint8Array(size);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}

export function* reviewPdfLines(report) {
  const s=report.snapshot,r=s.designReview;
  yield `프로젝트: ${s.project.id} / 검토: ${r.designRunId} / 판정: ${r.summary.status}`;
  yield `집계: ${JSON.stringify(r.summary.counts)}`;
  if(r.summary.practical)yield `실무 검토 집계: ${JSON.stringify(r.summary.practical)}`;
  yield `Snapshot: ${report.reportSnapshotHash}`;yield `Input: ${r.inputIdentity.inputHash}`;
  yield `Result: ${r.resultHash}`;
  yield `최대변위(m): ${s.analysis.maxDisplacement} / 평형잔차: ${s.analysis.maxEquilibriumResidual}`;
  yield '해석 출처';for(const id of r.sourceAnalysisRunIds)yield String(id);
  yield `Template: ${REPORT_CONTRACT.templateVersion}`;
  yield `Source: ${s.provenance?.sourceRevision??'미확인'} / Build: ${s.provenance?.buildId??'미확인'}`;
  yield `단위: ${JSON.stringify(r.units??{})} / 축: ${r.axes??'미확인'} / 부호: ${r.signConvention??'미확인'}`;
  yield '검토 항목';
  for(const row of r.checks){
    yield [`${row.memberId} / ${row.comboId} / ${row.category} / ${row.checkId} / ${row.status}`,
      `수요 ${row.demand??'미확정'} / 내력 ${row.capacity??'미확정'} (${row.unit??''}) / 검정비 ${row.ratio??'미검토'}`,
      `${row.expression||''}${row.reason?' / '+row.reason:''}`,formatDesignCodeBasis(row.codeBasis,'ko-KR')].join('\n');
  }
  yield '설명 및 제한';for(const row of r.messages||[])yield `${row.memberId||''} ${row.code||''}: ${row.message||''}`;
  for(const text of r.limitations||[])yield text;
  yield '구현·규칙 출처';for(const row of r.ruleSources||[])yield `${row.module} / ${row.method} / ${row.status}`;
}

export function createBrowserReviewPdfExporter(target,budget,{loadFont=loadBundledDrawingFont}={}) {
  let busy=false,disposed=false,controller=null;
  const urls=new Map(),timers=new Set();
  const supported=()=>!disposed&&!!(target.document?.createElement&&target.Blob&&target.URL?.createObjectURL);
  const releaseUrl=url=>{target.URL.revokeObjectURL(url);budget.release(urls.get(url));urls.delete(url);};
  return {
    supported,
    dispose(){disposed=true;controller?.abort();for(const timer of timers)target.clearTimeout(timer);timers.clear();for(const url of urls.keys())releaseUrl(url);},
    async export(report,{assertCurrent=()=>{},download=true}={}) {
      if(disposed)fail('PDF_EXPORT_DISPOSED');if(!supported())fail('PDF_BROWSER_UNAVAILABLE');if(busy)fail('PDF_EXPORT_BUSY');
      if(!/^[a-f0-9]{64}$/.test(report.reportSnapshotHash)||report.snapshot?.reportSnapshotHash!==report.reportSnapshotHash)fail('PDF_SNAPSHOT_INVALID');
      const {reportSnapshotHash,verdict,...core}=report.snapshot;
      if(stableHash(core)!==reportSnapshotHash)fail('PDF_SNAPSHOT_HASH_MISMATCH');
      busy=true;controller=new AbortController();
      const owner=budget.nextOwner('pdf-staging'),pages=[];
      const timeout=target.setTimeout(()=>controller?.abort(),10000);
      const guard=()=>{if(disposed)fail('PDF_EXPORT_DISPOSED');if(controller.signal.aborted)fail('PDF_EXPORT_TIMEOUT');assertCurrent();};
      try {
        guard();budget.reserve(owner,96*1024*1024);
        const fontBytes=await loadFont(controller.signal);guard();
        if(!(fontBytes instanceof Uint8Array)||fontBytes.length>8*1024*1024)fail('PDF_FONT_INVALID');
        const font=readTrueType(fontBytes),width=ch=>Math.round(font.width(font.glyph(ch.codePointAt(0)))*1000/font.units)/1000*10;
        let page,y,processed=0;
        const begin=()=>{if(pages.length>=400)fail('PDF_PAGE_LIMIT');page={width:595.28,height:841.89,commands:[]};pages.push(page);y=80;
          page.commands.push({kind:'text',x:32,y:35,size:12,text:'S-STRUCTURES | 일반구조설계 검토 보고서'},
          {kind:'text',x:32,y:53,size:9,text:'예비 검토 · 최종 구조설계 승인 아님'},
          {kind:'line',x1:32,y1:62,x2:563,y2:62});};
        const line=text=>{if(y>785)begin();page.commands.push({kind:'text',x:32,y,size:10,text:text||' '});y+=15;};
        begin();
        for(const text of reviewPdfLines(report)){
          if(String(text).length>64000)fail('PDF_LINE_LIMIT');
          const wrapped=[];
          for(const paragraph of String(text).replaceAll('\r\n','\n').replaceAll('\r','\n').split('\n')){
            let buffer='',used=0;
            for(const ch of paragraph.replaceAll('\t','    ')){
              const advance=width(ch);if(used+advance>530){wrapped.push(buffer);buffer='';used=0;}buffer+=ch;used+=advance;
            }
            wrapped.push(buffer);
          }
          if(wrapped.length<=47&&y+(wrapped.length-1)*15>785)begin();
          for(const textLine of wrapped)line(textLine);
          if(++processed%100===0){await new Promise(resolve=>target.setTimeout(resolve,0));guard();}
        }
        pages.forEach((page,i)=>page.commands.push({kind:'text',x:32,y:818,size:9,text:`${REPORT_CONTRACT.templateVersion} · ${i+1} / ${pages.length}`}));
        guard();const data=buildVectorDetailPdf(pages,fontBytes,{maxPages:400});guard();
        const result={ok:true,format:'pdf',scope:REPORT_CONTRACT.scope,pages:pages.length,byteLength:data.length,sha256:sha256Bytes(data),reportSnapshotHash:report.reportSnapshotHash,inputHash:report.snapshot.designReview.inputIdentity.inputHash,resultHash:report.snapshot.designReview.resultHash,fontSha256:sha256Bytes(fontBytes),templateVersion:REPORT_CONTRACT.templateVersion,rendererVersion:REPORT_CONTRACT.rendererVersion,designTransferAllowed:false,textSearchable:true};
        if(download){
          const downloadOwner=budget.nextOwner('pdf-download');budget.reserve(downloadOwner,data.length);let url,a;
          try{url=target.URL.createObjectURL(new target.Blob([data],{type:'application/pdf'}));urls.set(url,downloadOwner);a=target.document.createElement('a');a.href=url;a.download=`review-${report.reportSnapshotHash.slice(0,16)}.pdf`;target.document.body.appendChild(a);a.click();}
          finally{a?.remove();if(url){const timer=target.setTimeout(()=>{timers.delete(timer);releaseUrl(url);},1000);timers.add(timer);}else budget.release(downloadOwner);}
        } else result.bytes=data;
        return result;
      }finally{target.clearTimeout(timeout);controller=null;pages.length=0;budget.release(owner);busy=false;}
    },
  };
}
