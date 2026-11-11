#!/usr/bin/env python3
"""Serve the web site for development, collect the game's telemetry, and
relay commands to open game pages.

    python3 web/serve.py [port] [directory] [--relay /PREFIX=PORT ...]

Serves `directory` (default .build/web) on all interfaces at `port` (default
8765), like `python3 -m http.server`. A POST of JSON to /telemetry is
appended, one object per line with the client's address, to telemetry.jsonl
in the directory's parent (.build/telemetry.jsonl by default).

Remote control (see web/control.py): a POST of a JSON command to /control
queues it; game pages poll GET /control?after=ID&session=S&ua=U for newer
commands, run them, and post their results to /telemetry. GET /clients lists
the pages that polled recently. A capture command's frames arrive as POSTs
to /capture and are saved as captures/ID/INDEX-MSms.jpg beside the log. Anyone who can reach the server can run
code in those pages, so serve it only on a private network.

--relay /PREFIX=PORT passes every request under /PREFIX, WebSockets too, on
to a server on this machine at PORT, the prefix taken off: so that a page
and a Worker run here (`npx wrangler dev`) can be tried from a phone through
the HTTPS that fronts this server (as `tailscale serve` does), where a
plain ws:// or http:// address would be refused.
"""
import base64
import functools
import http.server
import json
import os
import selectors
import socket
import sys
import threading
import time
import urllib.parse

MAX_BODY = 256 * 1024
MAX_CAPTURE = 4 * 1024 * 1024


COMMANDS = []  # (id, command), newest last
CLIENTS = {}  # session -> {"ua", "client", "seen", "url"}
LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    log_path = ""
    relays = {}  # "/prefix" -> port

    def relay_port(self):
        path = urllib.parse.urlsplit(self.path).path
        for prefix, port in self.relays.items():
            if path == prefix or path.startswith(prefix + "/"):
                return prefix, port
        return None

    def relay(self, prefix, port):
        """Pass this request on to the server at port, and its answer back,
        byte for byte until either side closes (a WebSocket's frames as well
        as an ordinary answer)."""
        try:
            upstream = socket.create_connection(("127.0.0.1", port))
        except OSError:
            self.send_error(502, f"nothing on port {port}")
            return
        upgrade = self.headers.get("Upgrade", "").lower() == "websocket"
        lines = [f"{self.command} {self.path[len(prefix):] or '/'} HTTP/1.1"]
        for name, value in self.headers.items():
            if name.lower() in ("host", "connection") or (name.lower() == "upgrade" and not upgrade):
                continue
            lines.append(f"{name}: {value}")
        lines.append(f"Host: 127.0.0.1:{port}")
        lines.append("Connection: Upgrade" if upgrade else "Connection: close")
        upstream.sendall(("\r\n".join(lines) + "\r\n\r\n").encode("latin-1"))
        length = int(self.headers.get("Content-Length") or 0)
        if length > 0:
            upstream.sendall(self.rfile.read(length))
        self.wfile.flush()
        client = self.connection
        pipes = selectors.DefaultSelector()
        pipes.register(client, selectors.EVENT_READ, upstream)
        pipes.register(upstream, selectors.EVENT_READ, client)
        try:
            open_ends = 2
            while open_ends == 2:
                for key, _ in pipes.select():
                    data = key.fileobj.recv(65536)
                    if not data:
                        open_ends = 1
                        break
                    key.data.sendall(data)
        except OSError:
            pass
        finally:
            pipes.close()
            upstream.close()
            self.close_connection = True

    def do_OPTIONS(self):
        relayed = self.relay_port()
        if relayed:
            self.relay(*relayed)
            return
        self.send_error(405)

    def send_json(self, value, status=200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        relayed = self.relay_port()
        if relayed:
            self.relay(*relayed)
            return
        url = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(url.query)
        if url.path == "/control":
            after = int(query.get("after", ["-1"])[0])
            session = query.get("session", [""])[0]
            with LOCK:
                if session:
                    CLIENTS[session] = {
                        "ua": query.get("ua", [""])[0],
                        "url": query.get("url", [""])[0],
                        "client": self.client_address[0],
                        "seen": time.time(),
                    }
                latest = COMMANDS[-1][0] if COMMANDS else 0
                newer = [c for i, c in COMMANDS if i > after] if after >= 0 else []
            self.send_json({"latest": latest, "commands": newer})
            return
        if url.path == "/clients":
            now = time.time()
            with LOCK:
                live = {k: dict(v, age=round(now - v["seen"], 1)) for k, v in CLIENTS.items() if now - v["seen"] < 30}
            self.send_json(live)
            return
        super().do_GET()

    def do_POST(self):
        relayed = self.relay_port()
        if relayed:
            self.relay(*relayed)
            return
        if self.path == "/control":
            length = int(self.headers.get("Content-Length") or 0)
            try:
                command = json.loads(self.rfile.read(length)) if 0 < length <= MAX_BODY else None
            except ValueError:
                command = None
            if not isinstance(command, dict) or "cmd" not in command:
                self.send_error(400)
                return
            with LOCK:
                command["id"] = (COMMANDS[-1][0] if COMMANDS else 0) + 1
                COMMANDS.append((command["id"], command))
                del COMMANDS[:-100]
            self.send_json({"id": command["id"]})
            return
        if self.path == "/capture":
            length = int(self.headers.get("Content-Length") or 0)
            try:
                frame = json.loads(self.rfile.read(length)) if 0 < length <= MAX_CAPTURE else None
                data = frame["data"].split(",", 1)[1]
                image = base64.b64decode(data)
                folder = os.path.join(os.path.dirname(self.log_path), "captures", str(int(frame["id"])))
                os.makedirs(folder, exist_ok=True)
                name = f'{int(frame["index"]):03d}-{int(frame["ms"]):05d}ms.jpg'
                with open(os.path.join(folder, name), "wb") as out:
                    out.write(image)
            except (ValueError, KeyError, TypeError, IndexError):
                self.send_error(400)
                return
            self.send_response(204)
            self.end_headers()
            return
        if self.path != "/telemetry":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            self.send_error(413)
            return
        try:
            record = json.loads(self.rfile.read(length))
        except ValueError:
            self.send_error(400)
            return
        if not isinstance(record, dict):
            self.send_error(400)
            return
        record["client"] = self.client_address[0]
        record["received"] = time.time()
        with open(self.log_path, "a") as log:
            log.write(json.dumps(record) + "\n")
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        # Always fetch the latest build.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    args = sys.argv[1:]
    while "--relay" in args:
        at = args.index("--relay")
        prefix, port = args[at + 1].split("=")
        Handler.relays["/" + prefix.strip("/")] = int(port)
        del args[at : at + 2]
    port = int(args[0]) if len(args) > 0 else 8765
    root = os.path.abspath(args[1] if len(args) > 1 else ".build/web")
    Handler.log_path = os.path.join(os.path.dirname(root), "telemetry.jsonl")
    handler = functools.partial(Handler, directory=root)
    server = http.server.ThreadingHTTPServer(("", port), handler)
    print(f"serving {root} on port {port}; telemetry to {Handler.log_path}", flush=True)
    for prefix, to in Handler.relays.items():
        print(f"relaying {prefix} to port {to}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
