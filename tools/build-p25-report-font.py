"""Extend the licensed report font without removing existing Unicode coverage."""
import copy
import hashlib
import json
from pathlib import Path
import fontTools
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

root = Path(__file__).resolve().parent.parent
directory = root / 'assets/fonts/phase24'
target = directory / 'SStructuresSans.ttf'
source = root / 'output/phase25/fonts/NotoSansKR-source.ttf'
provenance = json.loads((directory / 'provenance.json').read_text(encoding='utf-8'))
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
if source_hash != provenance['sourceSha256']:
    raise ValueError('Official source hash differs from the existing licensed font source')
old = TTFont(target, recalcTimestamp=False)
unicodes = set(old.getBestCmap()) | set(range(0x2460, 0x2500))
font = TTFont(source, recalcTimestamp=False)
available = set(font.getBestCmap())
font = instantiateVariableFont(font, {'wght': 400}, inplace=True)
font['name'].names = copy.deepcopy(old['name'].names)
options = subset.Options()
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=unicodes & available)
subsetter.subset(font)
font.recalcTimestamp = False
font.save(target)
provenance.update(artifactSha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                  bytes=target.stat().st_size, fontTools=fontTools.__version__,
                  modifications='Static wght=400; preserved prior Latin/Hangul/symbol coverage plus available U+2460..U+24FF enclosed alphanumerics; renamed SStructures Sans',
                  buildScript='tools/build-p25-report-font.py')
(directory / 'provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Report font: {target.stat().st_size} bytes; prior coverage retained; enclosed KDS clause numbers added')
