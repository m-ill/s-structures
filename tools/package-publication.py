"""Build new, immutable publication candidates from a committed source tree.
Usage: python tools/package-publication.py OUTPUT_DIRECTORY [EVIDENCE_DIRECTORY]
No .git history, runtime state, third-party source documents or old report exports.
"""
import hashlib
import json
import pathlib
import subprocess
import sys
import zipfile
from datetime import datetime, timezone

root = pathlib.Path.cwd()
out = pathlib.Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=False)
def git(*args):
    return subprocess.check_output(['git', '-c', 'safe.directory=' + root.as_posix(), *args], cwd=root)
def digest(data):
    return hashlib.sha256(data).hexdigest()
if git('status', '--porcelain', '--untracked-files=no').strip():
    raise SystemExit('Commit tracked changes before packaging.')
identity = {'commit': git('rev-parse', 'HEAD').decode().strip(), 'tree': git('rev-parse', 'HEAD^{tree}').decode().strip(), 'trackedChanges': ''}
files = git('ls-files', '-z').decode().split('\0')
allowed = {'src', 'server', 'desktop', 'native', 'tests', 'tools', 'docs', 'verification', 'samples', '.github'}
extensions = {'.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.html', '.css', '.wasm', '.csv', '.yml', '.yaml', '.py', '.ps1', '.bat', '.svg', '.toml', '.rs', '.c', '.h', '.cpp'}
excluded = []
source = {}
for name in sorted(filter(None, files)):
    p = pathlib.PurePosixPath(name)
    reason = None
    if len(p.parts) > 1 and p.parts[0] not in allowed: reason = 'not-in-source-allowlist'
    elif any(x in p.parts for x in ('.git', 'node_modules', '__pycache__', 'data', 'secrets', 'tmp')): reason = 'runtime-or-private'
    elif '/references/' in name and p.suffix not in {'.json', '.md'}: reason = 'third-party-source'
    elif p.suffix.lower() not in extensions and name not in {'.gitignore', '.gitattributes'}: reason = 'binary-or-unreviewed-format'
    if reason:
        excluded.append({'path': name, 'reason': reason})
    else:
        source[name] = (root / name).read_bytes()
source['SOURCE-IDENTITY.json'] = (json.dumps(identity, indent=2) + '\n').encode()
runtime = {k: v for k, v in source.items() if k.startswith(('src/', 'server/', 'docs/user-manual/')) or k in {'index.html', 'app.html', 'm3.html', 'help.html', 'manual.html', 'guide.html', 'package.json', 'README.md', 'LICENSE.txt', 'config.sample.json', 'SOURCE-IDENTITY.json', 'docs/WEBMCP.md'}}
def archive(label, content):
    manifest = {'schema': 'sstructures-package-v1', 'source': identity, 'profile': label, 'files': [{'path': p, 'bytes': len(b), 'sha256': digest(b)} for p, b in sorted(content.items())]}
    content = dict(content)
    content['PACKAGE-MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    target = out / ('s-structures-' + label + '.zip')
    with zipfile.ZipFile(target, 'x', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in sorted(content.items()):
            info = zipfile.ZipInfo(name, (2000, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
    with zipfile.ZipFile(target) as z:
        assert z.testzip() is None
        for record in manifest['files']:
            assert digest(z.read(record['path'])) == record['sha256']
    return {'file': target.name, 'bytes': target.stat().st_size, 'sha256': digest(target.read_bytes()), 'fileCount': len(content)}
archives = [archive('source', source), archive('runtime', runtime)]
if len(sys.argv) > 2:
    evidence_root = pathlib.Path(sys.argv[2]).resolve()
    evidence = {p.relative_to(evidence_root).as_posix(): p.read_bytes() for p in evidence_root.rglob('*') if p.is_file()}
    validation = json.loads(evidence['validation.json'])
    if validation['source']['commit'] != identity['commit'] or validation['failed']:
        raise SystemExit('Evidence must pass and match the source commit.')
    archives.append(archive('evidence', evidence))
report = {'builtAt': datetime.now(timezone.utc).isoformat(), 'source': identity, 'archives': archives, 'excluded': excluded,
          'externalQualification': 'NOT_CLAIMED', 'historyIncluded': False, 'publication': 'local-candidate-not-uploaded'}
(out / 'publication.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
(out / 'SHA256SUMS.txt').write_text(''.join(f"{a['sha256']}  {a['file']}\n" for a in archives), encoding='utf-8')
print(json.dumps({'source': identity, 'archives': archives, 'excludedCount': len(excluded)}, indent=2))
