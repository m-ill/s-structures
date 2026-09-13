"""Checks canonical archive bytes before writing a Pages package."""
import hashlib
import json
import posixpath
import re
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit


class PageAssets(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []
        self.scripts = []
        self.in_script = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script':
            self.in_script = True
        if tag in {'script', 'img', 'iframe', 'source', 'audio', 'video'}:
            if attrs.get('src'):
                self.references.append(attrs['src'])
        if tag == 'video' and attrs.get('poster'):
            self.references.append(attrs['poster'])
        if tag == 'link' and set(attrs.get('rel', '').lower().split()) & {
                'stylesheet', 'icon', 'preload', 'modulepreload'}:
            if attrs.get('href'):
                self.references.append(attrs['href'])

    def handle_endtag(self, tag):
        if tag == 'script':
            self.in_script = False

    def handle_data(self, data):
        if self.in_script:
            self.scripts.append(data)


def validate_html_dependencies(files):
    missing = set()
    inline = {}
    for name, data in files.items():
        if not name.endswith('.html'):
            continue
        page = PageAssets()
        page.feed(data.decode('utf-8-sig'))
        for reference in page.references:
            url = urlsplit(reference)
            if url.scheme or url.netloc or not url.path:
                continue
            path = unquote(url.path)
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), path))
            if target not in files:
                missing.add(f'{name} -> {target}')
        # The synthetic suffix preserves the containing document's directory.
        inline[name + '.inline.mjs'] = '\n'.join(page.scripts).encode('utf-8')
    if missing:
        raise ValueError('PAGES_HTML_DEPENDENCY_MISSING: ' + ', '.join(sorted(missing)))
    validate_literal_dependencies({**files, **inline})


# Literal module and import.meta.url references are resolved from the archive,
# not the local worktree. This also covers worker entrypoints and font assets.
LITERAL_REFERENCES = re.compile(
    r'''\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?["']([^"']+)["']'''
    r'''|\bimport\s*\(\s*["']([^"']+)["']\s*\)'''
    r'''|\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)'''
)


def validate_literal_dependencies(files):
    missing = set()
    for name, data in files.items():
        if not name.endswith(('.js', '.mjs')):
            continue
        for match in LITERAL_REFERENCES.finditer(data.decode('utf-8-sig')):
            reference = next(value for value in match.groups() if value is not None)
            if not reference.startswith(('./', '../')):
                continue
            path = reference.split('#', 1)[0].split('?', 1)[0]
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), path))
            if target not in files:
                missing.add(f'{name} -> {target}')
    if missing:
        raise ValueError('PAGES_LITERAL_DEPENDENCY_MISSING: ' + ', '.join(sorted(missing)))

PHASE25_REQUIRED = frozenset({
    'src/ui/webmcp/practicalTools.js',
    'src/ui/webmcp/schemas.js',
    'src/modeling/practicalInputContract.js',
    'src/compute/product/practicalWorkflowService.js',
    'src/compute/product/candidateAnalysisWorker.js',
    'src/compute/product/elasticReviewWorker.js',
    'src/design/evaluation/practicalEvaluation.js',
    'src/metadata/practicalRuleImplementations.js',
    'src/report/phase24/drawingExportService.js',
    'src/report/phase24/drawingWorker.js',
    'src/report/phase24/vectorPdf.js',
    'assets/fonts/phase24/SStructuresSans.ttf',
    'assets/fonts/phase24/OFL.txt',
    'assets/fonts/phase24/provenance.json',
})


def validate_pages_assets(files):
    missing = sorted(PHASE25_REQUIRED - files.keys())
    if missing:
        raise ValueError('PAGES_PRACTICAL_ASSETS_MISSING: ' + ', '.join(missing))
    font = files['assets/fonts/phase24/SStructuresSans.ttf']
    provenance = json.loads(files['assets/fonts/phase24/provenance.json'])
    if hashlib.sha256(font).hexdigest() != provenance.get('artifactSha256'):
        raise ValueError('PAGES_FONT_HASH_MISMATCH')
    if len(font) != provenance.get('bytes') or not 0 < len(font) <= 8 * 1024 * 1024:
        raise ValueError('PAGES_FONT_SIZE_MISMATCH')
    if not files['assets/fonts/phase24/OFL.txt'].strip():
        raise ValueError('PAGES_FONT_LICENSE_REQUIRED')
    validate_html_dependencies(files)
