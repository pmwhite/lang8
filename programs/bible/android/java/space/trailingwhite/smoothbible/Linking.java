package space.trailingwhite.smoothbible;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.OptionalDouble;

// The two panes linked (SKINS.md, Panes: Linked): the pane a finger last
// moved leads, and on each frame it moves the other is placed by core's
// link maps of the chapters about the leader's and the rules core/follow.l8
// writes (Follow): a version smoothly, verse by verse; a commentary held
// at a comment's start, then travelling to the next.
final class Linking implements Reader.Moves {
  private final Reader page, panel;
  // Each chapter's link map as core last sent it (`link C MODE`, `match`
  // lines, `end`); all let go as either pane's parts are forgotten.
  private final HashMap<Integer, Follow.LinkMap> maps = new HashMap<>();
  // A map being said: its chapter (-1: none), mode and matches so far.
  private int sayingC = -1, sayingMode, sayingComments;
  private final ArrayList<int[]> saying = new ArrayList<>();
  private Reader leader;

  Linking(Reader page, Reader panel) {
    this.page = page;
    this.panel = panel;
    leader = page;
    page.setMoves(this);
    panel.setMoves(this);
  }

  // ---- core's lines ----
  // `link C MODE COMMENTS` (COMMENTS, by comment, the commentary's pane:
  // the panel, if unsaid).
  void linkBegin(int c, int mode, int comments) {
    sayingC = c;
    sayingMode = mode;
    sayingComments = comments == 0 ? 0 : 1;
    saying.clear();
  }

  // `match I0 I1 J`.
  void match(int i0, int i1, int j) {
    if (sayingC >= 0) saying.add(new int[] {i0, i1, j});
  }

  // `end`: the map kept.
  void linkEnd() {
    if (sayingC < 0) return;
    int n = saying.size();
    int[] i0 = new int[n], i1 = new int[n], j = new int[n];
    for (int k = 0; k < n; k++) {
      i0[k] = saying.get(k)[0];
      i1[k] = saying.get(k)[1];
      j[k] = saying.get(k)[2];
    }
    maps.put(sayingC, new Follow.LinkMap(sayingMode, sayingComments, i0, i1, j));
    sayingC = -1;
    saying.clear();
  }

  // `forget P C`: core sends its maps again as they are wanted.
  void forgetMaps() {
    maps.clear();
  }

  // Whether the panel's reader shows, linked.
  private boolean linked() {
    return panel.linkedShown() && panel.isShown();
  }

  // ---- the panes ----
  @Override
  public void moving(Reader r) {
    held = false;
    ruled = false;
    if (r == panel && fills) fullReadOn = true;
    if (gliding == r) stopGlide();
    leader = r;
  }

  @Override
  public void moved(Reader r) {
    if (linked() && (r == leader || ruled)) follow(leader);
  }

  // (At rest the parts following goes by are measured ahead, and the rule
  // kept as what they tell changes: ahead.)
  @Override
  public void rested(Reader r) {
    aheadSoon();
  }

  // While both rest, linked: a part measured ahead a turn, the follower's
  // first (Reader.aheadNext).
  private static final long AHEAD_MS = 40;

  private final Runnable aheadTurn = this::ahead;

  private void aheadSoon() {
    page.removeCallbacks(aheadTurn);
    page.postDelayed(aheadTurn, AHEAD_MS);
  }

  private void ahead() {
    if (!linked()) return;
    if (!page.resting() || !panel.resting()) {
      aheadSoon();
      return;
    }
    Reader.Place at = leader.placeAtLine();
    if (at == null) return;
    Reader other = leader == page ? panel : page;
    int from = at.c - FOLLOW_CHAPTERS, to = at.c + FOLLOW_CHAPTERS;
    if (other.aheadNext(from, to) || leader.aheadNext(from, to)) aheadSoon();
    // (Both at rest: the rule kept as what has been measured tells more.)
    follow(leader);
  }

  // A jump (either pane's `go`: Go To, a link, Swap Panes): both panes held
  // where it puts them until a hand moves either. The panel's sent where
  // the rule puts it (MODE 2: opened, its document come, the app restored):
  // placed by the rule at once, and again as parts come and it is laid out
  // anew, until a hand moves either pane (the page going elsewhere with it,
  // at launch, leaves it so).
  static final int GO_RULED = 2;

  @Override
  public void jumped(Reader r, int mode) {
    if (r == panel && mode == GO_RULED) {
      ruled = true;
      held = false;
    } else {
      held = true;
      if (r == panel) ruled = false;
    }
    stopGlide();
    if (ruled && linked()) follow(page);
  }

  private boolean ruled;

  // From a jump until a hand moves either pane, both panes are held where
  // the jump put them (core's `go` for each, as a `go` holds its pane's
  // place): the rule doesn't move either, so that Swap Panes and the way
  // back leave both where they were.
  private boolean held;

  // `beside OPEN FULL`: whether the panel fills the screen. Beside the page
  // again, the page follows the panel only if a hand moved the panel while
  // it filled the screen (else the page leads, and stays).
  void filling(boolean full) {
    if (fills && !full) leader = fullReadOn ? panel : page;
    if (!fills && full) fullReadOn = false;
    fills = full;
  }

