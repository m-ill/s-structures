"""Capture fixed public KCSC documents without transmitting credentials."""
import datetime, hashlib, json, pathlib, urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
destination = root / 'verification/evidence/phase25/kcsc/detail-sources-20260911'
destination.mkdir(parents=True, exist_ok=True)
url = 'https://kcsc.re.kr/api/standardCode/getCodeDetailInfo.do'
manifest = []
for code in ['142001', '142040']:
    doc_code = f'KDS {code[:2]} {code[2:4]} {code[4:]}'
    request = urllib.request.Request(url, data=json.dumps({'docCode': doc_code}).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read(20 * 1024 * 1024 + 1)
    if len(raw) > 20 * 1024 * 1024:
        raise ValueError('DOCUMENT_SIZE_LIMIT')
    body = json.loads(raw)
    rows = body.get('result', {}).get('document', [])
    if body.get('resultCode') != 0 or not rows or not any(code in str(x.get('onto_link_cd', '')) for x in rows):
        raise ValueError('DOCUMENT_IDENTITY_REQUIRED')
    (destination / f'KDS-{code}-public.json').write_bytes(raw)
    manifest.append({'code': doc_code, 'url': url, 'request': {'docCode': doc_code}, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'credentialUsed': False, 'editionStatus': 'METADATA_REVIEW_REQUIRED'})
    print(code, len(rows), len(raw), list(body['result'].keys()))
(destination / 'public-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
