import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=`
import sys, hashlib, json
from pathlib import Path
sys.path.insert(0, 'tools')
from pages_asset_validation import validate_pages_assets, PHASE25_REQUIRED
files={p.as_posix():p.read_bytes() for p in Path('src').rglob('*') if p.is_file()}
files.update({name:Path(name).read_bytes() for name in PHASE25_REQUIRED})
files.update({name:Path(name).read_bytes() for name in ['index.html','app.html','m3.html','help.html','manual.html','guide.html']})
validate_pages_assets(files)
for name in PHASE25_REQUIRED:
    broken=dict(files);del broken[name]
    try: validate_pages_assets(broken)
    except ValueError: pass
    else: raise AssertionError('missing entry accepted: '+name)
dependency='src/design/connection/jointThroughBars.js'
broken=dict(files);del broken[dependency]
try: validate_pages_assets(broken)
except ValueError as e: assert 'DEPENDENCY' in str(e) and dependency in str(e)
else: raise AssertionError('missing transitive module accepted')
for reference in ["import './missing.js';","export {x} from './missing.js';","const w=new URL('./missing.js',import.meta.url);","const p=import('./missing.js');"]:
    broken=dict(files);broken['src/probe.js']=reference.encode()
    try: validate_pages_assets(broken)
    except ValueError as e: assert 'DEPENDENCY' in str(e)
    else: raise AssertionError('missing dependency accepted: '+reference)
for markup in ['<script src="./missing.js?v=1#x"></script>', '<link rel="stylesheet" href="missing.css">', '<img src="missing.svg">', '<script type="module">import "./missing.js";</script>']:
    broken=dict(files);broken['probe.html']=markup.encode()
    try: validate_pages_assets(broken)
    except ValueError as e: assert 'DEPENDENCY' in str(e)
    else: raise AssertionError('missing HTML asset accepted: '+markup)
valid=dict(files);valid['probe.html']=b'<script src="./src/ui/indexBridge.js?v=1#x"></script><img src="data:image/png;base64,AA=="><link rel="stylesheet" href="https://example.org/a.css"><a href="unpackaged-navigation.html">link</a>'
validate_pages_assets(valid)
font='assets/fonts/phase24/SStructuresSans.ttf'
broken=dict(files);broken[font]=files[font][:-1]+bytes([files[font][-1]^1])
try: validate_pages_assets(broken)
except ValueError as e: assert 'HASH' in str(e)
else: raise AssertionError('modified font accepted')
print(json.dumps({'toolHashes':{name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in ['tools/build-pages.py','tools/pages_asset_validation.py']}}))
print('PASS current worktree critical Pages assets, missing entries and font provenance integrity')
`;
const result=spawnSync('python',['-X','utf8','-c',script],{encoding:'utf8'});process.stdout.write(result.stdout);process.stderr.write(result.stderr);assert.equal(result.status,0);
