#!/usr/bin/env python3
"""Serve the web site for development, collect the game's telemetry, and
relay commands to open game pages.

    python3 web/serve.py [port] [directory]

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
"""
import base64
import functools
import http.server
import json
import os
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

    def send_json(self, value, status=200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
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
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    root = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else ".build/web")
    Handler.log_path = os.path.join(os.path.dirname(root), "telemetry.jsonl")
    handler = functools.partial(Handler, directory=root)
    server = http.server.ThreadingHTTPServer(("", port), handler)
    print(f"serving {root} on port {port}; telemetry to {Handler.log_path}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
