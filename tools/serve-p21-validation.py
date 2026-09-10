"""Local validation only: avoid stale module/Worker HTTP caches between candidates."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys

class Handler(SimpleHTTPRequestHandler):
    def send_head(self):
        for name in ('If-Modified-Since', 'If-None-Match'):
            if name in self.headers:
                del self.headers[name]
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
