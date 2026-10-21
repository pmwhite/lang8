// The ESV API's HTML (v3/passage/html, with the options worker.js asks
// for) as the app's records: the format of data/bsb.txt (see
// programs/bible/text.l8), so the app lays the ESV out as any version. A
// tolerant scanner of the tags the API is known to send, no DOM:
//
//   <b class="chapter-num">3:1 </b>     C3 (a request's later chapters), V1
//   <b class="verse-num">16 </b>        V16 (3 John 1:15 V15>14, Revelation
//                                       12:18 V18>17: the BSB's numbering)
//   <h3>                                S; class psalm-book: M
//   <h4 class="psalm-title">            D; psalm-acrostic-title A; other s
//   <p>                                 Pm
//   <p class="block-indent">, lines     P1 a line, P2 an indented one
//   <span class="woc">                  W (the words of Christ)
//   <span class="divine-name">Lord      LORD (text.l8 sets small capitals)
//   <span class="selah">                words, after a space
//   <sup class="footnote"> #fN          F, with footnote N's text (less its
//                                       verse, "3:3")
//   <a class="copyright">ESV</a>        not a record: the notice, "(ESV)"
//
// The converter never changes a word: test.mjs checks that the words of
// the records are the HTML's own, less verse numbers, headings and
// footnotes.

// Verses numbered otherwise than the BSB: [book, chapter, verse, key].
export const MAPPED = [
  ["3JN", 1, 15, 14],
  ["REV", 12, 18, 17],
];

export const keyOf = (book, chapter, verse) => {
  for (const [b, c, v, k] of MAPPED) if (b === book && c === chapter && v === verse) return k;
  return verse;
};

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

export const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : "";
};

const classes = (tag) => attr(tag, "class").split(/\s+/).filter(Boolean);

