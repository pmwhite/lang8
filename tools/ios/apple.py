#!/usr/bin/env python3
# Signing Tempo for an iPhone through the App Store Connect API, from Linux:
#   apple.py bundle                    register the bundle id
#   apple.py device NAME UDID          register a phone
#   apple.py cert                      a development certificate (key made here)
#   apple.py profile                   a development profile: the app, the
#                                      certificate, and every registered phone
#   apple.py team                      the team id
# Keys and what Apple gives back are kept in ~/.config/tempo-ios (the API
# key there as AuthKey_KEYID.p8, its ids in asc.env as KEY_ID and
# ISSUER_ID); nothing secret is kept in the repository. sign.sh signs the
# app with what this makes.
import base64
import json
import os
import subprocess
import sys
import time

import jwt
import requests

HOME = os.path.expanduser("~/.config/tempo-ios")
API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE = "space.trailingwhite.better"


def env():
    out = {}
    with open(os.path.join(HOME, "asc.env")) as f:
        for line in f:
            if "=" in line:
                k, v = line.strip().split("=", 1)
                out[k] = v
    return out


def token():
    e = env()
    with open(os.path.join(HOME, f"AuthKey_{e['KEY_ID']}.p8")) as f:
        key = f.read()
    now = int(time.time())
    return jwt.encode(
        {"iss": e["ISSUER_ID"], "iat": now, "exp": now + 900, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": e["KEY_ID"], "typ": "JWT"},
    )


def call(method, path, body=None, params=None):
    r = requests.request(
        method,
        API + path,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
        json=body,
        params=params,
        timeout=30,
    )
    if r.status_code >= 400:
        sys.exit(f"{method} {path}: {r.status_code} {r.text}")
    return r.json() if r.text else {}


def bundle_id():
    found = call("GET", "/bundleIds", params={"filter[identifier]": BUNDLE})["data"]
    found = [b for b in found if b["attributes"]["identifier"] == BUNDLE]
    if found:
        return found[0]
    return call("POST", "/bundleIds", {"data": {"type": "bundleIds", "attributes": {
        "identifier": BUNDLE, "name": "Better", "platform": "IOS"}}})["data"]


def save(name, data, mode=0o600):
    path = os.path.join(HOME, name)
    with open(path, "wb") as f:
        f.write(data)
    os.chmod(path, mode)
    return path


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    if what == "bundle":
        b = bundle_id()
        print("bundle id", b["attributes"]["identifier"], "seed", b["attributes"].get("seedId"))
    elif what == "team":
        print(bundle_id()["attributes"].get("seedId"))
    elif what == "device":
        name, udid = sys.argv[2], sys.argv[3]
        found = call("GET", "/devices", params={"filter[udid]": udid})["data"]
        if found:
            print("already registered:", found[0]["attributes"]["name"])
            return
        d = call("POST", "/devices", {"data": {"type": "devices", "attributes": {
            "name": name, "udid": udid, "platform": "IOS"}}})["data"]
        print("registered", d["attributes"]["name"])
    elif what == "cert":
        key = os.path.join(HOME, "dev.key")
        if not os.path.exists(key):
            subprocess.run(["openssl", "genrsa", "-out", key, "2048"], check=True,
                           stderr=subprocess.DEVNULL)
            os.chmod(key, 0o600)
        csr = subprocess.run(["openssl", "req", "-new", "-key", key, "-subj",
                              "/CN=Tempo development/O=lang8"], check=True,
                             capture_output=True, text=True).stdout
        c = call("POST", "/certificates", {"data": {"type": "certificates", "attributes": {
            "certificateType": "DEVELOPMENT", "csrContent": csr}}})["data"]
        save("dev.cer", base64.b64decode(c["attributes"]["certificateContent"]))
        save("dev.cert-id", c["id"].encode())
        print("certificate", c["attributes"]["name"], "until", c["attributes"]["expirationDate"])
    elif what == "profile":
        with open(os.path.join(HOME, "dev.cert-id")) as f:
            cert = f.read().strip()
        devices = [{"type": "devices", "id": d["id"]} for d in
                   call("GET", "/devices", params={"limit": 200})["data"]
                   if d["attributes"]["status"] == "ENABLED"]
        p = call("POST", "/profiles", {"data": {"type": "profiles", "attributes": {
            "name": f"Tempo development {int(time.time())}", "profileType": "IOS_APP_DEVELOPMENT"},
            "relationships": {
                "bundleId": {"data": {"type": "bundleIds", "id": bundle_id()["id"]}},
                "certificates": {"data": [{"type": "certificates", "id": cert}]},
                "devices": {"data": devices}}}})["data"]
        save("dev.mobileprovision", base64.b64decode(p["attributes"]["profileContent"]))
        print("profile", p["attributes"]["name"], "for", len(devices), "phone(s), until",
              p["attributes"]["expirationDate"])
    else:
        sys.exit(__doc__ or open(__file__).read().split("\nimport")[0])


main()
