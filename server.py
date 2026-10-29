#!/usr/bin/env python3
"""Local-only catalogue, media gateway and durable reviews. Standard library only."""
import argparse
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent
DEFAULT_LIBRARY = Path.home() / 'Yandex.Disk.localized/models/opensourceavatars'

class Catalog:
    def __init__(self, library, data):
        self.library = Path(library).resolve()
        self.data = Path(data).resolve()
        self.data.mkdir(parents=True, exist_ok=True)
        (self.data / 'renders').mkdir(exist_ok=True)
        self.db = self.data / 'reviews.sqlite3'
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, rating INTEGER NOT NULL DEFAULT 0, liked INTEGER NOT NULL DEFAULT 0, updated TEXT NOT NULL)')
        self.lock = threading.Lock()
        self.refresh()

    def connect(self):
        return sqlite3.connect(self.db, timeout=10)

    def refresh(self):
        manifest = json.loads((self.library / 'manifest.json').read_text())
        items, files = [], {}
        for source in manifest['avatars']:
            item = {k: source.get(k) for k in ('id', 'name', 'author', 'license', 'collection_id', 'collection_name', 'description', 'tags', 'source_url', 'model_file_url', 'format')}
            # Collection prefix avoids collisions between upstream collections.
            item['key'] = source['collection_id'] + ':' + source['id']
            token = hashlib.sha256(item['key'].encode()).hexdigest()[:24]
            item['token'] = token
            directory = (self.library / source['local_dir']).resolve()
            if not directory.is_relative_to(self.library):
                continue
            media = {}
            for kind, names in [('model', ['model.vrm', 'model.glb']), ('thumbnail', ['thumbnail.png', 'thumbnail.webp', 'thumbnail.jpg', 'thumbnail.jpeg']), ('usdz', ['model.usdz'])]:
                for name in names:
                    path = directory / name
                    if path.is_file() and path.resolve().is_relative_to(self.library):
                        media[kind] = path
                        break
            model = media.get('model')
            item['local'] = bool(model)
            item['bytes'] = model.stat().st_size if model else 0
            item['model'] = f'/media/{token}/model' if model else None
            item['thumbnail'] = f'/media/{token}/thumbnail' if 'thumbnail' in media else None
            item['usdz'] = f'/media/{token}/usdz' if 'usdz' in media else None
            item['render'] = f'/renders/{token}.png' if (self.data / 'renders' / f'{token}.png').exists() else None
            files[token] = media
            items.append(item)
        with self.lock:
            self.items, self.files = items, files
            self.keys = {i['key'] for i in items}
            self.tokens = {i['token'] for i in items}

    def reviews(self):
        with self.connect() as db:
            return {key: {'rating': rating, 'liked': bool(liked), 'updated': updated} for key, rating, liked, updated in db.execute('SELECT id,rating,liked,updated FROM reviews')}

    def save_review(self, key, patch):
        if key not in self.keys:
            raise ValueError('Unknown asset')
        if not isinstance(patch, dict) or not patch or set(patch) - {'rating', 'liked'}:
            raise ValueError('Expected rating and/or liked')
        if 'rating' in patch and (type(patch['rating']) is not int or not 0 <= patch['rating'] <= 5):
            raise ValueError('Rating must be an integer from 0 to 5')
        if 'liked' in patch and type(patch['liked']) is not bool:
            raise ValueError('Liked must be a boolean')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT rating,liked FROM reviews WHERE id=?', (key,)).fetchone() or (0, 0)
            db.execute("INSERT INTO reviews VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(id) DO UPDATE SET rating=excluded.rating,liked=excluded.liked,updated=excluded.updated", (key, patch.get('rating', old[0]), int(patch.get('liked', old[1]))))
        return self.reviews()[key]


