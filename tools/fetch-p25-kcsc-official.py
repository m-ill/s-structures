"""Read approved KCSC key from stdin; never persist or print credentials/URLs containing it."""
import sys, json, hashlib, urllib.request, urllib.parse, getpass
from pathlib import Path
from datetime import datetime, timezone

key=getpass.getpass('KCSC API key (not echoed): ').strip() if sys.stdin.isatty() else sys.stdin.readline().strip()
if not key: raise SystemExit('KCSC key required on stdin')
folder=Path('verification/evidence/phase25/kcsc/official-20260911'); folder.mkdir(parents=True,exist_ok=True)
codes=['142001','142040','411005','411200','411700','115005']
records=[]
for code in codes:
    public='https://kcsc.re.kr/OpenApi/CodeViewer/KDS/'+code
    try:
        with urllib.request.urlopen(public+'?'+urllib.parse.urlencode({'key':key}),timeout=25) as response:
            data=response.read(20*1024*1024+1)
        if len(data)>20*1024*1024: raise ValueError('size limit')
        parsed=json.loads(data)
        if key.encode() in data: raise ValueError('credential reflected; refuse persistence')
        if not isinstance(parsed,list) or len(parsed)!=1: raise ValueError('unexpected document envelope')
        doc=parsed[0]
        if doc.get('code')!=code or not str(doc.get('version','')).isdigit() or not doc.get('list'): raise ValueError('document identity missing')
        if any(not isinstance(row.get('contents'),str) for row in doc['list']): raise ValueError('clause contents missing')
        filename='KDS-'+code+'-official.json'; (folder/filename).write_bytes(data)
        records.append({'code':code,'source':public,'file':filename,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'retrievedAt':datetime.now(timezone.utc).isoformat()})
        print(json.dumps({'code':code,'bytes':len(data),'edition':doc['version'],'updated':doc.get('updateDate')}),flush=True)
    except Exception as error:
        print(json.dumps({'code':code,'errorType':type(error).__name__}),flush=True)
        raise SystemExit(1)
(folder/'retrieval-manifest.json').write_text(json.dumps({'credentialStored':False,'records':records},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
