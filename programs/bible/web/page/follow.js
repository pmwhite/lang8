// Following, frame by frame (SKINS.md, Panes: Linked), the web's: the same
// rules as core/follow.l8's, checked against its cases (follow_test.mjs,
// make bible-follow-test). Positions are numbers down each pane's own
// content; a shape is a pane's chapter as it is laid out: { starts: [y or
// null per anchor], top, end (null: not laid out), em }. A link map is {
// mode, i0: [], i1: [], j: [] }.

export const BY_VERSE = 0;
export const BY_COMMENT = 1;

const FIT_PAIRS = 5;
const REACH_EM = 9;
const SLACK_EM = 0.5;
const UNLAID = 1e12;

// The pairs a version follows by: the leader's and the follower's positions
// of each match's first anchors, the chapter's top and its end, in order,
// each going forward on both sides (one that doesn't, left out).
export function followPairs(map, page, panel, pageLeads) {
  const x = [];
  const y = [];
  const add = (a, b) => {
    const n = x.length;
    if (n > 0 && (a <= x[n - 1] || b < y[n - 1])) return;
    x.push(a);
    y.push(b);
  };
  const both = (p, q) => (pageLeads ? add(p, q) : add(q, p));
  if (page.top != null && panel.top != null) both(page.top, panel.top);
  for (let k = 0; k < map.j.length; k++) {
    const a = page.starts[map.i0[k]];
    const b = panel.starts[map.j[k]];
    if (a != null && b != null) both(a, b);
  }
  if (page.end != null && panel.end != null) both(page.end, panel.end);
  return { x, y };
}

const mean = (a, b) => (a <= 0 || b <= 0 ? 0 : (2 * a * b) / (a + b));

function curve(p, k, line) {
  const x1 = p.x[k];
  const x2 = p.x[k + 1];
  const y1 = p.y[k];
  const y2 = p.y[k + 1];
  const h = x2 - x1;
  const m = (y2 - y1) / h;
  const ratio = (i) => (p.y[i + 1] - p.y[i]) / (p.x[i + 1] - p.x[i]);
  const d1 = k > 0 ? mean(ratio(k - 1), m) : m;
  const d2 = k + 2 < p.x.length ? mean(m, ratio(k + 1)) : m;
  const t = (line - x1) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * h * d1 + (-2 * t3 + 3 * t2) * y2 + (t3 - t2) * h * d2;
}

// Where a version's reading line goes for the leader's at line (null: it
// can't be told from what is laid out).
export function followByVerse(p, line, leaderEm, followerEm) {
  const n = p.x.length;
  let k = -1;
  for (let i = 0; i < n; i++) if (p.x[i] <= line) k = i;
  if (k < 0 || k + 1 >= n) return null;
  const exact = curve(p, k, line);
  const reach = leaderEm * REACH_EM;
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  const from = Math.max(0, k - FIT_PAIRS);
  const to = Math.min(n, k + FIT_PAIRS + 2);
  for (let i = from; i < to; i++) {
    const d = p.x[i] - line;
    const u = d / reach;
    const w = 1 / ((1 + u * u) * (1 + u * u));
    sw += w;
    sx += w * d;
    sy += w * p.y[i];
    sxx += w * d * d;
    sxy += w * d * p.y[i];
  }
  const det = sw * sxx - sx * sx;
  if (sw <= 0 || det <= 0.000001 * sw * sw) return exact;
  const slope = (sw * sxy - sx * sy) / det;
  if (slope <= 0) return exact;
  const steady = (sy - slope * sx) / sw;
  const slack = followerEm * SLACK_EM;
  const d = steady - exact;
  return exact + d / (1 + Math.abs(d) / slack);
}

// Whether the commentary's anchor j covers the page's anchor i.
function covers(map, j, i) {
  if (j < 0) return false;
  for (let k = 0; k < map.j.length; k++) if (map.j[k] === j && map.i0[k] <= i && i <= map.i1[k]) return true;
  return false;
}

// A step by comment: null to stay, else the anchor to go to (-1: the
// chapter's top).
export function commentFromPage(map, pageI, panelJ, panel, panelLine) {
  if (pageI < 0) return panelJ < 0 ? null : -1;
  if (covers(map, panelJ, pageI)) return null;
  let best = -1;
  let bestD = 0;
  for (let k = 0; k < map.j.length; k++) {
    if (!(map.i0[k] <= pageI && pageI <= map.i1[k])) continue;
    const j = map.j[k];
    const s = panel.starts[j];
    const d = s != null ? Math.abs(s - panelLine) : UNLAID + Math.abs(j - panelJ);
    if (best < 0 || d < bestD) {
      best = j;
      bestD = d;
    }
  }
  return best < 0 ? null : best;
}

// A commentary leading the page from a run of chapters it says nothing on
// (runFrom to runTo): null to stay (the page in one of them), else the
// run's chapter nearest the page.
export function runChapter(runFrom, runTo, pageC) {
  if (pageC >= runFrom && pageC <= runTo) return null;
  return pageC < runFrom ? runFrom : runTo;
}

export function pageFromComment(map, panelJ, pageI) {
  if (panelJ < 0) return pageI < 0 ? null : -1;
  if (pageI >= 0 && covers(map, panelJ, pageI)) return null;
  for (let k = 0; k < map.j.length; k++) if (map.j[k] === panelJ) return map.i0[k];
  return null;
}
