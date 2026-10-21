#!/usr/bin/env python3
# Wait for an artifact of this workflow run, then download and unzip it, in
# GitHub Actions (for a job that starts before the job making it ends, so it
# need not be in `needs`: a simulator boots while the app is compiled):
#   artifact.py NAME DIR JOB
# It asks the API every few seconds (GH_TOKEN, with actions: read). It gives
# up, failing, once every job whose name starts with JOB has finished and
# there is still no NAME (the job making it failed), or after 30 minutes.
import io, json, os, sys, time, urllib.error, urllib.request, zipfile

name, out, job = sys.argv[1], sys.argv[2], sys.argv[3]
api = "https://api.github.com/repos/%s/actions/runs/%s" % (os.environ["GITHUB_REPOSITORY"], os.environ["GITHUB_RUN_ID"])
headers = {"Authorization": "Bearer " + os.environ["GH_TOKEN"], "Accept": "application/vnd.github+json"}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def get(url, auth=True):
    req = urllib.request.Request(url, headers=headers if auth else {})
    return urllib.request.build_opener(NoRedirect).open(req, timeout=60)

def api_json(path):
    return json.load(get(api + path))

start = time.time()
while True:
    try:
        found = [a for a in api_json("/artifacts?per_page=100&name=" + name)["artifacts"] if not a["expired"]]
        if found:
            break
        jobs = [j for j in api_json("/jobs?per_page=100")["jobs"] if j["name"].startswith(job)]
        if jobs and all(j["status"] == "completed" for j in jobs):
            # (One more look: it may have been uploaded as the job ended.)
            if not api_json("/artifacts?per_page=100&name=" + name)["artifacts"]:
                print("%s: no artifact %s, and %s finished (%s)" % (name, name, job, ", ".join(str(j["conclusion"]) for j in jobs)))
                sys.exit(1)
    except (urllib.error.URLError, OSError, ValueError) as e:
        print("asking again:", e)
    if time.time() - start > 1800:
        print("%s: gave up after 30 minutes" % name)
        sys.exit(1)
    time.sleep(4)
waited = time.time() - start
url = found[-1]["archive_download_url"]
for attempt in range(5):
    try:
        try:
            r = get(url)
        except urllib.error.HTTPError as e:
            if e.code not in (301, 302, 303, 307, 308):
                raise
            # (The blob store's link, which wants no token.)
            r = get(e.headers["Location"], auth=False)
        data = r.read()
        break
    except (urllib.error.URLError, OSError) as e:
        print("downloading again:", e)
        time.sleep(3)
else:
    sys.exit(1)
os.makedirs(out, exist_ok=True)
zipfile.ZipFile(io.BytesIO(data)).extractall(out)
print("%s: waited %.0f s, then %d bytes in %.0f s" % (name, waited, len(data), time.time() - start - waited))
