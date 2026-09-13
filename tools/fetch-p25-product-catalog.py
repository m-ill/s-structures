"""Read a public manufacturer catalog into an OS temporary file for extraction."""
import hashlib
import json
import tempfile
import urllib.request
import re
from pathlib import Path

url = 'https://www.hyundai-steel.com/common/fileDownload/50086'
request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(request, timeout=25) as response:
    data = response.read(40 * 1024 * 1024 + 1)
if len(data) > 40 * 1024 * 1024:
    raise RuntimeError('PUBLIC_CATALOG_SIZE_LIMIT')
if not data.startswith(b'%PDF'):
    body=data.decode('utf-8')
    print('\n'.join(line[:3000] for line in body.splitlines() if re.search(r'\.pdf|download|fileId|fileSeq|attach|script.*src',line,re.I)))
    raise SystemExit()
with tempfile.NamedTemporaryFile(prefix='p25-public-rebar-', suffix='.pdf', delete=False) as stream:
    stream.write(data)
    path = stream.name
print(json.dumps({'url': url, 'path': str(Path(path).resolve()), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}))
