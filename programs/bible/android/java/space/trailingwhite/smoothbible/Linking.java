package space.trailingwhite.smoothbible;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.OptionalDouble;

// The two panes linked (SKINS.md, Panes: Linked): the pane a finger last
// moved leads, and on each frame it moves the other is placed by core's
// link map of the leader's chapter and the rules core/follow.l8 writes
// (Follow): a version continuously, verse by verse; a commentary at a
// comment's border, waiting while the page leading it is flung and
// settling when it rests.
final class Linking implements Reader.Moves {
  private final Reader page, panel;
  // Each chapter's link map as core last sent it (`link C MODE`, `match`
  // lines, `end`); all let go as either pane's parts are forgotten.
  private final HashMap<Integer, Follow.LinkMap> maps = new HashMap<>();
  // A map being said: its chapter (-1: none), mode and matches so far.
  private int sayingC = -1, sayingMode;
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
  // `link C MODE`.
  void linkBegin(int c, int mode) {
    sayingC = c;
    sayingMode = mode;
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
    maps.put(sayingC, new Follow.LinkMap(sayingMode, i0, i1, j));
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
    leader = r;
  }

  @Override
  public void moved(Reader r) {
    if (r == leader && r.leads() && linked()) follow(r, false);
  }

  @Override
  public void rested(Reader r) {
    if (r == leader && linked()) follow(r, true);
  }

  // The follower placed for the leader where it is now (resting: it has
  // just come to rest).
  private void follow(Reader lead, boolean resting) {
    Reader.Place at = lead.placeAtLine();
    if (at == null) return;
    // (In a commentary's run of chapters without comments: no map needed.)
    int runFrom = panel.runFrom(at.c);
    if (runFrom >= 0) {
      if (lead == page) commentaryInRun(runFrom, resting);
      else pageInRun(runFrom, panel.runTo(at.c));
      return;
    }
    Follow.LinkMap map = maps.get(at.c);
    if (map == null) return;
    if (map.mode == Follow.BY_VERSE) byVerse(lead, at, map);
    else if (lead == page) commentaryFollows(at, map, resting);
    else pageFollows(at, map);
  }

  // A version following the other, its reading line by the rules; where
  // the follower hasn't the leader's chapter laid out, brought to the
  // leader's verse at once (it follows frame by frame once it has).
  private void byVerse(Reader lead, Reader.Place at, Follow.LinkMap map) {
    Reader other = lead == page ? panel : page;
    boolean pageLeads = lead == page;
    Follow.Pairs pairs = Follow.pairs(map, page.shape(at.c), panel.shape(at.c), pageLeads);
    OptionalDouble y = Follow.byVerse(pairs, lead.lineY(), lead.em(), other.em());
    if (y.isPresent()) other.followTo(y.getAsDouble());
    else if (!other.hasChapter(at.c)) other.bring(at.c, matched(map, at.i, pageLeads), false);
  }

  // The other pane's anchor that goes with the leader's anchor i (the last
  // matched at or before it; -1: the chapter's top).
  private static int matched(Follow.LinkMap map, int i, boolean pageLeads) {
    int best = -1;
    for (int k = 0; k < map.j.length; k++) {
      int from = pageLeads ? map.i0[k] : map.j[k];
      if (from <= i) best = pageLeads ? map.j[k] : map.i0[k];
    }
    return best;
  }

  // The page leading a commentary in its run of chapters without comments
  // (waiting while the page is flung): the run's part is its place.
  private void commentaryInRun(int runFrom, boolean resting) {
    if (page.flung() && !resting) return;
    Reader.Place aim = panel.aim();
    if (aim == null || aim.c != runFrom) panel.bring(runFrom, -1, true);
  }

  // A commentary in its run leading the page: by Follow.runChapter (no
  // place yet: the run's first).
  private void pageInRun(int runFrom, int runTo) {
    Reader.Place aim = page.aim();
    int to = aim == null ? runFrom : Follow.runChapter(runFrom, runTo, aim.c);
    if (to >= 0) page.bring(to, -1, true);
  }

  // The page leading a commentary: it waits while the page is flung; it
  // stays while its comment covers the page's verse, and goes to the
  // comment covering it nearest its reading line.
  private void commentaryFollows(Reader.Place at, Follow.LinkMap map, boolean resting) {
    if (page.flung() && !resting) return;
    Reader.Place aim = panel.aim();
    boolean same = aim != null && aim.c == at.c;
    Follow.CommentStep step = Follow.commentFromPage(map, at.i, same ? aim.i : -1,
        panel.shape(at.c), panel.lineY());
    if (!step.stays) panel.bring(at.c, step.anchor, true);
    else if (!same && at.i < 0) panel.bring(at.c, -1, true);
  }

  // A commentary leading the page: it stays while a verse the comment at
  // the commentary's reading line covers is at its own, and goes to the
  // comment's first verse.
  private void pageFollows(Reader.Place at, Follow.LinkMap map) {
    Reader.Place aim = page.aim();
    boolean same = aim != null && aim.c == at.c;
    Follow.CommentStep step = Follow.pageFromComment(map, at.i, same ? aim.i : -1);
    if (!step.stays) page.bring(at.c, step.anchor, true);
    else if (!same && at.i < 0) page.bring(at.c, -1, true);
  }
}
