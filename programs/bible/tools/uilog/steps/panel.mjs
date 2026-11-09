// The panel opened and closed with the bar's Panel button: first with
// nothing read (Go To aimed at the panel, closed with Escape), then
// reading a Bible, closed and opened again. Best run at a phone's size
// too (--size 402x874 --mobile), where the panel is a sheet.
import { besideBible } from "./common.mjs";

export default async (h) => {
  await h.sleep(800);
  await h.mark("open the panel (nothing read)");
  await h.clickOn(".bar .shelf");
  await h.sleep(1500);
  await h.mark("Escape");
  await h.key("Escape");
  await h.sleep(1500);
  await h.mark("panel reads WEB");
  await besideBible(h);
  await h.mark("close the panel");
  await h.clickOn(".bar .shelf");
  await h.sleep(1500);
  await h.mark("open the panel");
  await h.clickOn(".bar .shelf");
  await h.sleep(2000);
  await h.mark("close the panel");
  await h.clickOn(".bar .shelf");
  await h.sleep(1500);
};
