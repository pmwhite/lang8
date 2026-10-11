// How good a picture the device is asked for, kept to what it can draw in
// time: as many frames as its screen shows first, and then as fine a
// picture as that leaves room for.
//
// The picture's quality is a ladder of rungs, from the best (0) down: the
// caller says how many, and what each is (see skate.js: sizes of picture,
// and at the foot, plainer surfaces). The screen shows a frame every so
// often (its beat, found from the frames that come while nothing is
// drawn); a frame that misses a beat is not shown until the next, so what
// can be had is a frame every beat, every second one, every third: a count
// of beats to a frame, which is what this aims at (`beats`). A frame is
// late that takes a beat more than that.
//
//   Down, fast. A few frames late running (three; more on a device that
//   is often late anyway), and it is a rung down at once, two if they are
//   later still, and as many as it takes if it is far behind: a device
//   that falls behind has fewer pixels to draw within a few frames. So is
//   one frame in ten late over a couple of seconds. A late frame on its
//   own, as any device has now and then for reasons of its own, changes
//   nothing.
//
//   But only if it helps. A second and a half after a rung down, if as
//   many frames are late as before it, it was not the picture that made
//   them so: the rung is given back, and that many late frames are taken
//   for how this device is.
//
//   Up, with care. After a quiet while it tries a rung up. If that rung
//   does not hold (it is back down within half a minute, and that plainly
//   helped), it waits twice as long before it tries again, up to some
//   minutes: so it finds the best rung that holds, and soon stops knocking
//   at the one above it. A rung that does hold halves the wait, so that
//   after a hard spell it is soon back up.
//
//   Fewer frames, when it must. At the foot of the ladder and still late,
//   the device cannot draw a frame every beat whatever is asked of it: it
//   aims at one every second beat instead (or third), and climbs the
//   ladder again under that easier aim. Should frames then start coming
//   sooner than aimed at, the aim tightens again; and every few minutes it
//   tries for it from the foot, coming back to where it was if that fails.
//
// Times are in milliseconds.
const HOLD = 2500;
const HOLD_MOST = 120000;
const PROBE = 30000;
const SETTLED = 2000;
const SECOND = 60;
const LONG = 90;
const RETRY = 180000;
const RETRY_MOST = 1200000;

