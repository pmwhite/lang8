// versecounts.js from the app's text (../data/bsb.txt): each book's code,
// the name the ESV API is asked by, and its chapters' verse counts, in the
// ESV's numbering (the BSB's, with 3 John 1:15 and Revelation 12:18).
//   node make_versecounts.mjs
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
const text = readFileSync(new URL("../data/bsb.txt", here), "utf8");
const books = [];
let book = null;
for (const line of text.split("\n")) {
  if (line[0] === "B") {
    book = { code: line.slice(1, 4), name: line.slice(5), chapters: [] };
    books.push(book);
  } else if (line[0] === "C") book.chapters.push(0);
  else if (line[0] === "V") {
    const v = parseInt(line.slice(1), 10);
    const n = book.chapters.length - 1;
    if (v > book.chapters[n]) book.chapters[n] = v;
  }
}
const extra = { "3JN": [1, 15], REV: [12, 18] };
for (const b of books) {
  const e = extra[b.code];
  if (e) b.chapters[e[0] - 1] = e[1];
  if (b.code === "PSA") b.name = "Psalm";
}
const lines = books.map((b) => `  ["${b.code}", "${b.name}", [${b.chapters.join(", ")}]],`);
writeFileSync(
  new URL("versecounts.js", here),
  `// Made by make_versecounts.mjs from ../data/bsb.txt: each book's code, the
// name the ESV API is asked by, and its chapters' verses (the ESV's
// numbering: the BSB's, with 3 John 1:15 and Revelation 12:18).
export const BOOKS = [
${lines.join("\n")}
];
`,
);
