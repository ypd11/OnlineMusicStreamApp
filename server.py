import http.server,socketserver
PORT=8080
print("http://localhost:8080")
with socketserver.TCPServer(("",PORT),http.server.SimpleHTTPRequestHandler) as httpd: httpd.serve_forever()