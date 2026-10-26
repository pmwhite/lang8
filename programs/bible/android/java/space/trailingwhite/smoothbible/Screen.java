package space.trailingwhite.smoothbible;

import java.util.ArrayList;

// A screen as core built it (SKINS.md): its sections and rows, and what is
// around them (its field, tools, segments, filter, sort, confirm, hero).
final class Screen {
  int id, kind, arg;
  // The action each typed letter is (Practice's typing: keys ACTION; 0 none).
  int keys;
  String title = "", search = "";
  // The row shown first as it opens (of all its rows, in order; -1: none).
  int focus = -1;
  // Its field: the words in it, how long typing rests before they are
  // sent (ms), whether Return goes (Go To) and whether it takes the keys as
  // the screen opens; its scopes (titles, what TalkBack says) and the one
  // chosen; and whether its list is plain.
  String searchText = "";
  int wait, scope;
  boolean go, focusField, plain, grid;
  String[] scopes = new String[0], scopeLabels = new String[0];
  // Words above its first section (set by their runs), and whether its
  // focus row is selected too.
  String intro = "";
  int[] introRuns = new int[0];
  boolean focusSelect;
  // The focus row's words kept in sight (UTF-16, FROM to TO; -1: none).
  int focusFrom = -1, focusTo = -1;
  // A word as its heading: the word, its script (a RUN_), its
  // transliteration, and a line under them (by its runs).
  String hero = "", heroSub = "", heroLine = "";
  int heroScript;
  int[] heroRuns = new int[0];
  // The buttons at its foot.
  final ArrayList<Tool> tools = new ArrayList<>();
  // A button at the left of its bar (a note's Cancel), its action, and
  // whether it is destructive; and whether its intro is a quote.
  String left = "";
  int leftAction;
  boolean leftDestructive, introQuote;
  // Its confirming button at the top (New Ribbon's Add), off or not.
  String confirm = "";
  int confirmAction;
  boolean confirmOff;
  // Its segments (labels, the one shown, what choosing does), a filter by
  // color (circles' hex colors and spoken labels, the one chosen, -1 All)
  // and a sort (titles, the one in force).
  String[] segments = new String[0], filterColors = new String[0], filterLabels = new String[0],
      sorts = new String[0];
  int segment, segmentsAction, filter = -1, filterAction, sort, sortAction;
  // What it shows with no rows, and its button's title and commands.
  String emptySymbol = "", emptyTitle = "", emptyLine = "", button = "";
  final ArrayList<Command> commands = new ArrayList<>();

  static final class Command {
    int action, arg;
    String title = "";
    boolean destructive;
  }

  // A button at the foot: its title (or icon, and spoken label), what it
  // does, its style (0 plain, 1 prominent, 2 destructive, 3 off), its place
  // (0 left, 1 middle, 2 right), and its menu (ARG:TITLE items).
  static final class Tool {
    int action, style, place;
    // (Long: a reference packs a chapter and verse at each end.)
    long arg;
    String title = "", icon = "", label = "", menu = "";
  }

  // A tool line: tool ACTION ARG TITLE ICON LABEL STYLE PLACE MENU.
  static Tool tool(Wire w) {
    Tool t = new Tool();
    t.action = w.fieldNum(1);
    t.arg = w.fieldLong(2);
    t.title = w.field(3);
    t.icon = w.field(4);
    t.label = w.field(5);
    t.style = w.fieldNum(6);
    t.place = w.fieldNum(7);
    t.menu = w.field(8);
    return t;
  }

  final ArrayList<Section> sections = new ArrayList<>();

  static final class Section {
    String header = "", footer = "", button = "", headerSuffix = "";
    int buttonAction, credit;
    String[] columns = new String[0];
    final ArrayList<Row> rows = new ArrayList<>();
  }

  // A section line: section HEADER FOOTER BUTTON ACTION SUFFIX CREDIT COLUMNS.
  static Section section(Wire w) {
    Section s = new Section();
    s.header = w.field(1);
    s.footer = w.field(2);
    s.button = w.field(3);
    s.buttonAction = w.fieldNum(4);
    s.headerSuffix = w.field(5);
    s.credit = w.fieldNum(6);
    s.columns = split(w.field(7));
    return s;
  }

  // A row's action a screen reader offers (and its long press, and its
  // menu).
  static final class Action {
    int action;
    String title = "", icon = "";
  }

  // A grid's cell: its words in a script, what it does, its count, what
  // TalkBack says, and its tap.
  static final class Cell {
    int action, script, flags;
    long arg;
    String text = "", sub = "", count = "", label = "", tr = "";
    final ArrayList<Action> actions = new ArrayList<>();
  }

  // A tile's flags (core/ui.l8's UI_TILE_): its English hidden, its
  // transliteration hidden, the helped mark, its English faint, no original.
  static final int TILE_HIDE_SUB = 1, TILE_HIDE_TR = 2, TILE_HELPED = 4, TILE_FAINT_SUB = 8,
      TILE_ADDED = 16;

  static Cell cell(Wire w) {
    Cell c = new Cell();
    c.action = w.fieldNum(1);
    c.arg = w.fieldLong(2);
    c.script = w.fieldNum(3);
    c.text = w.field(4);
    c.sub = w.field(5);
    c.count = w.field(6);
    c.label = w.field(7);
    c.tr = w.field(8);
    c.flags = w.fieldNum(9);
    actions(w.field(10), c.actions);
    return c;
  }

