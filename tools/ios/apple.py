#!/usr/bin/env python3
# Signing Better (programs/better on an iPhone) and sending it to TestFlight
# through the App Store Connect API, from Linux:
#   apple.py bundle                 register the bundle id
#   apple.py device NAME UDID       register a phone (for development)
#   apple.py cert dev|store         a certificate (its key made here)
#   apple.py profile dev|store      a profile: development (the app, its
#                                   certificate, every registered phone), or
#                                   the App Store's (for TestFlight)
#   apple.py upload IPA             send a store-signed IPA to App Store
#                                   Connect, and wait while it is processed
#   apple.py builds                 the latest builds, and how they are
# Keys and what Apple gives back are kept in ~/.config/better-ios (the API
# key there as AuthKey_KEYID.p8, its ids in asc.env as KEY_ID and
# ISSUER_ID); nothing secret is kept in the repository. sign.sh signs the
# app with what this makes. It is Better's unless $APPLE_BUNDLE and
# $APPLE_NAME say another app's (space.trailingwhite.smoothbible, "Smooth
# Bible", for programs/bible); its profiles are kept as
# smoothbible.dev.mobileprovision and so on (the certificates are shared).
import base64
import hashlib
import os
import plistlib
import subprocess
import sys
import time
import zipfile

import jwt
import requests

HOME = os.path.expanduser("~/.config/better-ios")
API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE = os.environ.get("APPLE_BUNDLE", "space.trailingwhite.better")
NAME = os.environ.get("APPLE_NAME", "Better")
# Another app's profiles are kept apart from Better's: smoothbible.store...
PREFIX = "" if BUNDLE == "space.trailingwhite.better" else BUNDLE.rsplit(".", 1)[1] + "."
KINDS = {
    "dev": ("DEVELOPMENT", "IOS_APP_DEVELOPMENT"),
    "store": ("DISTRIBUTION", "IOS_APP_STORE"),
}


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
        timeout=60,
    )
    if r.status_code >= 400:
        sys.exit(f"{method} {path}: {r.status_code} {r.text}")
    return r.json() if r.text else {}


def ensure_bundle_registered():
    found = call("GET", "/bundleIds", params={"filter[identifier]": BUNDLE})["data"]
    found = [b for b in found if b["attributes"]["identifier"] == BUNDLE]
    if found:
        return found[0]
    return call("POST", "/bundleIds", {"data": {"type": "bundleIds", "attributes": {
        "identifier": BUNDLE, "name": NAME, "platform": "IOS"}}})["data"]


def app_id():
    apps = call("GET", "/apps", params={"filter[bundleId]": BUNDLE})["data"]
    if not apps:
        sys.exit(f"no app in App Store Connect with the bundle id {BUNDLE}")
    return apps[0]["id"]


def save(name, data):
    path = os.path.join(HOME, name)
    with open(path, "wb") as f:
        f.write(data)
    os.chmod(path, 0o600)
    return path


def kind_arg():
    kind = sys.argv[2] if len(sys.argv) > 2 else ""
    if kind not in KINDS:
        sys.exit("dev or store?")
    return kind


def cert(kind):
    key = os.path.join(HOME, f"{kind}.key")
    if not os.path.exists(key):
        subprocess.run(["openssl", "genrsa", "-out", key, "2048"], check=True,
                       stderr=subprocess.DEVNULL)
        os.chmod(key, 0o600)
    csr = subprocess.run(["openssl", "req", "-new", "-key", key, "-subj",
                          "/CN=Better/O=lang8"], check=True, capture_output=True,
                         text=True).stdout
    c = call("POST", "/certificates", {"data": {"type": "certificates", "attributes": {
        "certificateType": KINDS[kind][0], "csrContent": csr}}})["data"]
    save(f"{kind}.cer", base64.b64decode(c["attributes"]["certificateContent"]))
    save(f"{kind}.cert-id", c["id"].encode())
    print("certificate", c["attributes"]["name"], "until", c["attributes"]["expirationDate"])


