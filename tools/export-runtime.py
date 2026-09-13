"""Export a relocatable local runtime, including uncommitted source identity.

Usage: python tools/export-runtime.py NEW_OUTPUT_DIRECTORY
Release publication still uses package-publication.py from a committed tree.
No runtime user data or secrets are copied. Node.js is required on the host.
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
target = pathlib.Path(sys.argv[1]).resolve()
if target == root or root in target.parents:
    raise SystemExit('Choose a new directory outside the source repository.')
target.mkdir(parents=True, exist_ok=False)
roots = ['src', 'server', 'assets/fonts/phase24', 'docs/user-manual']
files = ['index.html', 'app.html', 'm3.html', 'help.html', 'manual.html', 'guide.html', 'LICENSE.txt',
         'tools/backup-data.mjs', 'tools/restore-data.mjs', 'tools/migrate-state.mjs']
for name in roots:
    files.extend(p.relative_to(root).as_posix() for p in (root / name).rglob('*') if p.is_file())
records = []
def write(name, data):
    path = target / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    records.append({'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
for name in sorted(files):
    if (root / name).is_symlink():
        raise SystemExit('Unexpected symlink: ' + name)
    write(name, (root / name).read_bytes())
package = json.loads((root / 'package.json').read_text(encoding='utf8'))
package['scripts'] = {'start': 'node server/main.mjs 5173', 'dev': 'node server/main.mjs 5173'}
write('package.json', (json.dumps(package, indent=2) + '\n').encode())
write('Start-S-Structures.cmd', b'@echo off\r\ncd /d "%~dp0"\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (echo Node.js is required. & pause & exit /b 1)\r\necho Open http://127.0.0.1:5173/ in your browser.\r\nnode server/main.mjs 5173\r\npause\r\n')
write('README.md', '''# S-Structures 실행 폴더

Node.js가 설치된 컴퓨터에서 `Start-S-Structures.cmd`를 실행하거나 이 폴더에서 `npm start`를 실행합니다.
브라우저 주소: http://127.0.0.1:5173/
배포 사이트: https://m-ill.github.io/s-structures/

이 폴더 전체를 복사해 사용할 수 있습니다. 개발 이력·테스트·과거 보고서·사용자 데이터는 포함하지 않습니다.
Windows 기본 데이터는 %LOCALAPPDATA%/S-Structures/data, 비밀정보는 인접 secrets 폴더에 저장됩니다.
브라우저 자동저장은 주소별로 분리됩니다. 다른 컴퓨터로 옮길 때 프로젝트를 별도로 내보내고 가져오십시오.
기존 기본 서버가 실행 중이면 먼저 정상 종료하십시오. 동일 데이터 디렉터리를 동시에 열 수 없습니다.
백업 도구에는 실제 --dataDir 경로를 명시해야 하며 별도 secrets 폴더의 보존도 필요합니다.
GPU·폴더 선택·WebMCP는 브라우저와 장치 지원에 따라 달라집니다. AI 앱이 자동 실행되는 것은 아닙니다.

PACKAGE-MANIFEST.json에 실제 파일 해시와 기준 커밋, 미커밋 변경 여부를 기록했습니다.
이 패키지는 로컬 검증용이며 정식 배포 승인이나 구조설계 적합성을 의미하지 않습니다.
'''.encode())
def git(*args):
    return subprocess.check_output(['git', '-c', 'safe.directory=' + root.as_posix(), *args], cwd=root).decode().strip()
manifest = {'profile': 'local-working-runtime', 'baseCommit': git('rev-parse', 'HEAD'),
            'workingTreeChanged': bool(git('status', '--porcelain', '--untracked-files=no')),
            'files': records, 'externalQualification': 'NOT_CLAIMED'}
(target / 'PACKAGE-MANIFEST.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
for row in records:
    assert hashlib.sha256((target / row['path']).read_bytes()).hexdigest() == row['sha256']
print(json.dumps({'target': str(target), 'files': len(records), 'bytes': sum(r['bytes'] for r in records)}))
