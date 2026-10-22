package space.trailingwhite.smoothbible;

import java.util.ArrayList;

// A screen as core built it (SKINS.md): its sections and rows.
final class Screen {
  int id, kind, arg;
  String title = "", search = "";
  // The row shown first as it opens (of all its rows, in order; -1: none).
  int focus = -1;
  // Its field: the words in it, how long typing rests before they are
  // sent (ms), whether Return goes (Go To) and whether it takes the keys as
  // the screen opens; its scopes (titles, what TalkBack says) and the one
  // chosen; and whether its list is plain.
  String searchText = "";
  int wait, scope;
  boolean go, focusField, plain;
  String[] scopes = new String[0], scopeLabels = new String[0];
  // Words above its first section, whether its focus row is selected too,
  // and the button at its foot (its action, argument, title and style:
  // 0 plain, 1 prominent, 2 destructive, 3 off).
  String intro = "", toolbar = "";
  boolean focusSelect;
  int toolAction, toolArg, toolStyle;
  // What it shows with no rows, and its button's title and commands.
  String emptySymbol = "", emptyTitle = "", emptyLine = "", button = "";
  final ArrayList<Command> commands = new ArrayList<>();

  static final class Command {
    int action, arg;
    String title = "";
    boolean destructive;
  }
  final ArrayList<Section> sections = new ArrayList<>();

  static final class Section {
    String header = "", footer = "", button = "";
    int buttonAction;
    final ArrayList<Row> rows = new ArrayList<>();
  }

  static final class Row {
    String kind = "", title = "", detail = "", icon = "", acc = "", flags = "", options = "",
        label = "", trailing = "", hint = "";
    int action, arg, value, lo, hi, deleteAction, custom, lines, circle, circleAction;
    // Places in the detail to stress: pairs of UTF-16 offsets.
    int[] marks = new int[0];

    boolean flag(char c) {
      return flags.indexOf(c) >= 0;
    }
  }

  // A row line: row KIND ACTION ARG TITLE DETAIL ICON ACC FLAGS VALUE OPTIONS LO HI.
  static Row row(Wire w) {
    Row r = new Row();
    r.kind = w.field(1);
    r.action = w.fieldNum(2);
    r.arg = w.fieldNum(3);
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
    r.lines = w.fieldNum(19);
    r.circle = w.fieldNum(20);
    r.circleAction = w.fieldNum(21);
    String m = w.field(18).trim();
    if (!m.isEmpty()) {
      String[] parts = m.split(" ");
      r.marks = new int[parts.length];
      for (int i = 0; i < parts.length; i++) {
        try {
          r.marks[i] = Integer.parseInt(parts[i]);
        } catch (NumberFormatException e) {
          r.marks = new int[0];
          break;
        }
      }
    }
    return r;
  }
}