// `work` is how much each rung asks of the device, of what the best asks
// (its share of the pixels, say): a device far behind is taken down as
// many rungs at once as that says it needs.
export function createPacer({ work, rung = 0, beats = 1, beat = 1000 / 60 }) {
  const rungs = work.length;
  const s = {
    rung: Math.min(Math.max(rung, 0), rungs - 1),
    beats: Math.max(1, beats),
    beat,
    // Late or not (and early or not, and how long they took), the last
    // frames since anything changed; how many to pass over, a change
    // taking a frame or two to show; how many have been late running; and
    // how many there have been.
    late: [],
    early: [],
    gaps: [],
    skip: 0,
    run: 0,
    n: 0,
    // The share of frames late of late, and over a longer while; and the
    // share that are late on this device whatever is drawn, as far as it
    // has found (see the trial of a rung down).
    rate: 0,
    slow: 0,
    least: Infinity,
    seen: 0,
    base: 0,
    // A rung down on trial: the share late before it, and the frames since.
    trial: null,
    // When anything last changed; how long a quiet spell earns a rung up;
    // when it last went up (how long it had waited to, and whether that
    // has since been shortened); when the aim last eased, and how long
    // until it is tried for again; and the rung it has come down from in
    // this spell of late frames, to go back to if the aim eases.
    changed: -Infinity,
    hold: HOLD,
    up: -Infinity,
    held: HOLD,
    eager: false,
    eased: 0,
    retry: RETRY,
    from: -1,
    // (Frames quicker than the beat it believes in: the beat may be wrong.)
    quick: 0,
    quickMean: beat,
  };
  const share = (flags, n) => {
    const from = Math.max(0, flags.length - n);
    let k = 0;
    for (let i = from; i < flags.length; i++) k += flags[i];
    return flags.length > from ? k / (flags.length - from) : 0;
  };
  const fresh = (t) => {
    s.late.length = 0;
    s.early.length = 0;
    s.gaps.length = 0;
    s.run = 0;
    s.n = 0;
    s.skip = 2;
    s.rate = s.base;
    s.changed = t;
  };
  return {
    state: s,
    // A frame came with nothing drawn: the screen's own beat.
    idle(gap) {
      if (gap > 3 && gap < 60) s.beat += (gap - s.beat) * 0.1;
    },
    // A frame came, drawn, `gap` after the one before, at time t: the rung
    // to draw the next at.
    frame(gap, t) {
      // (A screen may beat faster while it is played on than at rest.)
      const quick = gap < 0.75 * s.beat && gap > 3;
      s.quick += ((quick ? 1 : 0) - s.quick) * 0.02;
      if (quick) s.quickMean += (gap - s.quickMean) * 0.2;
      if (s.quick > 0.25) {
        s.beat = s.quickMean;
        s.quick = 0;
      }
      if (s.skip > 0) {
        s.skip--;
        return s.rung;
      }
      // (Late by half a beat; and by a little more, the more beats it
      // aims at, long frames being less even.)
      const aim = s.beats * s.beat;
      const slack = 0.5 * s.beat + 0.1 * (aim - s.beat);
      const late = gap > aim + slack;
      s.late.push(late ? 1 : 0);
      s.early.push(s.beats > 1 && gap < aim - slack ? 1 : 0);
      s.gaps.push(gap);
      if (s.late.length > LONG) {
        s.late.shift();
        s.early.shift();
        s.gaps.shift();
      }
      s.run = late ? s.run + 1 : 0;
      s.n++;
      s.rate += ((late ? 1 : 0) - s.rate) / (2 * SECOND);
      // (It is late no oftener, whatever is drawn, than it has been over
      // the last many frames with this drawn.)
      s.slow += ((late ? 1 : 0) - s.slow) / (10 * SECOND);
      if (s.slow < s.base) s.base += (s.slow - s.base) * 0.01;
      // (Nor any less often than the least it has been, over any such
      // while: which creeps up, in case that was long ago.)
      if (++s.seen > 10 * SECOND) s.least = Math.min(s.slow, s.least + Math.max(0, s.slow - s.least) * 0.00005);
      if (s.least < s.base || s.least === Infinity) { } else s.base = s.least;
      const running = s.base < 0.02 ? 3 : s.base < 0.05 ? 4 : 5;
      // A rung down on trial has had its time: given back if it did not
      // help; and if it did, the rung above it did not hold.
      if (s.trial && ++s.trial.frames >= LONG) {
        const after = share(s.late, LONG);
        const before = s.trial.before;
        s.trial = null;
        if (after > 0.5 * before && s.run < running) {
          s.base = Math.max(s.base, after);
          s.rung = Math.max(0, s.rung - 1);
          fresh(t);
          return s.rung;
        }
        // (Twice as long as before that try, however it has shortened since.)
        if (t - s.up < PROBE && after <= 0.35 * before) {
          s.hold = Math.min(s.held * 2, HOLD_MOST);
          s.up = -Infinity;
        }
      }
      // Down.
      const often = !s.trial && s.n >= 2 * SECOND && s.rate >= Math.max(0.1, s.base + 0.07);
      if (s.run >= running || often) {
        if (s.rung < rungs - 1) {
          if (s.from < 0) s.from = s.rung;
          s.trial = { before: Math.max(s.rate, share(s.late, SECOND)), frames: 0 };
          // (Two, if it is a beat later still; and if it is taking
          // several times as long as aimed at, as far as its work must
          // fall for it to be in time.)
          let to = s.rung + (gap > aim + 1.5 * s.beat && s.run >= running ? 2 : 1);
          if (s.run >= running && gap > 2.5 * aim) {
            const want = (work[s.rung] * aim) / (gap - s.beat);
            while (to < rungs - 1 && work[to] > want) to++;
          }
          s.rung = Math.min(rungs - 1, to);
          const rate = s.rate;
          fresh(t);
          s.rate = rate;
        } else if ((s.late.length >= LONG / 2 || (s.late.length >= 8 && t - s.changed > 1500)) && share(s.late, LONG) >= 0.3) {
          // (Not even at the foot: fewer frames, as many as it is making
          // there, and back to the rung it came down from, to do what it
          // can under that. If the foot was nowhere near in time, it is
          // long before it tries for this again.)
          const middle = [...s.gaps].sort((a, b) => a - b)[s.gaps.length >> 1];
          if (middle > aim + 0.9 * s.beat) s.retry = RETRY_MOST;
          s.beats = Math.max(s.beats + 1, Math.round(middle / s.beat));
          s.eased = t;
          s.trial = null;
          if (s.from >= 0) s.rung = s.from;
          s.from = -1;
          s.base = 0;
          fresh(t);
        }
        return s.rung;
      }
      // Sooner than aimed at, most of them: aim at that.
      if (s.beats > 1 && s.early.length >= LONG / 2 && share(s.early, LONG) >= 0.6) {
        s.beats--;
        s.from = -1;
        fresh(t);
        return s.rung;
      }
      // (A rung up that has held a few seconds: the next may be tried
      // sooner. One that has held half a minute has held.)
      if (s.up > -Infinity && !s.eager && t - s.up >= 2 * HOLD) {
        s.hold = Math.max(HOLD, s.hold / 2);
        s.eager = true;
      }
      if (t - s.up >= PROBE) s.up = -Infinity;
      const quiet = !s.trial && s.rate <= Math.max(0.04, s.base + 0.03);
      // (Settled where it is: there is nowhere it came down from.)
      if (quiet && t - s.changed > SETTLED) s.from = -1;
      // Up.
      if (s.rung > 0 && quiet && t - s.changed >= s.hold) {
        s.rung--;
        s.up = t;
        s.held = s.hold;
        s.eager = false;
        fresh(t);
        return s.rung;
      }
      // And for more frames again, from the foot, now and then.
      if (s.beats > 1 && quiet && t - s.eased >= s.retry && t - s.changed >= HOLD) {
        s.from = s.rung;
        s.beats--;
        s.eased = t;
        s.retry = Math.min(s.retry * 2, RETRY_MOST);
        s.base = 0;
        fresh(t);
      }
      return s.rung;
    },
  };
}
