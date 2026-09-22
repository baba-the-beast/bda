"""
Static SPA Server and Reverse Proxy for Port 3000.
Serves the React frontend bundle with SPA fallback, and seamlessly proxies
any /api/* requests to the backend on port 8000 to prevent 'Unsupported method' errors.
"""

import http.server
import os
import socketserver
import urllib.error
import urllib.request

PORT = 3000
BACKEND_URL = "http://127.0.0.1:8000"
DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))


class SpaProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def proxy_to_backend(self):
        url = f"{BACKEND_URL}{self.path}"
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        req_headers = {k: v for k, v in self.headers.items() if k.lower() not in ["host", "content-length"]}
        req = urllib.request.Request(url, data=body, headers=req_headers, method=self.command)

        try:
            with urllib.request.urlopen(req) as resp:
                self.send_response(resp.status)
                for k, v in resp.headers.items():
                    if k.lower() not in ["transfer-encoding", "content-length"]:
                        self.send_header(k, v)
                data = resp.read()
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            for k, v in e.headers.items():
                if k.lower() not in ["transfer-encoding", "content-length"]:
                    self.send_header(k, v)
            err_data = e.read()
            self.send_header("Content-Length", str(len(err_data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(err_data)
        except Exception as ex:
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(f'{{"error": "{ex!s}"}}'.encode())

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.proxy_to_backend()
        else:
            self.send_error(405, "Method Not Allowed")

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self.proxy_to_backend()
        else:
            self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self.proxy_to_backend()
        else:
            self.send_error(405, "Method Not Allowed")

    def do_GET(self):
        if self.path.startswith("/api/"):
            self.proxy_to_backend()
            return

        # Check if local file exists
        req_path = self.path.split("?")[0].lstrip("/")
        local_path = os.path.join(DIST_DIR, req_path)

        if req_path and os.path.isfile(local_path):
            return super().do_GET()

        # SPA Fallback to index.html
        self.path = "/index.html"
        return super().do_GET()


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), SpaProxyHandler) as httpd:
        print(f"[INFO] Frontend SPA & Proxy Server running on http://0.0.0.0:{PORT}")
        httpd.serve_forever()
