// Swap Panes from the panel's More menu, and back.
import { besideBible } from "./common.mjs";

export default async (h) => {
  await besideBible(h);
  for (const round of ["swap", "swap back"]) {
    await h.mark(`open More (${round})`);
    await h.clickOn(".panel:not([hidden]) .pbartools [aria-label=More]");
    await h.until("document.querySelector('.menu') !== null", 3000);
    await h.sleep(500);
    await h.mark(`Swap Panes (${round})`);
    await h.clickOn(".menu button", /Swap Panes/);
    await h.sleep(2500);
  }
};