// The text of a stretch of HTML, its tags dropped.
const plain = (html) => decode(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

// The footnotes block's entries: number -> text (without "3:3").
const footnotes = (html) => {
  const notes = {};
  const block = html.match(/<div class="footnotes[^"]*">([\s\S]*?)<\/div>/);
  if (!block) return notes;
  // (An entry from each footnote mark to the next: the API puts them all in
  // one <p>, a <br /> apart; the fixtures, a <p> each.)
  for (const p of block[1].split(/(?=<span class="footnote">)/)) {
    const id = p.match(/<span class="footnote">\s*<a[^>]*\bid="f(\d+)/);
    if (!id) continue;
    let body = p
      .replace(/<span class="footnote">[\s\S]*?<\/span>/, "")
      .replace(/<span class="footnote-ref">[\s\S]*?<\/span>/, "")
      .replace(/<br\s*\/?>/g, " ");
    notes[id[1]] = plain(body);
  }
  return notes;
};

// The HTML of one request (book, its first chapter) as each chapter's
// records: { chapters: [{ chapter, records }], notice }.
export const convert = (html, book, first) => {
  const notes = footnotes(html);
  let notice = "";
  // (Not text: the footnotes block, the passage's own heading, audio.)
  let body = html
    .replace(/<div class="footnotes[^"]*">[\s\S]*?<\/div>/g, "")
    .replace(/<h2[^>]*>[\s\S]*?<\/h2>/g, "")
    .replace(/<small class="audio[^"]*">[\s\S]*?<\/small>/g, "");
  body = body.replace(/<p[^>]*>\s*\(<a[^>]*class="copyright"[^>]*>([\s\S]*?)<\/a>\)\s*<\/p>/g, (m, t) => {
    notice = `(${plain(t)})`;
    return "";
  });
  const chapters = [{ chapter: first, records: [] }];
  let out = chapters[0].records;
  let chapter = first;
  let words = "";
  let woc = 0;
  let divine = 0;
  // What open tags are, to know what each closing one ends.
  const stack = [];
  // In a heading (its kind and text), and in poetry.
  let heading = null;
  let poetry = false;
  const flush = () => {
    if (words.length) out.push((woc > 0 ? "W" : "T") + words);
    words = "";
  };
  const verse = (n) => {
    flush();
    const k = keyOf(book, chapter, n);
    out.push(k !== n ? `V${n}>${k}` : `V${n}`);
  };
  const tokens = body.split(/(<[^>]*>)/);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t[0] !== "<") {
      const text = decode(t);
      if (heading) heading.text += text;
      else words += divine > 0 ? text.toUpperCase() : text;
      continue;
    }
    const close = t[1] === "/";
    const name = (t.match(/^<\/?\s*([a-z0-9]+)/i) ?? ["", ""])[1].toLowerCase();
    const cls = classes(t);
    if (name === "br" || t.endsWith("/>")) {
      if (name === "br") words += " ";
      continue;
    }
    if (!close) {
      if (name === "h3" || name === "h4") {
        flush();
        const kind = name === "h3" ? (cls.includes("psalm-book") ? "M" : "S") : cls.includes("psalm-title") ? "D" : cls.includes("psalm-acrostic-title") ? "A" : "s";
        heading = { kind, text: "" };
        stack.push(name);
      } else if (name === "p") {
        flush();
        poetry = cls.includes("block-indent");
        if (!poetry) out.push("Pm");
        stack.push("p");
      } else if (name === "b" && (cls.includes("chapter-num") || cls.includes("verse-num"))) {
        // (Its number read from the tokens up to </b>.)
        let num = "";
        let j = i + 1;
        while (j < tokens.length && !/^<\/b/i.test(tokens[j])) {
          if (tokens[j][0] !== "<") num += decode(tokens[j]);
          j++;
        }
        i = j;
        num = num.trim();
        if (cls.includes("chapter-num")) {
          const [c, v] = num.split(":").map((x) => parseInt(x, 10));
          if (c !== chapter) {
            flush();
            chapter = c;
            const next = { chapter: c, records: [] };
            chapters.push(next);
            // (The paragraph it begins in goes on in the new chapter.)
            const last = out.length ? out[out.length - 1] : "";
            if (last[0] === "P") next.records.push(out.pop());
            out = next.records;
          }
          verse(v || 1);
        } else verse(parseInt(num, 10));
      } else if (name === "sup" && cls.includes("footnote")) {
        let inner = "";
        let j = i + 1;
        while (j < tokens.length && !/^<\/sup/i.test(tokens[j])) inner += tokens[j++];
        i = j;
        const id = (inner.match(/href="#f(\d+)/) ?? [])[1];
        flush();
        out.push("F" + (notes[id] ?? ""));
      } else if (name === "span") {
        let kind = "span";
        if (cls.includes("woc")) {
          flush();
          woc++;
          kind = "woc";
        } else if (cls.includes("divine-name")) {
          divine++;
          kind = "divine";
        } else if (cls.includes("line")) {
          flush();
          out.push(cls.includes("indent") || cls.includes("indent-2") ? "P2" : "P1");
          kind = "line";
        } else if (cls.includes("selah")) {
          words += " ";
        }
        stack.push(kind);
      } else stack.push(name);
      continue;
    }
    // A closing tag: what it ends.
    const open = stack.pop();
    if ((open === "h3" || open === "h4") && heading) {
      out.push(heading.kind + heading.text.replace(/\s+/g, " ").trim());
      heading = null;
    } else if (open === "p") {
      flush();
      poetry = false;
    } else if (open === "woc") {
      flush();
      woc--;
    } else if (open === "divine") divine--;
    else if (open === "line") flush();
  }
  flush();
  for (const ch of chapters) ch.records = tidy(ch.records).join("\n");
  return { chapters, notice };
};

// Words have no space at their end; at their start only where they follow
// other words or a footnote's mark in the same line (as tools/usfm.py's
// tidy). Empty paragraphs and words go.
export const tidy = (records) => {
  const recs = records.map((r) => (r[0] === "T" || r[0] === "W" ? r[0] + r.slice(1).replace(/[\s ]+/g, " ") : r));
  const out = [];
  for (let i = 0; i < recs.length; i++) {
    let r = recs[i];
    if (r[0] === "T" || r[0] === "W") {
      let body = r.slice(1);
      const next = recs[i + 1];
      if (body.endsWith(" ") && next && (next[0] === "T" || next[0] === "W") && next[1] !== " ") recs[i + 1] = next[0] + " " + next.slice(1);
      body = body.replace(/ +$/, "");
      const prev = out[out.length - 1];
      if (!(prev && "FTW".includes(prev[0]))) body = body.replace(/^ +/, "");
      if (!body.trim()) continue;
      r = r[0] + body;
    }
    out.push(r);
  }
  // Paragraphs with no words go (P then P, or P at the end).
  const kept = [];
  for (let i = 0; i < out.length; i++) {
    const r = out[i];
    if (r[0] === "P") {
      const next = out[i + 1];
      if (!next || next[0] === "P" || "SsDAMC".includes(next[0])) continue;
    }
    kept.push(r);
  }
  return kept;
};

// The words of records (T and W), joined, no spaces: what the HTML's own
// words must be.
export const recordWords = (records) =>
  records
    .split("\n")
    .filter((r) => r[0] === "T" || r[0] === "W")
    .map((r) => r.slice(1))
    .join("")
    .replace(/\s+/g, "");

// The HTML's visible words less verse numbers, headings, footnotes and
// the notice (divine names in capitals, as the records have them).
export const htmlWords = (html) => {
  const body = html
    .replace(/<div class="footnotes[^"]*">[\s\S]*?<\/div>/g, "")
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/g, "")
    .replace(/<b class="(?:chapter|verse)-num"[^>]*>[\s\S]*?<\/b>/g, "")
    .replace(/<sup class="footnote"[^>]*>[\s\S]*?<\/sup>/g, "")
    .replace(/<small[^>]*>[\s\S]*?<\/small>/g, "")
    .replace(/<p[^>]*>\s*\(<a[^>]*class="copyright"[^>]*>[\s\S]*?<\/a>\)\s*<\/p>/g, "")
    .replace(/<span class="divine-name">([\s\S]*?)<\/span>/g, (m, t) => t.toUpperCase());
  return decode(body.replace(/<[^>]*>/g, "")).replace(/\s+/g, "");
};
