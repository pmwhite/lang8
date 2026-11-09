// Linked flicks: the page leading, then the panel, with a Bible beside;
// then the same with a commentary beside.
import { besideBible, besideCommentary } from "./common.mjs";

export default async (h) => {
  await besideBible(h);
  await h.mark("Bible beside: flick the page down");
  await h.flick(300, 500, 900);
  await h.sleep(2000);
  await h.mark("Bible beside: flick the panel down");
  await h.flick(950, 500, 900);
  await h.sleep(2000);
  await h.mark("Bible beside: flick the page up");
  await h.flick(300, 400, -600);
  await h.sleep(2000);
  await besideCommentary(h);
  await h.mark("commentary beside: flick the page down");
  await h.flick(300, 500, 900);
  await h.sleep(2500);
  await h.mark("commentary beside: flick the panel down");
  await h.flick(950, 500, 900);
  await h.sleep(2500);
  await h.mark("commentary beside: flick the page up");
  await h.flick(300, 400, -600);
  await h.sleep(2500);
};
