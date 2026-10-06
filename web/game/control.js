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
      case "capture":
        return capture(c);
      case "eval":
        return await new Function("platform", "telemetry", `return (async () => { ${c.code} })()`)(platform, telemetry);
      default:
        throw new Error(`unknown command ${c.cmd}`);
    }
  };
  // Post the next {frames} finished frames (every {every}th), scaled by
  // {scale}, as JPEGs to /capture under the command's id. It returns at once,
  // so later commands (such as keys) run while it captures.
  const capture = (c) => {
    const frames = c.frames ?? 30;
    const every = c.every ?? 1;
    const scale = c.scale ?? 0.5;
    const source = platform.canvas;
    const copy = document.createElement("canvas");
    copy.width = Math.max(1, Math.round(source.width * scale));
    copy.height = Math.max(1, Math.round(source.height * scale));
    const g = copy.getContext("2d");
    let seen = 0;
    let taken = 0;
    const t0 = performance.now();
    platform.setOnSwap(() => {
      if (seen++ % every !== 0) return;
      g.drawImage(source, 0, 0, copy.width, copy.height);
      const index = taken++;
      const ms = Math.round(performance.now() - t0);
      const data = copy.toDataURL("image/jpeg", c.quality ?? 0.75);
      fetch("/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, session, index, ms, data }),
      });
      if (taken >= frames) platform.setOnSwap(null);
    });
    return `capturing ${frames} frames`;
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
