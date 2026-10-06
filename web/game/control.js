// Remote control for development: the page polls its server (web/serve.py)
// for commands queued with web/control.py, runs those addressed to it, and
// posts each result to /telemetry as a "control" record. A server without
// the endpoint turns it off.
//
// Commands: {cmd: "reload", query: "?probe"} loads the page again (with that
// query, if given); "probe" reloads it with ?probe added, so a probe starts
// from the original world and saves nothing; "keys" presses keys, {keys:
// [[type, keysym, delay_ms], ...]} with type 2 to press and 3 to release;
// "set" changes {scale, skip, view} where given; "report" posts a frame
// report now; "eval" runs {code} as an async function body and returns its
// result. A command with {target} runs only in pages whose user agent or
// session contains it.

const POLL_MS = 1000;

export function startControl(platform, telemetry) {
  const { session, post } = telemetry;
  let after = -1;
  let running = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async (c) => {
    switch (c.cmd) {
      case "reload": {
        const url = new URL(location.href);
        if (c.query !== undefined) url.search = c.query;
        setTimeout(() => location.assign(url), 200);
        return url.href;
      }
      case "probe": {
        const url = new URL(location.href);
        url.searchParams.set("probe", "");
        setTimeout(() => location.assign(url), 200);
        return url.href;
      }
      case "keys":
        for (const [type, sym, delay = 0] of c.keys ?? []) {
          platform.key(type, sym);
          if (delay) await sleep(delay);
        }
        return (c.keys ?? []).length;
      case "set":
        if (c.scale !== undefined) platform.setScale(c.scale);
        if (c.skip !== undefined) platform.setSkip(c.skip);
        if (c.view !== undefined && platform.frameView() !== c.view) {
          platform.key(2, 65472);
          platform.key(3, 65472);
        }
        return { scale: platform.scale(), view: platform.frameView() };
      case "report":
        return telemetry.reportNow();
      case "eval":
        return await new Function("platform", "telemetry", `return (async () => { ${c.code} })()`)(platform, telemetry);
      default:
        throw new Error(`unknown command ${c.cmd}`);
    }
  };
  const poll = async () => {
    while (running) {
      try {
        const q = new URLSearchParams({ after, session, ua: navigator.userAgent, url: location.href });
        const r = await fetch(`/control?${q}`, { cache: "no-store" });
        if (!r.ok) return;
        const { latest, commands } = await r.json();
        if (after < 0) after = latest;
        for (const c of commands) {
          after = Math.max(after, c.id);
          if (c.target && !navigator.userAgent.includes(c.target) && session !== c.target) continue;
          try {
            const result = await run(c);
            post("control", { id: c.id, cmd: c.cmd, ok: true, result });
          } catch (e) {
            post("control", { id: c.id, cmd: c.cmd, ok: false, error: String(e?.stack ?? e) });
          }
        }
      } catch {
        // The server may be restarting; keep polling.
      }
      await sleep(POLL_MS);
    }
  };
  poll();
  return { stop: () => (running = false) };
}
