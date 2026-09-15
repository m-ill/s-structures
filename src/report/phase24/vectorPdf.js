// Small bounded PDF writer for the drawing command model. Embeds a licensed
// TrueType font, explicit glyph widths, CID mapping and Unicode extraction map.
export function buildVectorDetailPdf(pages,fontBytes,{maxBytes=32*1024*1024,maxPages=60}={}) {
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>400||!Array.isArray(pages)||!pages.length||pages.length>maxPages)throw new Error('PDF_PAGE_LIMIT');
 if(!(fontBytes instanceof Uint8Array)||fontBytes.byteLength>8*1024*1024)throw new Error('PDF_FONT_INVALID');
 const font=readTrueType(fontBytes),characters=[...new Set(pages.flatMap(p=>p.commands.filter(c=>c.kind==='text').flatMap(c=>Array.from(c.text))))];
 if(characters.length>12000)throw new Error('PDF_GLYPH_LIMIT');
 const glyphs=characters.map(char=>({char,gid:font.glyph(char.codePointAt(0))}));
 if(glyphs.some(g=>g.gid===0))throw new Error(`PDF_FONT_GLYPH_UNAVAILABLE:${glyphs.filter(g=>g.gid===0).map(g=>g.char).join('')}`);
 const cids=new Map(characters.map((char,i)=>[char,i+1])),widths=glyphs.map(g=>Math.round(font.width(g.gid)*1000/font.units));
 const gidMap=new Uint8Array((glyphs.length+1)*2);glyphs.forEach((g,i)=>{gidMap[(i+1)*2]=g.gid>>8;gidMap[(i+1)*2+1]=g.gid&255;});
 const hex=n=>n.toString(16).padStart(4,'0').toUpperCase();
 const unicode=char=>Array.from({length:char.length},(_,i)=>hex(char.charCodeAt(i))).join('');
 let cmap='/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /SStructuresUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
 for(let i=0;i<glyphs.length;i+=100){const group=glyphs.slice(i,i+100);cmap+=`${group.length} beginbfchar\n`+group.map((g,j)=>`<${hex(i+j+1)}> <${unicode(g.char)}>`).join('\n')+'\nendbfchar\n';}
 cmap+='endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
 const parts=[],offsets=[0],encode=x=>new TextEncoder().encode(x);let size=0;
 const add=value=>{const bytes=typeof value==='string'?encode(value):value;size+=bytes.length;if(size>maxBytes)throw new Error('PDF_SIZE_LIMIT');parts.push(bytes);};
 const obj=(id,body)=>{offsets[id]=size;add(`${id} 0 obj\n${body}\nendobj\n`);};
 const stream=(id,dict,bytes)=>{offsets[id]=size;add(`${id} 0 obj\n<< ${dict} /Length ${bytes.length} >>\nstream\n`);add(bytes);add('\nendstream\nendobj\n');};
 add('%PDF-1.7\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${9+i*2} 0 R`).join(' ')}] >>`);
 obj(3,'<< /Type /Font /Subtype /Type0 /BaseFont /SStructuresSans /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 8 0 R >>');
 obj(4,`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SStructuresSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /CIDToGIDMap 7 0 R /DW 1000 /W [1 [${widths.join(' ')}]] >>`);
 const scaled=x=>Math.round(x*1000/font.units);
 obj(5,`<< /Type /FontDescriptor /FontName /SStructuresSans /Flags 4 /FontBBox [${font.bbox.map(scaled).join(' ')}] /ItalicAngle 0 /Ascent ${scaled(font.ascent)} /Descent ${scaled(font.descent)} /CapHeight ${scaled(font.ascent)} /StemV 80 /FontFile2 6 0 R >>`);
 stream(6,`/Length1 ${fontBytes.length}`,fontBytes);stream(7,'',gidMap);stream(8,'',encode(cmap));
 for(const [i,page] of pages.entries()) {
  const id=9+i*2,commands=['0.1 0.24 0.4 RG 0.1 0.14 0.22 rg 0.8 w'];
  if(page.commands.length>4000)throw new Error('PDF_COMMAND_LIMIT');
  const f=x=>{if(!Number.isFinite(x))throw new Error('PDF_COORDINATE_INVALID');return Number(x.toFixed(4));};
  for(const c of page.commands) {
   if(c.kind==='text') {
    const width=Array.from(c.text).reduce((s,ch)=>s+widths[cids.get(ch)-1],0)/1000*c.size;
    if(c.x<0||c.y<0||c.y>page.height||c.x+width>page.width-15)throw new Error('PDF_TEXT_OUTSIDE_PAGE');
    commands.push(`BT /F1 ${f(c.size)} Tf 1 0 0 1 ${f(c.x)} ${f(page.height-c.y)} Tm <${Array.from(c.text).map(ch=>hex(cids.get(ch))).join('')}> Tj ET`);
   } else if(c.kind==='line')commands.push(`${f(c.x1)} ${f(page.height-c.y1)} m ${f(c.x2)} ${f(page.height-c.y2)} l S`);
   else if(c.kind==='rect')commands.push(`${f(c.x)} ${f(page.height-c.y-c.h)} ${f(c.w)} ${f(c.h)} re S`);
   else if(c.kind==='circle') {
    const x=c.x,y=page.height-c.y,r=c.r,k=r*0.552284749831;
    commands.push(`${f(x+r)} ${f(y)} m ${f(x+r)} ${f(y+k)} ${f(x+k)} ${f(y+r)} ${f(x)} ${f(y+r)} c ${f(x-k)} ${f(y+r)} ${f(x-r)} ${f(y+k)} ${f(x-r)} ${f(y)} c ${f(x-r)} ${f(y-k)} ${f(x-k)} ${f(y-r)} ${f(x)} ${f(y-r)} c ${f(x+k)} ${f(y-r)} ${f(x+r)} ${f(y-k)} ${f(x+r)} ${f(y)} c S`);
   } else throw new Error('PDF_COMMAND_UNSUPPORTED');
  }
  obj(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id+1} 0 R >>`);
  stream(id+1,'',encode(commands.join('\n')));
 }
 const xref=size;add(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const offset of offsets.slice(1))add(`${String(offset).padStart(10,'0')} 00000 n \n`);
 add(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 const pdf=new Uint8Array(size);let at=0;for(const part of parts){pdf.set(part,at);at+=part.length;}return pdf;
}
export function readTrueType(bytes) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=o=>view.getUint16(o),i16=o=>view.getInt16(o),u32=o=>view.getUint32(o),tables={};
 if(u32(0)!==0x00010000)throw new Error('TRUETYPE_FONT_REQUIRED');
 for(let i=0;i<u16(4);i++){const p=12+i*16,name=String.fromCharCode(...bytes.slice(p,p+4)),offset=u32(p+8),length=u32(p+12);if(offset+length>bytes.length)throw new Error('TRUETYPE_TABLE_INVALID');tables[name]=offset;}
 for(const key of ['head','hhea','hmtx','maxp','cmap'])if(tables[key]===undefined)throw new Error('TRUETYPE_TABLE_REQUIRED');
 const head=tables.head,hhea=tables.hhea,base=tables.cmap,metrics=u16(hhea+34),glyphCount=u16(tables.maxp+4);let format4=null,format12=null;
 for(let i=0;i<u16(base+2);i++){const o=base+u32(base+4+i*8+4),format=u16(o);if(format===12)format12=o;if(format===4)format4=o;}
 const glyph=cp=>{
  if(format12!==null){let lo=0,hi=u32(format12+12)-1;while(lo<=hi){const mid=(lo+hi)>>1,p=format12+16+mid*12,a=u32(p),b=u32(p+4);if(cp<a)hi=mid-1;else if(cp>b)lo=mid+1;else return u32(p+8)+cp-a;}}
  if(format4!==null&&cp<=65535){const n=u16(format4+6)/2,end=format4+14,start=end+2*n+2,delta=start+2*n,range=delta+2*n;for(let i=0;i<n;i++){if(cp>u16(end+2*i))continue;if(cp<u16(start+2*i))return 0;const d=i16(delta+2*i),r=u16(range+2*i);if(!r)return (cp+d)&65535;const gid=u16(range+2*i+r+2*(cp-u16(start+2*i)));return gid?(gid+d)&65535:0;}}
  return 0;
 };
 return {units:u16(head+18),bbox:[i16(head+36),i16(head+38),i16(head+40),i16(head+42)],ascent:i16(hhea+4),descent:i16(hhea+6),glyph,
  width:gid=>{if(gid>=glyphCount)throw new Error('TRUETYPE_GLYPH_INVALID');return u16(tables.hmtx+Math.min(gid,metrics-1)*4);}};
}
