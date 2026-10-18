// The app's ESV fixture (../ios/esv-fixture/, committed: the WEB's words in
// the ESV's shape), made from fixtures/ by the same code the Worker answers
// with: BOOK-C.json as /api/v1/esv/chapters answers for that chapter alone,
// search-born-again.json as /api/v1/esv/search answers, and search-light.json
// (and -2, -3) its three pages for "light", made from ../data/web.txt's
// verses with the word, as the ESV API pages them (100 a page: 217, in
// three pages, so that Show More and Previous Results are seen). The app reads them
// instead of the network when L8_ESV_FIXTURE names the directory (CI).
//   node make_fixtures.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { convert } from "./esv.js";
import { searchReply } from "./worker.js";
import { BOOKS } from "./versecounts.js";

const here = new URL("./fixtures/", import.meta.url);
const out = new URL("../ios/esv-fixture/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(here).filter((f) => f.endsWith(".html"))) {
  const [book, c] = f.replace(".html", "").split("-");
  const made = convert(readFileSync(new URL(f, here), "utf8"), book, parseInt(c, 10));
  const counts = BOOKS.find((b) => b[0] === book)[2];
  const body = {
    v: 1,
    version: "ESV",
    notice: made.notice || "(ESV)",
    chapters: made.chapters.map((ch) => ({ book, chapter: ch.chapter, verses: counts[ch.chapter - 1], records: ch.records })),
  };
  writeFileSync(new URL(f.replace(".html", ".json"), out), JSON.stringify(body) + "\n");
}
const search = JSON.parse(readFileSync(new URL("search-born-again.json", here), "utf8"));
writeFileSync(new URL("search-born-again.json", out), JSON.stringify(searchReply(search)) + "\n");
// ("light": the WEB's verses with the word, in its order, as the ESV API's
// search answers, page by page.)
const hits = [];
let book = null;
let chapter = 0;
let verse = 0;
let words = "";
const flush = () => {
  if (verse && /\blight\b/i.test(words)) hits.push({ reference: `${book} ${chapter}:${verse}`, content: words.trim() });
  words = "";
};
for (const line of readFileSync(new URL("../data/web.txt", import.meta.url), "utf8").split("\n")) {
  const k = line[0];
  if (k === "B" || k === "C" || k === "V") flush();
  if (k === "B") {
    book = BOOKS.find((b) => b[0] === line.slice(1, 4))[1];
    verse = 0;
  } else if (k === "C") {
    chapter = parseInt(line.slice(1), 10);
    verse = 0;
  } else if (k === "V") verse = parseInt(line.slice(1), 10);
  else if ("TWIJ".includes(k)) words += line.slice(1);
}
flush();
const pages = Math.ceil(hits.length / 100);
for (let page = 1; page <= pages; page++) {
  const upstream = { page, total_results: hits.length, total_pages: pages, results: hits.slice((page - 1) * 100, page * 100) };
  writeFileSync(new URL(page === 1 ? "search-light.json" : `search-light-${page}.json`, out), JSON.stringify(searchReply(upstream)) + "\n");
}
writeFileSync(new URL("mode", out), "ok\n");