  static final class Row {
    String kind = "", title = "", detail = "", icon = "", acc = "", flags = "", options = "",
        label = "", trailing = "", hint = "", suffix = "", iconColor = "", note = "", lead = "",
        side = "", sideNote = "";
    long arg;
    int action, value, lo, hi, deleteAction, custom, lines, circle, circleAction, infoAction,
        titleLines, fieldKind, leadStyle;
    // Places in the detail to stress: pairs of UTF-16 offsets; the runs of
    // its detail, title and side words (END, STYLE pairs).
    int[] marks = new int[0], runs = new int[0], truns = new int[0], sruns = new int[0];
    // A page's paragraph's links: B, E (UTF-16), ACTION, ARG each.
    long[] links = new long[0];
    final ArrayList<Action> actions = new ArrayList<>();
    final ArrayList<Cell> cells = new ArrayList<>();

    boolean flag(char c) {
      return flags.indexOf(c) >= 0;
    }
  }

  // A row line (and, after ACTION_ICONS, LINKS): row KIND ACTION ARG TITLE DETAIL ICON ACC FLAGS VALUE OPTIONS
  // LO HI LABEL TRAILING DELETE CUSTOM HINT MARKS LINES CIRCLE CIRCLE_ACTION
  // SUFFIX ICON_COLOR NOTE INFO ACTIONS RUNS TRUNS TITLE_LINES FIELD_KIND LEAD
  // LEAD_STYLE SIDE SRUNS SIDE_NOTE ACTION_ICONS.
  static Row row(Wire w) {
    Row r = new Row();
    r.kind = w.field(1);
    r.action = w.fieldNum(2);
    r.arg = w.fieldLong(3);
    r.title = w.field(4);
    r.detail = w.field(5);
    r.icon = w.field(6);
    r.acc = w.field(7);
    r.flags = w.field(8);
    r.value = w.fieldNum(9);
    r.options = w.field(10);
    r.lo = w.fieldNum(11);
    r.hi = w.fieldNum(12);
    r.label = w.field(13);
    r.trailing = w.field(14);
    r.deleteAction = w.fieldNum(15);
    r.custom = w.fieldNum(16);
    r.hint = w.field(17);
    r.marks = nums(w.field(18), ' ');
    r.lines = w.fieldNum(19);
    r.circle = w.fieldNum(20);
    r.circleAction = w.fieldNum(21);
    r.suffix = w.field(22);
    r.iconColor = w.field(23);
    r.note = w.field(24);
    r.infoAction = w.fieldNum(25);
    actions(w.field(26), r.actions);
    r.runs = runs(w.field(27));
    r.truns = runs(w.field(28));
    r.titleLines = w.fieldNum(29);
    r.fieldKind = w.fieldNum(30);
    r.lead = w.field(31);
    r.leadStyle = w.fieldNum(32);
    r.side = w.field(33);
    r.sruns = runs(w.field(34));
    r.sideNote = w.field(35);
    String[] icons = w.field(36).split("\\|", -1);
    for (int i = 0; i < r.actions.size() && i < icons.length; i++) r.actions.get(i).icon = icons[i];
    String ls = w.field(37);
    if (!ls.isEmpty()) {
      String[] parts = ls.split("\\|");
      r.links = new long[parts.length * 4];
      for (int i = 0; i < parts.length; i++) {
        String[] q = parts[i].split(":");
        for (int j = 0; j < 4 && j < q.length; j++) {
          try {
            r.links[i * 4 + j] = Long.parseLong(q[j]);
          } catch (NumberFormatException e) {
            r.links = new long[0];
            return r;
          }
        }
      }
    }
    return r;
  }

  // Actions: ACTION:TITLE split by |.
  static void actions(String acts, ArrayList<Action> into) {
    if (acts.isEmpty()) return;
    for (String a : acts.split("\\|", -1)) {
      int colon = a.indexOf(':');
      if (colon < 0) continue;
      Action x = new Action();
      try {
        x.action = Integer.parseInt(a.substring(0, colon));
      } catch (NumberFormatException e) {
        continue;
      }
      x.title = a.substring(colon + 1);
      into.add(x);
    }
  }

  // Words split by |; none from nothing.
  static String[] split(String s) {
    return s.isEmpty() ? new String[0] : s.split("\\|", -1);
  }

  // Numbers split by a character (none if one isn't a number).
  static int[] nums(String s, char by) {
    s = s.trim();
    if (s.isEmpty()) return new int[0];
    String[] parts = s.split(by == ' ' ? " " : String.valueOf(by));
    int[] n = new int[parts.length];
    for (int i = 0; i < parts.length; i++) {
      try {
        n[i] = Integer.parseInt(parts[i]);
      } catch (NumberFormatException e) {
        return new int[0];
      }
    }
    return n;
  }

  // Runs: END:STYLE pairs split by spaces, as END, STYLE, END, STYLE.
  static int[] runs(String s) {
    s = s.trim();
    if (s.isEmpty()) return new int[0];
    String[] parts = s.split(" ");
    int[] n = new int[parts.length * 2];
    for (int i = 0; i < parts.length; i++) {
      int colon = parts[i].indexOf(':');
      if (colon < 0) return new int[0];
      try {
        n[i * 2] = Integer.parseInt(parts[i].substring(0, colon));
        n[i * 2 + 1] = Integer.parseInt(parts[i].substring(colon + 1));
      } catch (NumberFormatException e) {
        return new int[0];
      }
    }
    return n;
  }
}
