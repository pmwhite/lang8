package space.trailingwhite.smoothbible;

import java.util.ArrayList;

// A screen as core built it (SKINS.md): its sections and rows.
final class Screen {
  int id, kind, arg;
  String title = "", search = "";
  final ArrayList<Section> sections = new ArrayList<>();

  static final class Section {
    String header = "", footer = "";
    final ArrayList<Row> rows = new ArrayList<>();
  }

  static final class Row {
    String kind = "", title = "", detail = "", icon = "", acc = "", flags = "", options = "";
    int action, arg, value, lo, hi;

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
    return r;
  }
}
