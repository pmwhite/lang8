// Go To from the page's title, typed into; then Go To from the panel's
// name (the panel reading a Bible), typed into.
import { besideBible } from "./common.mjs";

export default async (h) => {
  await h.sleep(800);
  await h.mark("tap the page's title");
  await h.clickOn(".bar .title");
  await h.until("document.querySelector('.panel:not([hidden]) .pfield input') !== null");
  await h.sleep(600);
  await h.mark("type rom");
  await h.clickOn(".panel:not([hidden]) .pfield input");
  await h.type("rom");
  await h.sleep(1200);
  await h.mark("Escape");
  await h.key("Escape");
  await h.sleep(1200);
  await h.mark("panel reads WEB");
  await besideBible(h);
  await h.mark("tap the panel's name");
  await h.clickOn(".panel .pback");
  await h.until("document.querySelector('.panel:not([hidden]) .pfield input') !== null");
  await h.sleep(600);
  await h.mark("type john 3");
  await h.clickOn(".panel:not([hidden]) .pfield input");
  await h.type("john 3");
  await h.sleep(1200);
  await h.mark("Enter");
  await h.key("Enter");
  await h.sleep(2000);
};
