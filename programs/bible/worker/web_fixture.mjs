// Fixtures in the ESV's shape with the WEB's words (as JHN-4.html), made from
// ../data/web.txt for chapters of John (DESIGN.md §9.4.11's glide: JHN 5-8):
//   node web_fixture.mjs ../data/web.txt fixtures 5 6 7 8
// then their .records, by esv.js's convert (as test.mjs checks them).
import { readFileSync, writeFileSync } from "node:fs";
const [web, outdir, ...chs] = process.argv.slice(2);
const lines = readFileSync(web, "utf8").split("\n");
let book = null, ch = 0;
const want = new Set(chs.map(Number));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const parts = {};
let cur = null;
for (const line of lines) {
  const k = line[0];
  if (k === "B") { book = line.slice(1, 4); cur = null; continue; }
  if (k === "C") { ch = parseInt(line.slice(1), 10); cur = book === "JHN" && want.has(ch) ? (parts[ch] = []) : null; continue; }
  if (cur) cur.push(line);
}
for (const c of Object.keys(parts)) {
  const id = (v) => `43${String(c).padStart(3, "0")}${String(v).padStart(3, "0")}`;
  let html = `<h2 class="extra_text">John ${c} <small class="audio extra_text">(<a class="mp3link" href="https://audio.esv.org/x.mp3" title="JHN ${c}" type="audio/mpeg">Listen</a>)</small></h2>\n`;
  html += `<h3 id="p${id(1)}_01-1">Fixture: John ${c}, in the words of the WEB</h3>\n`;
  let open = false, verse = 0, first = true, para = "";
  const close = () => { if (open) { html += para + "</p>\n"; open = false; para = ""; } };
  for (const line of parts[c]) {
    const k = line[0];
    if (k === "P") { close(); }
    else if (k === "V") {
      verse = parseInt(line.slice(1), 10);
      if (!open) { para = `<p id="p${id(verse)}_01-1"${first ? ' class="starts-chapter"' : ""}>`; open = true; }
      para += first ? `<b class="chapter-num" id="v${id(verse)}-1">${c}:${verse}&nbsp;</b>` : `<b class="verse-num" id="v${id(verse)}-1">${verse}&nbsp;</b>`;
      first = false;
    } else if (k === "T") para += esc(line.slice(1));
    else if (k === "W") para += `<span class="woc">${esc(line.slice(1))}</span>`;
  }
  close();
  html += `<p>(<a href="http://www.esv.org" class="copyright">ESV</a>)</p>\n`;
  writeFileSync(`${outdir}/JHN-${c}.html`, html);
}