def profile(kind):
    with open(os.path.join(HOME, f"{kind}.cert-id")) as f:
        cert_id = f.read().strip()
    rel = {
        "bundleId": {"data": {"type": "bundleIds", "id": ensure_bundle_registered()["id"]}},
        "certificates": {"data": [{"type": "certificates", "id": cert_id}]},
    }
    phones = 0
    if kind == "dev":
        devices = [{"type": "devices", "id": d["id"]} for d in
                   call("GET", "/devices", params={"limit": 200})["data"]
                   if d["attributes"]["status"] == "ENABLED"]
        rel["devices"] = {"data": devices}
        phones = len(devices)
    p = call("POST", "/profiles", {"data": {"type": "profiles", "attributes": {
        "name": f"{NAME} {kind} {int(time.time())}", "profileType": KINDS[kind][1]},
        "relationships": rel}})["data"]
    save(f"{PREFIX}{kind}.mobileprovision", base64.b64decode(p["attributes"]["profileContent"]))
    print("profile", p["attributes"]["name"], f"({phones} phones)" if kind == "dev" else "",
          "until", p["attributes"]["expirationDate"])


# The version and build number in the IPA's Info.plist.
def ipa_versions(ipa):
    with zipfile.ZipFile(ipa) as z:
        name = next(n for n in z.namelist() if n.endswith(".app/Info.plist")
                    and n.count("/") == 2)
        info = plistlib.loads(z.read(name))
    return info["CFBundleShortVersionString"], info["CFBundleVersion"]


def upload(ipa):
    short, build = ipa_versions(ipa)
    size = os.path.getsize(ipa)
    up = call("POST", "/buildUploads", {"data": {"type": "buildUploads", "attributes": {
        "cfBundleShortVersionString": short, "cfBundleVersion": build, "platform": "IOS"},
        "relationships": {"app": {"data": {"type": "apps", "id": app_id()}}}}})["data"]
    f = call("POST", "/buildUploadFiles", {"data": {"type": "buildUploadFiles", "attributes": {
        "assetType": "ASSET", "fileName": os.path.basename(ipa), "fileSize": size,
        "uti": "com.apple.ipa"},
        "relationships": {"buildUpload": {"data": {"type": "buildUploads", "id": up["id"]}}}}})["data"]
    print(f"uploading {short} ({build}), {size} bytes")
    with open(ipa, "rb") as data:
        for op in f["attributes"]["uploadOperations"]:
            data.seek(op["offset"])
            part = data.read(op["length"])
            headers = {h["name"]: h["value"] for h in op.get("requestHeaders") or []}
            r = requests.request(op["method"], op["url"], data=part, headers=headers, timeout=300)
            if r.status_code >= 400:
                sys.exit(f"upload part at {op['offset']}: {r.status_code} {r.text[:500]}")
    with open(ipa, "rb") as data:
        md5 = hashlib.md5(data.read()).hexdigest()
    call("PATCH", f"/buildUploadFiles/{f['id']}", {"data": {"type": "buildUploadFiles",
         "id": f["id"], "attributes": {"uploaded": True,
         "sourceFileChecksums": {"file": {"hash": md5, "algorithm": "MD5"}}}}})
    print("uploaded; Apple is processing it")
    last = None
    for _ in range(120):
        u = call("GET", f"/buildUploads/{up['id']}")["data"]["attributes"]
        state = u.get("state") or {}
        if state.get("state") != last:
            last = state.get("state")
            print(" ", last)
        for w in state.get("warnings") or []:
            print("  warning:", w.get("code"), w.get("description"))
        if last in ("COMPLETE", "FAILED"):
            for e in state.get("errors") or []:
                print("  error:", e.get("code"), e.get("description"))
            sys.exit(0 if last == "COMPLETE" else 1)
        time.sleep(15)
    print("still processing; see apple.py builds")


def builds():
    for b in call("GET", "/builds", params={"filter[app]": app_id(), "sort": "-uploadedDate",
                                            "limit": 5})["data"]:
        a = b["attributes"]
        print(a["version"], a["processingState"], a.get("uploadedDate"),
              "expired" if a.get("expired") else "")


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else ""
    if what == "bundle":
        b = ensure_bundle_registered()
        print("bundle id", b["attributes"]["identifier"], "team", b["attributes"].get("seedId"))
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
        cert(kind_arg())
    elif what == "profile":
        profile(kind_arg())
    elif what == "upload":
        upload(sys.argv[2])
    elif what == "builds":
        builds()
    else:
        with open(__file__) as f:
            sys.exit("".join(f.readlines()[1:16]))


main()
