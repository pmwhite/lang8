// The app's ESV fixture (../ios/esv-fixture/, committed: the WEB's words in
// the ESV's shape), made from fixtures/ by the same code the Worker answers
// with: BOOK-C.json as /api/v1/esv/chapters answers for that chapter alone,
// search-born-again.json as /api/v1/esv/search answers. The app reads them
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
writeFileSync(new URL("mode", out), "ok\n");
