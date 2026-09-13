// Small uncompressed ZIP writer for the text-only onboarding package (UTF-8).
export function textZip(files) {
  const encoder=new TextEncoder(),chunks=[],central=[];let offset=0;
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
  const header=(size)=>{const bytes=new Uint8Array(size);return {bytes,view:new DataView(bytes.buffer)};};
  for(const [name,text] of Object.entries(files)) {
    const n=encoder.encode(name),data=encoder.encode(text),checksum=crc(data),h=header(30);
    h.view.setUint32(0,0x04034b50,true);h.view.setUint16(4,20,true);h.view.setUint16(6,0x800,true);
    h.view.setUint16(12,33,true);h.view.setUint32(14,checksum,true);h.view.setUint32(18,data.length,true);h.view.setUint32(22,data.length,true);h.view.setUint16(26,n.length,true);
    chunks.push(h.bytes,n,data);
    const c=header(46);c.view.setUint32(0,0x02014b50,true);c.view.setUint16(4,20,true);c.view.setUint16(6,20,true);c.view.setUint16(8,0x800,true);c.view.setUint16(14,33,true);
    c.view.setUint32(16,checksum,true);c.view.setUint32(20,data.length,true);c.view.setUint32(24,data.length,true);c.view.setUint16(28,n.length,true);c.view.setUint32(42,offset,true);central.push(c.bytes,n);
    offset+=30+n.length+data.length;
  }
  const centralSize=central.reduce((n,b)=>n+b.length,0),end=header(22),count=Object.keys(files).length;
  end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,count,true);end.view.setUint16(10,count,true);end.view.setUint32(12,centralSize,true);end.view.setUint32(16,offset,true);
  const out=new Uint8Array(offset+centralSize+22);let at=0;for(const bytes of [...chunks,...central,end.bytes]){out.set(bytes,at);at+=bytes.length;}return out;
}
