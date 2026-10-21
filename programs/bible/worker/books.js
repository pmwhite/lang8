// The reader's addresses' names (WEB.md §W2.1a): each book's code, its
// name (the BSB's, which every bundled version shares) and its slug in
// /read/<version>/<slug>/<n>, in order; its chapters are versecounts.js's.
// Made from ../data/bsb.txt's B lines.
import { BOOKS } from "./versecounts.js";

export const NAMES = [
  ["GEN", "Genesis", "genesis"],
  ["EXO", "Exodus", "exodus"],
  ["LEV", "Leviticus", "leviticus"],
  ["NUM", "Numbers", "numbers"],
  ["DEU", "Deuteronomy", "deuteronomy"],
  ["JOS", "Joshua", "joshua"],
  ["JDG", "Judges", "judges"],
  ["RUT", "Ruth", "ruth"],
  ["1SA", "1 Samuel", "1-samuel"],
  ["2SA", "2 Samuel", "2-samuel"],
  ["1KI", "1 Kings", "1-kings"],
  ["2KI", "2 Kings", "2-kings"],
  ["1CH", "1 Chronicles", "1-chronicles"],
  ["2CH", "2 Chronicles", "2-chronicles"],
  ["EZR", "Ezra", "ezra"],
  ["NEH", "Nehemiah", "nehemiah"],
  ["EST", "Esther", "esther"],
  ["JOB", "Job", "job"],
  ["PSA", "Psalms", "psalms"],
  ["PRO", "Proverbs", "proverbs"],
  ["ECC", "Ecclesiastes", "ecclesiastes"],
  ["SNG", "Song of Solomon", "song-of-solomon"],
  ["ISA", "Isaiah", "isaiah"],
  ["JER", "Jeremiah", "jeremiah"],
  ["LAM", "Lamentations", "lamentations"],
  ["EZK", "Ezekiel", "ezekiel"],
  ["DAN", "Daniel", "daniel"],
  ["HOS", "Hosea", "hosea"],
  ["JOL", "Joel", "joel"],
  ["AMO", "Amos", "amos"],
  ["OBA", "Obadiah", "obadiah"],
  ["JON", "Jonah", "jonah"],
  ["MIC", "Micah", "micah"],
  ["NAM", "Nahum", "nahum"],
  ["HAB", "Habakkuk", "habakkuk"],
  ["ZEP", "Zephaniah", "zephaniah"],
  ["HAG", "Haggai", "haggai"],
  ["ZEC", "Zechariah", "zechariah"],
  ["MAL", "Malachi", "malachi"],
  ["MAT", "Matthew", "matthew"],
  ["MRK", "Mark", "mark"],
  ["LUK", "Luke", "luke"],
  ["JHN", "John", "john"],
  ["ACT", "Acts", "acts"],
  ["ROM", "Romans", "romans"],
  ["1CO", "1 Corinthians", "1-corinthians"],
  ["2CO", "2 Corinthians", "2-corinthians"],
  ["GAL", "Galatians", "galatians"],
  ["EPH", "Ephesians", "ephesians"],
  ["PHP", "Philippians", "philippians"],
  ["COL", "Colossians", "colossians"],
  ["1TH", "1 Thessalonians", "1-thessalonians"],
  ["2TH", "2 Thessalonians", "2-thessalonians"],
  ["1TI", "1 Timothy", "1-timothy"],
  ["2TI", "2 Timothy", "2-timothy"],
  ["TIT", "Titus", "titus"],
  ["PHM", "Philemon", "philemon"],
  ["HEB", "Hebrews", "hebrews"],
  ["JAS", "James", "james"],
  ["1PE", "1 Peter", "1-peter"],
  ["2PE", "2 Peter", "2-peter"],
  ["1JN", "1 John", "1-john"],
  ["2JN", "2 John", "2-john"],
  ["3JN", "3 John", "3-john"],
  ["JUD", "Jude", "jude"],
  ["REV", "Revelation", "revelation"],
];

export const VERSIONS = {
  bsb: "Berean Standard Bible",
  kjv: "King James Version",
  web: "World English Bible",
  asv: "American Standard Version",
  ylt: "Young’s Literal Translation",
  esv: "English Standard Version",
};

// A reader's address as a passage: { version, name ("John 3", "Psalm 23",
// "Jude"), versionName }, or null.
export function passage(path) {
  const m = /^\/read\/(bsb|kjv|web|asv|ylt|esv)\/([a-z0-9-]+)\/(\d{1,3})$/.exec(path);
  if (!m) return null;
  const i = NAMES.findIndex((b) => b[2] === m[2]);
  if (i < 0) return null;
  const chapters = BOOKS[i][2].length;
  const n = Number(m[3]);
  if (n < 1 || n > chapters) return null;
  const name = chapters === 1 ? NAMES[i][1] : `${NAMES[i][0] === "PSA" ? "Psalm" : NAMES[i][1]} ${n}`;
  return { version: m[1], name, versionName: VERSIONS[m[1]] };
}
