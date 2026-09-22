import http.server, socketserver
http.server.SimpleHTTPRequestHandler.extensions_map.update({".js":"application/javascript"})
PORT=8080
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control","no-store")
        self.send_header("Access-Control-Allow-Origin","*")
        super().end_headers()
print(f"Serving at http://localhost:{PORT}")
with socketserver.TCPServer(("",PORT),H) as httpd:
    httpd.serve_forever()
