// Following (SKINS.md, Panes: Linked), the web's: the same rules as
// core/follow.l8's, checked against its cases (follow_test.mjs, make
// bible-follow-test). Positions are numbers down each pane's own content;
// a shape is a pane's chapter as it is laid out (or guessed): { starts: [y
// or null per anchor], top, end (null: not known), em }. A link map is {
// mode, comments, i0: [], i1: [], j: [] }.
//
// The page is the top pane, the panel the bottom. The section under the
// top pane's top edge (or the linked one nearest it) has a section linked
// with it as much in sight in the bottom pane as can be; while it does,
// nothing moves, and when it doesn't, the pane the hand isn't moving moves
// as little as makes it so, gliding there.

export const BY_VERSE = 0;
export const BY_COMMENT = 1;
const PANEL = 1;

const SLACK = 0.5;
const SAME = 0.001;
const GLIDE_SECONDS = 0.05;
// How long a glide may go on after its place was last new (s).
export const GLIDE_MOST = 0.3;

// The links: pairs of a section of the top pane and one of the bottom pane
// linked with it.
export const newLinks = () => ({ topFrom: [], topTo: [], bottomFrom: [], bottomTo: [] });

function section(shape, i0, i1) {
  const n = shape.starts.length;
  if (i0 < 0 || i1 < i0 || i1 >= n || shape.starts[i0] == null) return null;
  const to = i1 + 1 < n ? shape.starts[i1 + 1] : shape.end;
  if (to == null || to <= shape.starts[i0]) return null;
  return [shape.starts[i0], to];
}

// A chapter's top: from its top to its first anchor (null: not known, or no
// height).
function topSection(shape) {
  if (!shape.starts.length || shape.top == null || shape.starts[0] == null || shape.starts[0] <= shape.top) return null;
  return [shape.top, shape.starts[0]];
}

function put(links, top, bottom) {
  links.topFrom.push(top[0]);
  links.topTo.push(top[1]);
  links.bottomFrom.push(bottom[0]);
  links.bottomTo.push(bottom[1]);
}

function link(links, page, i0, i1, panel, j0, j1) {
  const top = section(page, i0, i1);
  const bottom = section(panel, j0, j1);
  if (top && bottom) put(links, top, bottom);
}

// A chapter's links added (core's follow_links_add): by verse, each match's
// verses; by comment, a version on the page: each verse a comment is on
// with that comment; a commentary on the page: each comment with its run of
// verses; a chapter of a commentary's run without comments: the version's
// chapter with the run's part. Either way, the chapters' tops (above their
// first anchors) with each other.
export function addLinks(links, map, page, panel) {
  if (map.mode !== BY_VERSE && map.j.length === 0) {
    if (page.top != null && page.end != null && panel.top != null && panel.end != null && page.end > page.top && panel.end > panel.top) put(links, [page.top, page.end], [panel.top, panel.end]);
    return;
  }
  const top = topSection(page);
  const bottom = topSection(panel);
  if (top && bottom) put(links, top, bottom);
  if (map.mode === BY_VERSE) {
    for (let k = 0; k < map.j.length; k++) link(links, page, map.i0[k], map.i0[k], panel, map.j[k], map.j[k]);
    return;
  }
  const versionOnPage = map.comments === PANEL;
  for (let k = 0; k < map.j.length; k++) {
    if (versionOnPage) for (let i = map.i0[k]; i <= map.i1[k]; i++) link(links, page, i, i, panel, map.j[k], map.j[k]);
    else link(links, page, map.j[k], map.j[k], panel, map.i0[k], map.i1[k]);
  }
}

// The tops of a sight height tall showing from..to as much as can be.
function range(from, to, height) {
  const a = to - height;
  return a < from ? [a, from] : [from, a];
}

const clamp = (x, r) => Math.max(r[0], Math.min(r[1], x));

function distance(from, to, at) {
  return at < from ? from - at : at >= to ? at - to + SLACK : 0;
}

function nearest(links, edge) {
  let best = -1;
  for (let k = 0; k < links.topFrom.length; k++) {
    const d = distance(links.topFrom[k], links.topTo[k], edge);
    if (best < 0 || d < best) best = d;
  }
  return best;
}

