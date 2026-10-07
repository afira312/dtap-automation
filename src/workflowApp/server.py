#!/usr/bin/env python3
"""
IAM Workflow Manager — local development server.

Serves the static app files and provides a REST API for workflow file
management (workflows/, imports/, exports/ sub-directories).

A workflow is identified by its *filename* on disk, because the filename is
what actually travels between environments when a workflow is exported from
dev and imported into prod.

Usage:
    python server.py [port]      (default: 5173)

Environment:
    WF_ENV   label shown in the page header, e.g. DEV or PROD (default: LOCAL)
"""

import http.server
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse, unquote

BASE_DIR      = Path(__file__).parent.resolve()
WORKFLOWS_DIR = BASE_DIR / 'workflows'
IMPORTS_DIR   = BASE_DIR / 'imports'
EXPORTS_DIR   = BASE_DIR / 'exports'
_NS           = 'urn:ibm:iam:workflow'
ENV_LABEL     = os.environ.get('WF_ENV', 'LOCAL')

for _d in (WORKFLOWS_DIR, IMPORTS_DIR, EXPORTS_DIR):
    _d.mkdir(exist_ok=True)


def _safe(s: str) -> str:
    """Sanitise a string so it is safe to use as a filename stem."""
    return re.sub(r'[^A-Za-z0-9_\-]', '_', str(s)) or 'workflow'


def _stem(filename: str) -> str:
    """Strip a trailing .xml extension before calling _safe."""
    base = filename[:-4] if filename.lower().endswith('.xml') else filename
    return _safe(base)


def _slug(s: str) -> str:
    """Turn a workflow name into a readable lower_snake_case filename stem."""
    return re.sub(r'[^a-z0-9]+', '_', str(s).lower()).strip('_') or 'workflow'


def _target_stem(d: dict) -> str:
    """
    Resolve the destination filename stem for a save/export request.

    An explicit filename wins, so editing or promoting a workflow writes back
    to the file it came from instead of creating a second copy. New workflows
    fall back to a slug of their name, then to their id.
    """
    if d.get('filename'):
        return _stem(d['filename'])
    if d.get('name'):
        return _slug(d['name'])
    return _safe(d.get('id', 'workflow'))


def _parse_meta(xml_text: str) -> dict:
    """Return a dict of metadata fields extracted from workflow XML."""
    fields = ('Id', 'Name', 'Organization', 'BusinessUnit', 'Priority',
              'Description', 'Owner', 'Version', 'CreatedDate')
    result = {f[0].lower() + f[1:]: '' for f in fields}
    try:
        root = ET.fromstring(xml_text)

        def get(tag):
            for path in (f'{{{_NS}}}Metadata/{{{_NS}}}{tag}',
                         f'Metadata/{tag}'):
                el = root.find(path)
                if el is not None:
                    return (el.text or '').strip()
            return ''

        for field in fields:
            key = field[0].lower() + field[1:]
            result[key] = get(field)
    except ET.ParseError:
        pass
    return result


class _Handler(http.server.SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    # ── routing ───────────────────────────────────────────────

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/api/info':
            self._json(200, {'env': ENV_LABEL})
        elif path == '/api/workflows':
            self._list_workflows()
        elif re.fullmatch(r'/api/workflows/[^/]+', path):
            self._get_workflow(unquote(path.rsplit('/', 1)[-1]))
        else:
            super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        if path == '/api/workflows':
            self._save_workflow(body)
        elif path == '/api/imports':
            self._save_import(body)
        elif path == '/api/exports':
            self._save_export(body)
        else:
            self._json(404, {'error': 'Not found'})

    # ── GET handlers ──────────────────────────────────────────

    def _list_workflows(self):
        rows = []
        for f in sorted(WORKFLOWS_DIR.glob('*.xml'),
                        key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                meta = _parse_meta(f.read_text(encoding='utf-8'))
                meta['filename'] = f.name
                rows.append(meta)
            except OSError:
                pass
        self._json(200, rows)

    def _get_workflow(self, ref):
        """Look a workflow up by filename (with or without the .xml suffix)."""
        p = WORKFLOWS_DIR / (_stem(ref) + '.xml')
        if not p.exists():
            self._json(404, {'error': 'Workflow not found'})
            return
        self._xml(p.read_bytes())

    # ── POST handlers ─────────────────────────────────────────

    def _save_workflow(self, body):
        self._write_to(WORKFLOWS_DIR, body)

    def _save_export(self, body):
        self._write_to(EXPORTS_DIR, body)

    def _save_import(self, body):
        """Store the uploaded file verbatim, keeping its original filename."""
        try:
            d     = json.loads(body)
            fname = _stem(d.get('filename', 'import')) + '.xml'
            (IMPORTS_DIR / fname).write_text(d.get('xml', ''), encoding='utf-8')
            self._json(200, {'ok': True, 'filename': fname})
        except Exception as e:
            self._json(500, {'error': str(e)})

    def _write_to(self, directory: Path, body):
        try:
            d     = json.loads(body)
            fname = _target_stem(d) + '.xml'
            (directory / fname).write_text(d.get('xml', ''), encoding='utf-8')
            self._json(200, {'ok': True, 'filename': fname})
        except Exception as e:
            self._json(500, {'error': str(e)})

    # ── response helpers ──────────────────────────────────────

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _xml(self, data: bytes):
        self.send_response(200)
        self.send_header('Content-Type', 'application/xml; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        print(f'  {fmt % args}')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    with http.server.ThreadingHTTPServer(('', port), _Handler) as srv:
        print(f'\n  IAM Workflow Manager [{ENV_LABEL}]  ->  http://localhost:{port}\n')
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print('\n  Server stopped.')
