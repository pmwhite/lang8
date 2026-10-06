#!/usr/bin/env python3
"""Drive open game pages through web/serve.py's remote control.

    python3 web/control.py clients
    python3 web/control.py reload [QUERY] [--target T]
    python3 web/control.py probe [--target T]
    python3 web/control.py set '{"scale": 0.5, "view": true}' [--target T]
    python3 web/control.py keys '[[2, 65363, 900], [3, 65363]]' [--target T]
    python3 web/control.py report [--target T]
    python3 web/control.py eval 'return devicePixelRatio' [--target T]

Each command waits up to --wait seconds (default 15) for its results in the
telemetry log and prints them. --target picks pages whose user agent or
session contains it, such as iPhone.
"""
import argparse
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def request(server, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(server + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def main():
    p = argparse.ArgumentParser()
    p.add_argument("cmd")
    p.add_argument("arg", nargs="?")
    p.add_argument("--target")
    p.add_argument("--server", default="http://localhost:8765")
    p.add_argument("--wait", type=float, default=15)
    p.add_argument("--log", default=os.path.join(ROOT, ".build", "telemetry.jsonl"))
    a = p.parse_args()
    if a.cmd == "clients":
        print(json.dumps(request(a.server, "/clients"), indent=2))
        return
    command = {"cmd": a.cmd}
    if a.cmd == "reload" and a.arg is not None:
        command["query"] = a.arg
    elif a.cmd == "set":
        command.update(json.loads(a.arg))
    elif a.cmd == "keys":
        command["keys"] = json.loads(a.arg)
    elif a.cmd == "eval":
        command["code"] = a.arg
    if a.target:
        command["target"] = a.target
    # Wait for each live page the command reaches.
    clients = request(a.server, "/clients")
    expected = sum(1 for k, v in clients.items() if not a.target or a.target in v["ua"] or a.target in k)
    start = os.path.getsize(a.log) if os.path.exists(a.log) else 0
    ident = request(a.server, "/control", command)["id"]
    print(f"command {ident} queued", file=sys.stderr)
    deadline = time.time() + a.wait
    seen = 0
    while time.time() < deadline and (expected == 0 or seen < expected):
        time.sleep(0.5)
        with open(a.log) as log:
            log.seek(start)
            for line in log:
                record = json.loads(line)
                if record.get("kind") == "control" and record.get("id") == ident:
                    print(json.dumps({k: record.get(k) for k in ("session", "ok", "result", "error")}))
                    seen += 1
            start = log.tell()
    if not seen:
        print("no results", file=sys.stderr)


if __name__ == "__main__":
    main()