// The top pane moved: the bottom pane's new top (null: it stays).
export function bottomMove(links, topEdge, bottomTop, bottomHeight) {
  const near = nearest(links, topEdge);
  if (near < 0) return null;
  let best = bottomTop;
  let found = false;
  for (let k = 0; k < links.topFrom.length; k++) {
    if (distance(links.topFrom[k], links.topTo[k], topEdge) > near + SAME) continue;
    const to = clamp(bottomTop, range(links.bottomFrom[k], links.bottomTo[k], bottomHeight));
    if (!found || Math.abs(to - bottomTop) < Math.abs(best - bottomTop)) best = to;
    found = true;
  }
  return Math.abs(best - bottomTop) <= SLACK ? null : best;
}

const inSight = (links, k, bottomTop, bottomHeight) => Math.abs(clamp(bottomTop, range(links.bottomFrom[k], links.bottomTo[k], bottomHeight)) - bottomTop) <= SLACK;

function topFor(links, k, topTop, topHeight) {
  const from = links.topFrom[k];
  const to = links.topTo[k];
  return clamp(topTop, [from, to - topHeight > from ? to - topHeight : from]);
}

function overlap(a, b, c, d) {
  const low = Math.max(a, c);
  const high = Math.min(b, d);
  return high > low ? high - low : 0;
}

// The bottom pane moved: the top pane's new top (null: it stays).
export function topMove(links, topTop, topHeight, bottomTop, bottomHeight) {
  const near = nearest(links, topTop);
  if (near < 0) return null;
  const n = links.topFrom.length;
  for (let k = 0; k < n; k++) if (distance(links.topFrom[k], links.topTo[k], topTop) <= near + SAME && inSight(links, k, bottomTop, bottomHeight)) return null;
  let best = topTop;
  let found = false;
  for (let k = 0; k < n; k++) {
    if (!inSight(links, k, bottomTop, bottomHeight)) continue;
    const to = topFor(links, k, topTop, topHeight);
    if (!found || Math.abs(to - topTop) < Math.abs(best - topTop)) best = to;
    found = true;
  }
  if (!found) {
    let most = 0;
    for (let k = 0; k < n; k++) most = Math.max(most, overlap(links.bottomFrom[k], links.bottomTo[k], bottomTop, bottomTop + bottomHeight));
    for (let k = 0; k < n; k++) {
      if (!(most > 0 && overlap(links.bottomFrom[k], links.bottomTo[k], bottomTop, bottomTop + bottomHeight) >= most - SLACK)) continue;
      const to = topFor(links, k, topTop, topHeight);
      if (!found || Math.abs(to - topTop) < Math.abs(best - topTop)) best = to;
      found = true;
    }
  }
  return !found || Math.abs(best - topTop) <= SLACK ? null : best;
}

// A pane gliding to its place: where it is after seconds more, there by
// left seconds from now at the latest (core's follow_glide).
export function glide(at, to, seconds, left) {
  const dt = Math.max(0, seconds);
  if (left <= dt) return to;
  const x = dt / GLIDE_SECONDS;
  const grown = 1 + x + (x * x) / 2 + (x * x * x) / 6;
  const after = (left - dt) / left;
  const kept = Math.min(after * after * after, 1 / grown);
  const next = to + (at - to) * kept;
  return Math.abs(next - to) <= SLACK ? to : next;
}

// A pane's place and its reading line's position, each way (core's
// follow_place_y and follow_line_place): a pane sent to a place tells it
// back. Anchor i's span runs from its start to the next's (the chapter's
// top before the first, its end after the last).
export const PLACE_SLACK = 1;

export function placeY(shape, i, frac) {
  const a = i < 0 ? shape.top : shape.starts[i];
  const b = i + 1 < shape.starts.length ? shape.starts[i + 1] : shape.end;
  return a + ((b - a) * frac) / 1000;
}

export function linePlace(shape, line) {
  let i = -1;
  for (let k = 0; k < shape.starts.length; k++) if (shape.starts[k] <= line + PLACE_SLACK) i = k;
  const a = i < 0 ? shape.top : shape.starts[i];
  const b = i + 1 < shape.starts.length ? shape.starts[i + 1] : shape.end;
  const frac = b - a < 1 ? 0 : Math.trunc(((line - a) / (b - a)) * 1000 + 0.5);
  return { i, frac: Math.max(0, Math.min(999, frac)) };
}
