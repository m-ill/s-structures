"""Capture KDS 17 10 00 from the public KCSC endpoint.

Phase29 M2 needs it: KDS 41 17 00 4.1.1(1) defers site classification itself to
KDS 17 10 00 4.2.1.2, and that document was never among the phase 24/25
captures. No credential is transmitted; the same public endpoint and the same
identity checks as tools/fetch-p25-public-kcsc.py are used.
"""
import datetime, hashlib, json, pathlib, urllib.request

CODE = '171000'
root = pathlib.Path(__file__).resolve().parents[1]
destination = root / 'verification/evidence/phase29/kcsc'
destination.mkdir(parents=True, exist_ok=True)

url = 'https://kcsc.re.kr/api/standardCode/getCodeDetailInfo.do'
doc_code = f'KDS {CODE[:2]} {CODE[2:4]} {CODE[4:]}'
request = urllib.request.Request(
    url,
    data=json.dumps({'docCode': doc_code}).encode(),
    headers={'Content-Type': 'application/json'},
)
with urllib.request.urlopen(request, timeout=25) as response:
    raw = response.read(20 * 1024 * 1024 + 1)
if len(raw) > 20 * 1024 * 1024:
    raise ValueError('DOCUMENT_SIZE_LIMIT')

body = json.loads(raw)
rows = body.get('result', {}).get('document', [])
if body.get('resultCode') != 0 or not rows or not any(CODE in str(x.get('onto_link_cd', '')) for x in rows):
    raise ValueError('DOCUMENT_IDENTITY_REQUIRED')

filename = f'KDS-{CODE}-public.json'
(destination / filename).write_bytes(raw)
manifest = {
    'credentialStored': False,
    'records': [{
        'code': CODE,
        'docCode': doc_code,
        'source': url,
        'file': filename,
        'sha256': hashlib.sha256(raw).hexdigest(),
        'bytes': len(raw),
        'rows': len(rows),
        'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }],
}
(destination / 'retrieval-manifest.json').write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'code': CODE, 'bytes': len(raw), 'rows': len(rows)}, ensure_ascii=False))
