// What the steps files share: the panel reading a document beside the
// page, chosen from Go To as a person would.
const rowsMatch = (pattern) => `[...document.querySelectorAll('.panel .plist [role=button]')].some(e => ${pattern}.test(e.innerText))`;

// The panel open on Go To (the bar's Panel button with nothing read), or
// Go To from the panel's name when it reads something.
export async function openPanelGoTo(h) {
  if (await h.ev("document.querySelector('.pback.named') !== null && document.querySelector('.panel:not([hidden]) .pback') !== null")) await h.clickOn(".panel .pback");
  else await h.clickOn(".bar .shelf");
  return h.until(rowsMatch("/World English Bible/"));
}

// The panel reading the World English Bible beside the page.
export async function besideBible(h) {
  await openPanelGoTo(h);
  await h.clickOn(".panel .plist [role=button]", /World English Bible/);
  await h.until("document.querySelector('.preader [data-v]') !== null");
  await h.sleep(1200);
}

// The panel reading Clarke's commentary (downloaded through the site's
// Worker the first time: a few seconds).
export async function besideCommentary(h) {
  await openPanelGoTo(h);
  await h.clickOn(".panel .plist [role=button]", /^Commentaries/);
  await h.until(rowsMatch("/Adam Clarke/"));
  await h.clickOn(".panel .plist [role=button]", /Adam Clarke/);
  await h.until("(() => { const p = document.querySelector('.panel:not([hidden])'); return p && !/Opening|Downloading/.test(p.innerText) && document.querySelectorAll('.preader p').length > 3; })()", 30000);
  await h.sleep(1500);
}
