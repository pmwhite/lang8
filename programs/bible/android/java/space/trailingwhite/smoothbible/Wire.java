package space.trailingwhite.smoothbible;

// A line of the wire (SKINS.md): its fields split by tabs, each unescaped
// (\t, \n, \\), and the space-separated words of its first field.
final class Wire {
  final String[] fields;
  final String[] words;

  Wire(String line) {
    String[] raw = line.split("\t", -1);
    fields = new String[raw.length];
    for (int i = 0; i < raw.length; i++) fields[i] = unescape(raw[i]);
    words = fields[0].split(" ");
  }

  String word(int i) {
    return i < words.length ? words[i] : "";
  }

  int num(int i) {
    try {
      return i < words.length ? Integer.parseInt(words[i]) : 0;
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  String field(int i) {
    return i < fields.length ? fields[i] : "";
  }

  int fieldNum(int i) {
    try {
      return Integer.parseInt(field(i));
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  // A field's number as a long (a reference: chapters and verses packed).
  long fieldLong(int i) {
    try {
      return Long.parseLong(field(i));
    } catch (NumberFormatException e) {
      return 0;
    }
  }

  static String unescape(String s) {
    if (s.indexOf('\\') < 0) return s;
    StringBuilder b = new StringBuilder(s.length());
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (c == '\\' && i + 1 < s.length()) {
        char n = s.charAt(++i);
        b.append(n == 't' ? '\t' : n == 'n' ? '\n' : n);
      } else b.append(c);
    }
    return b.toString();
  }
}
