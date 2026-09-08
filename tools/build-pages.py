"""Build a static Pages artifact from canonical committed bytes, never local state.

Usage: python tools/build-pages.py NEW_OUTPUT_DIRECTORY
The Node server and project persistence require the downloadable local runtime.
"""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tarfile

root = Path.cwd()


def git(*args):
    return subprocess.check_output(
        ['git', '-c', 'safe.directory=' + root.as_posix(), *args], cwd=root)


if git('status', '--porcelain', '--untracked-files=no').strip():
    raise SystemExit('Commit tracked changes before building Pages.')
out = Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=False)
identity = {
    'commit': git('rev-parse', 'HEAD').decode().strip(),
    'tree': git('rev-parse', 'HEAD^{tree}').decode().strip(),
    'trackedChanges': '',
}
roots = {'index.html', 'app.html', 'm3.html', 'help.html', 'manual.html', 'guide.html', 'LICENSE.txt'}
extensions = {'.js', '.mjs', '.json', '.html', '.css', '.wasm', '.svg', '.md', '.txt', '.csv'}
files = {}
with tarfile.open(fileobj=io.BytesIO(git('archive', '--format=tar', 'HEAD'))) as archive:
    for item in archive.getmembers():
        path = PurePosixPath(item.name)
        allowed = item.name in roots or item.name.startswith(('src/', 'docs/user-manual/'))
        private = any(p in {'data', 'secrets', 'tmp', 'node_modules', '__pycache__'} for p in path.parts)
        if item.isfile() and allowed and not private and path.suffix.lower() in extensions:
            files[item.name] = archive.extractfile(item).read()
required = {
    'index.html', 'src/ui/indexBridge.js', 'src/ui/webmcp/register.js',
    'src/ui/indexRuntimeAdapter.js', 'src/metadata/numericVersions.js',
    'src/solver/elastic/stages.js', 'src/nonlinear/runtime/analysisWorker.js',
    'src/nonlinear/equilibrium/backends/phase8_solver.wasm',
}
if not required <= files.keys():
    raise SystemExit(f'Missing required browser assets: {sorted(required - files.keys())}')
files['SOURCE-IDENTITY.json'] = (json.dumps(identity, indent=2) + '\n').encode()
files['.nojekyll'] = b''
manifest = {
    'schema': 'sstructures-package-v1', 'profile': 'github-pages-static', 'source': identity,
    'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
              for name, data in sorted(files.items())],
}
files['PACKAGE-MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
for name, data in sorted(files.items()):
    target = out / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
print(json.dumps({'source': identity, 'fileCount': len(files), 'output': str(out)}, indent=2))