  private boolean fills, fullReadOn;

  // The chapters either side of each pane's at its sight's top whose maps
  // following goes by (core sends those of two either side as the place
  // comes near them).
  private static final int FOLLOW_CHAPTERS = 2;

  // The links of the chapters about both panes' sights.
  private Follow.Links links() {
    int from = Integer.MAX_VALUE, to = Integer.MIN_VALUE;
    for (Reader r : new Reader[] {page, panel}) {
      int c = r.chapterAtSight();
      if (c < 0) continue;
      from = Math.min(from, c - FOLLOW_CHAPTERS);
      to = Math.max(to, c + FOLLOW_CHAPTERS);
    }
    Follow.Links links = new Follow.Links();
    if (from > to) return links;
    Reader.Guess pageGuess = page.guessParts(from, to), panelGuess = panel.guessParts(from, to);
    for (int c = from; c <= to; c++) {
      Follow.LinkMap map = maps.get(c);
      if (map != null) links.add(map, page.shapeGuessed(c, pageGuess), panel.shapeGuessed(c, panelGuess));
    }
    return links;
  }

  // Whether each pane's chapter at its top edge, linked (its map said, with
  // matches: the other document has it), has its anchors known in the other
  // pane (Reader.chapterKnown asks for them): a chapter not known there has
  // no links, and the rule would take another chapter's section for the
  // nearest linked one.
  private boolean edgesKnown() {
    boolean known = true;
    for (Reader r : new Reader[] {page, panel}) {
      int c = r.chapterAtSight();
      Follow.LinkMap map = c >= 0 ? maps.get(c) : null;
      Reader other = r == page ? panel : page;
      if (map != null && map.j.length > 0 && !other.chapterKnown(c)) known = false;
    }
    return known;
  }

  // A pane moved by a hand (or a jump): the other moved by the rule, if it
  // doesn't hold (SKINS.md, Panes: Linked; Follow, core/follow.l8's rules):
  // the section at the page's top edge has one linked with it as much in
  // sight in the panel as can be. The page moved, the panel moves; the
  // panel moved, the page. Gliding there (at once where animations are
  // off). Not while a jump holds both panes.
  private void follow(Reader lead) {
    if (following || held && !ruled) return;
    // (Nothing moves until the chapters at the top edges are known in both
    // panes: following again a turn later.)
    if (!edgesKnown()) {
      aheadSoon();
      return;
    }
    following = true;
    try {
      Follow.Links links = links();
      boolean pageLeads = lead == page || ruled;
      Reader moving = pageLeads ? panel : page;
      OptionalDouble to = pageLeads
          ? Follow.bottomMove(links, page.sightTop(), panel.sightTop(), panel.sightHeight())
          : Follow.topMove(links, page.sightTop(), page.sightHeight(), panel.sightTop(), panel.sightHeight());
      // (The page isn't moved while the panel fills the screen over it: it
      // is where it was when the panel is beside it again.)
      if (!to.isPresent() || Math.abs(to.getAsDouble() - moving.sightTop()) < 1 || (moving == page && fills)) return;
      if (ruled || !Reader.animatorsOn()) {
        stopGlide();
        moving.followSight(to.getAsDouble());
      } else glideTo(moving, to.getAsDouble());
    } finally {
      following = false;
    }
  }

  private boolean following;

  // The pane following glides (its sight's top going to glideAim), a frame
  // at a time by Follow.glide; a new place mid-glide is glided to from
  // where it is.
  private Reader gliding;
  private double glideAim;
  // When it last stepped, and when its place was last new (there at most
  // Follow.GLIDE_MOST after).
  private long glideAt, glideNew;

  private void glideTo(Reader r, double to) {
    if (gliding != null && gliding != r) stopGlide();
    long now = android.os.SystemClock.uptimeMillis();
    if (gliding == null || Math.abs(to - glideAim) > Follow.SLACK) glideNew = now;
    glideAim = to;
    if (gliding != null) return;
    gliding = r;
    // (Its first step now, in the frame the rule broke in.)
    glideAt = now - 16;
    glideFrame.run();
  }

  private final Runnable glideFrame = () -> {
    Reader r = gliding;
    if (r == null) return;
    long now = android.os.SystemClock.uptimeMillis();
    double from = r.sightTop();
    double seconds = Math.min(0.1, (now - glideAt) / 1000.0);
    double next = Follow.glide(from, glideAim, seconds, Follow.GLIDE_MOST - ((now - glideNew) / 1000.0 - seconds));
    glideAt = now;
    r.followSight(next);
    double at = r.sightTop();
    if (Math.abs(at - glideAim) <= 0.5 || Math.abs(next - from) >= 0.1 && Math.abs(at - from) < 0.05) {
      gliding = null;
      return;
    }
    r.postOnAnimation(this.glideFrame);
  };

  private void stopGlide() {
    if (gliding != null) gliding.removeCallbacks(glideFrame);
    gliding = null;
  }
}
