#!/usr/bin/env python3
"""Serve the web site for development, and collect the game's telemetry.

    python3 web/serve.py [port] [directory]

Serves `directory` (default .build/web) on all interfaces at `port` (default
8765), like `python3 -m http.server`. A POST of JSON to /telemetry is
appended, one object per line with the client's address, to telemetry.jsonl
in the directory's parent (.build/telemetry.jsonl by default).
"""
import functools
import http.server
import json
import os
import sys
import time

MAX_BODY = 256 * 1024


class Handler(http.server.SimpleHTTPRequestHandler):
    log_path = ""

    def do_POST(self):
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
