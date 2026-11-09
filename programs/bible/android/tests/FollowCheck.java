package space.trailingwhite.smoothbible;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.OptionalDouble;

// Android's following (Follow.java) checked against core's rules: every
// case programs/bible/tools/link_cases.l8 writes (its format is at the top
// of that file) worked out here and compared, a place within a hundredth
// of a point, an anchor or a chapter exactly.
//
//   programs/bible/android/follow_test.sh .build/link-cases.txt
final class FollowCheck {
  private static final double CLOSE_ENOUGH = 0.01;

  public static void main(String[] args) throws IOException {
    if (args.length != 1) {
      System.err.println("usage: FollowCheck LINK_CASES.txt");
      System.exit(2);
    }
    List<String> lines = Files.readAllLines(Path.of(args[0]));
    Cases cases = new Cases();
    for (int at = 0; at < lines.size(); at++) {
      String line = lines.get(at).trim();
      if (!line.isEmpty()) cases.take(at + 1, line.split(" +"));
    }
    if (cases.checked == 0) {
      System.err.println(args[0] + ": no cases in it");
      System.exit(1);
    }
    if (cases.failed > 0) {
      System.err.println(cases.failed + " of " + cases.checked + " cases differ from core's rules");
      System.exit(1);
    }
    System.out.println(cases.checked + " cases of following match core's rules");
  }

  // The cases' lines as they come: what the case asks, its maps and
  // shapes, then what is expected.
  private static final class Cases {
    String asks;
    int asksLine;
    int mode, comments;
    double[] numbers;
    Follow.Links links;
    Follow.LinkMap map;
    Follow.ChapterShape page;
    int anchor, placeFrac;
    double readingLine;
    int checked, failed;

    void take(int lineNumber, String[] w) {
      switch (w[0]) {
        case "bottom":
        case "top":
          asks = w[0];
          asksLine = lineNumber;
          mode = Integer.parseInt(w[1]);
          comments = (int) Double.parseDouble(w[2]);
          numbers = new double[w.length - 3];
          for (int i = 3; i < w.length; i++) numbers[i - 3] = Double.parseDouble(w[i]);
          links = new Follow.Links();
          break;
        case "map":
          map = readMap(w, mode, comments);
          break;
        case "page":
          page = readShape(w, 1);
          break;
        case "panel":
          links.add(map, page, readShape(w, 1));
          break;
        case "glide":
          asks = "glide";
          asksLine = lineNumber;
          numbers = new double[] {Double.parseDouble(w[1]), Double.parseDouble(w[2]), Double.parseDouble(w[3]), Double.parseDouble(w[4])};
          break;
        case "place":
          asks = "place";
          asksLine = lineNumber;
          anchor = Integer.parseInt(w[1]);
          placeFrac = Integer.parseInt(w[2]);
          break;
        case "at":
          asks = "at";
          asksLine = lineNumber;
          readingLine = Double.parseDouble(w[1]);
          break;
        case "expect":
          check(lineNumber, w);
          break;
        default:
          throw new IllegalArgumentException("line " + lineNumber + ": not a case's line: " + w[0]);
      }
    }

    private void check(int lineNumber, String[] w) {
      String expected = String.join(" ", java.util.Arrays.copyOfRange(w, 1, w.length));
      String got;
      boolean same;
      switch (asks == null ? "" : asks) {
        case "bottom":
        case "top": {
          OptionalDouble y = asks.equals("bottom") ? Follow.bottomMove(links, numbers[0], numbers[1], numbers[2])
              : Follow.topMove(links, numbers[0], numbers[1], numbers[2], numbers[3]);
          got = y.isPresent() ? String.format("to %.4f", y.getAsDouble()) : "stay";
          same = expected.equals("stay") ? !y.isPresent()
              : y.isPresent() && Math.abs(y.getAsDouble() - Double.parseDouble(expected.substring(3))) <= CLOSE_ENOUGH;
          break;
        }
        case "glide": {
          double y = Follow.glide(numbers[0], numbers[1], numbers[2], numbers[3]);
          got = String.format("%.4f", y);
          same = Math.abs(y - Double.parseDouble(expected)) <= CLOSE_ENOUGH;
          break;
        }
        case "place": {
          double y = Follow.placeY(page, anchor, placeFrac);
          got = String.format("%.4f", y);
          same = Math.abs(y - Double.parseDouble(expected)) <= CLOSE_ENOUGH;
          break;
        }
        case "at": {
          int[] p = Follow.linePlace(page, readingLine);
          got = p[0] + " " + p[1];
          same = got.equals(expected);
          break;
        }
        default:
          throw new IllegalArgumentException("line " + lineNumber + ": an expect with no case before it");
      }
      checked++;
      if (!same) {
        failed++;
        if (failed <= 10)
          System.err.println("line " + asksLine + " (" + asks + "): expected " + expected + ", got " + got);
      }
      asks = null;
    }
  }

  // `map I0 I1 J ...`.
  private static Follow.LinkMap readMap(String[] w, int mode, int comments) {
    int n = (w.length - 1) / 3;
    int[] i0 = new int[n], i1 = new int[n], j = new int[n];
    for (int k = 0; k < n; k++) {
      i0[k] = Integer.parseInt(w[1 + 3 * k]);
      i1[k] = Integer.parseInt(w[2 + 3 * k]);
      j[k] = Integer.parseInt(w[3 + 3 * k]);
    }
    return new Follow.LinkMap(mode, comments, i0, i1, j);
  }

  // `page TOP END START...` or `panel ...`, `-` not laid out.
  private static Follow.ChapterShape readShape(String[] w, double em) {
    int n = w.length - 3;
    double[] starts = new double[n];
    boolean[] known = new boolean[n];
    for (int k = 0; k < n; k++) {
      known[k] = !w[3 + k].equals("-");
      if (known[k]) starts[k] = Double.parseDouble(w[3 + k]);
    }
    boolean topKnown = !w[1].equals("-"), endKnown = !w[2].equals("-");
    return new Follow.ChapterShape(starts, known, topKnown ? Double.parseDouble(w[1]) : 0, topKnown,
        endKnown ? Double.parseDouble(w[2]) : 0, endKnown, em);
  }
}