def make_server(library, data, port=4178):
    catalog = Catalog(library, data)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            if args and str(args[1] if len(args)>1 else '') not in ('200', '206', '304'):
                super().log_message(format, *args)

        def respond(self, code, data, content_type='application/json'):
            body = json.dumps(data, ensure_ascii=False).encode() if content_type == 'application/json' else data
            self.send_response(code)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            if self.command != 'HEAD': self.wfile.write(body)

        def trusted(self):
            host = self.headers.get('Host', '')
            allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            origin = self.headers.get('Origin')
            return host in allowed and (not origin or origin in {f'http://{h}' for h in allowed})

        def send_file(self, path, content_type=None):
            if not path or not path.is_file():
                return self.respond(404, {'error': 'File is not available locally'})
            size = path.stat().st_size
            start, end, status = 0, size - 1, 200
            value = self.headers.get('Range')
            if value:
                try:
                    unit, span = value.split('=')
                    lo, hi = span.split('-')
                    if unit != 'bytes' or ',' in span: raise ValueError()
                    if lo:
                        start = int(lo); end = min(int(hi), size-1) if hi else size-1
                    else:
                        suffix = int(hi)
                        if suffix <= 0: raise ValueError()
                        start = max(0, size-suffix)
                    if start < 0 or start > end or start >= size: raise ValueError()
                    status = 206
                except ValueError:
                    self.send_response(416); self.send_header('Content-Range', f'bytes */{size}'); self.send_header('Content-Length', '0'); self.end_headers(); return
            self.send_response(status)
            self.send_header('Content-Type', content_type or mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
            self.send_header('Content-Length', str(max(0, end-start+1)))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('X-Content-Type-Options', 'nosniff')
            if status == 206: self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
            self.end_headers()
            if self.command == 'HEAD': return
            try:
                with path.open('rb') as f:
                    f.seek(start); left = end-start+1
                    while left > 0:
                        chunk = f.read(min(left, 256*1024))
                        if not chunk: break
                        self.wfile.write(chunk); left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError): pass

        def do_HEAD(self): self.do_GET()

        def do_GET(self):
            if not self.trusted(): return self.respond(403, {'error':'Local origin required'})
            path = unquote(urlsplit(self.path).path)
            if path == '/api/catalog':
                return self.respond(200, {'items': catalog.items, 'reviews': catalog.reviews(), 'library': str(catalog.library)})
            if path == '/api/reviews/export':
                reviews = catalog.reviews()
                return self.respond(200, {'version': 1, 'reviews': reviews, 'credits': [{k:i[k] for k in ('key','name','author','license','collection_name','source_url')} for i in catalog.items if i['key'] in reviews]})
            if path.startswith('/media/'):
                parts = path.split('/')
                if len(parts) != 4: return self.respond(404, {'error':'Not found'})
                return self.send_file(catalog.files.get(parts[2], {}).get(parts[3]))
            if path.startswith('/renders/'):
                name = path.removeprefix('/renders/')
                if name.removesuffix('.png') not in catalog.tokens or not name.endswith('.png'): return self.respond(404, {'error':'Not found'})
                return self.send_file(catalog.data / 'renders' / name, 'image/png')
            if path.startswith('/vendor/'):
                relative = path.removeprefix('/vendor/')
                if not relative.startswith(('three/build/', 'three/examples/jsm/', '@pixiv/three-vrm/lib/')): return self.respond(404, {'error':'Not found'})
                base = ROOT / 'node_modules'
            else:
                relative = 'index.html' if path in ('/', '/hub', '/hub/') else path.lstrip('/')
                base = ROOT / 'public'
            target = (base / relative).resolve()
            if not target.is_relative_to(base.resolve()): return self.respond(403, {'error':'Invalid path'})
            return self.send_file(target)

        def do_POST(self):
            if not self.trusted(): return self.respond(403, {'error':'Local origin required'})
            path = unquote(urlsplit(self.path).path)
            try:
                length = int(self.headers.get('Content-Length', '0'))
                limit = 4*1024*1024 if path.startswith('/api/renders/') else 8192
                if not 0 < length <= limit: return self.respond(413, {'error':'Invalid request size'})
                raw = self.rfile.read(length)
                if path.startswith('/api/reviews/'):
                    if self.headers.get_content_type() != 'application/json': raise ValueError('JSON required')
                    return self.respond(200, catalog.save_review(path.removeprefix('/api/reviews/'), json.loads(raw)))
                if path.startswith('/api/renders/'):
                    token = path.removeprefix('/api/renders/')
                    if token not in catalog.tokens or not raw.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('Invalid render')
                    with catalog.lock:
                        target = catalog.data / 'renders' / f'{token}.png'
                        temporary = target.with_suffix('.tmp')
                        temporary.write_bytes(raw); temporary.replace(target)
                        for item in catalog.items:
                            if item['token'] == token: item['render'] = f'/renders/{token}.png'
                    return self.respond(200, {'url': f'/renders/{token}.png'})
                return self.respond(404, {'error':'Not found'})
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                return self.respond(400, {'error': str(error)})
            except (OSError, sqlite3.Error) as error:
                print(f'Storage error: {error}', flush=True)
                return self.respond(500, {'error':'Could not save to disk'})

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.catalog = catalog
    return server

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path, default=Path(os.environ.get('ASSETS_LIBRARY', DEFAULT_LIBRARY)))
    parser.add_argument('--data', type=Path, default=ROOT / 'data')
    parser.add_argument('--port', type=int, default=4178)
    args = parser.parse_args()
    server = make_server(args.library, args.data, args.port)
    print(f'Asset browser: http://localhost:{server.server_port} · {len(server.catalog.items)} records · {sum(i["local"] for i in server.catalog.items)} local models', flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()
