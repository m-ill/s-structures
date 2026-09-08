import concurrent.futures
import hashlib
import json
from pathlib import Path
import sys
import urllib.request
from datetime import datetime, timezone

expected = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
base = 'https://m-ill.github.io/s-structures/'
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=False)

def fetch(name):
    with urllib.request.urlopen(base + name, timeout=60) as response:
        return response.read(), response.status, response.headers.get('content-type')

identity_bytes, _, _ = fetch('SOURCE-IDENTITY.json')
manifest_bytes, _, _ = fetch('PACKAGE-MANIFEST.json')
(out / 'SOURCE-IDENTITY.json').write_bytes(identity_bytes)
(out / 'PACKAGE-MANIFEST.json').write_bytes(manifest_bytes)
actual = json.loads(manifest_bytes)
assert json.loads(identity_bytes) == expected['source'], 'Deployed source identity differs'
assert actual == expected, 'Deployed manifest differs from local canonical build'

def verify(record):
    try:
        data, status, content_type = fetch(record['path'])
        digest = hashlib.sha256(data).hexdigest()
        return {'path': record['path'], 'status': status, 'bytes': len(data),
                'contentType': content_type, 'sha256': digest,
                'ok': digest == record['sha256'] and len(data) == record['bytes']}
    except Exception as error:
        return {'path': record['path'], 'ok': False, 'error': str(error)}

with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    rows = list(pool.map(verify, expected['files']))
root_bytes, status, content_type = fetch('')
root_digest = hashlib.sha256(root_bytes).hexdigest()
index_record = next(r for r in expected['files'] if r['path'] == 'index.html')
root_result = {'path': '/', 'status': status, 'contentType': content_type,
               'sha256': root_digest, 'ok': root_digest == index_record['sha256']}
report = {'url': base, 'source': expected['source'],
          'verifiedAt': datetime.now(timezone.utc).isoformat(),
          'passed': sum(r['ok'] for r in rows), 'failed': sum(not r['ok'] for r in rows),
          'root': root_result, 'files': rows}
(out / 'http-verification.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2))
assert report['failed'] == 0 and root_result['ok'], 'Public file verification failed'
