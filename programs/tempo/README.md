# Tempo

Runs, rides and walks, recorded and kept as a log, drawn the way the games
here are: the picture is the interface (no HTML or CSS on its page).

While recording, the phone's location measures how far, how fast, and
how much you climb and descend, and nothing else: **where you went is
never kept**. The page passes Tempo each fix only as how far it is east
and north of the one before, and how much higher (it holds that one fix,
in memory, until the next comes); Tempo smooths the steps, and what it
keeps is how far was gone by each second, and how much higher or lower
than the start it was then. No position, route or height above the sea is
saved, sent, or shown. With a personal link the log is kept by a worker,
the same on every device with the link, and only there.

```sh
make tempo && .build/tempo [LOG [LIVE]]
make tempo-test                      # programs/tempo/test_tempo.l8
make web                             # the page is .build/web/tempo/
```

`LOG` is `.build/tempo-log.txt` if none, `LIVE` (a recording under way)
`.build/tempo-live.txt`. Off a page there is no location, so `L8_SIM=K`
records a made-up course K times as fast as the clock (`?sim=K` on the
page). `L8_W`, `L8_H` and `L8_UI` set the window's size and its pixels
to Tempo's (in hundredths); `L8_TZ` its minutes ahead of UTC.

## Using it

Three tabs along the bottom; a finger slides between them too.

- **Record**: pick Run, Ride or Walk, and **Start**. The chip at the top
  says whether the GPS has found the phone (it looks while this tab is
  shown, so it is ready by the time Start is tapped). Under it, this
  week's distance and time for the sport. If location is refused, it says
  how to allow it on an iPhone, with **Try again**.
- **The recording** comes up over everything, dark: the moving time big,
  the time in all, distance, the speed now and on average (a pace for runs
  and walks, a speed for rides), the last mile's time (or the top speed),
  how much it has climbed, and the last five minutes' speed. It stops counting by itself when you
  stop (at a light, say: "Auto-paused") and goes on when you do. **Pause**
  stops it; then **Resume**, or **hold to finish**. Finishing asks for a
  name (Morning run, to begin with) and shows what it came to: **Save**,
  **Resume**, or throw it away (asked twice). The screen is kept on while
  recording.
- **Log**: this month in a line; the last twelve weeks' distance as
  columns (a tap on one says what that week was); then the activities by
  the week, newest first, each with its distance, pace or speed, and time
  (a medal if it holds a record). The pills show one sport.
- **You**: miles or kilometers; light or dark (Auto follows the phone's
  own setting; the pick is kept on each device, and the colors ease from
  one to the other); each sport's totals (all time, and this
  year); each sport's records (the fastest stretch of each standard length
  ever gone; a tap opens the activity); and how the log is kept.

An activity's page slides in over them (slide it back to the right, or
the arrow): its distance, moving and elapsed time, average pace or speed,
fastest mile or top speed; its elevation (how much higher or lower than
the start it was, along the way, with the climbing and descending); its
speed through it as a chart (a finger on
it reads it: when, how far by then, how fast); its splits, a bar each;
its best efforts; and Delete (asked twice).

Keys: Space starts, pauses and resumes; Tab or `1` `2` `3` the tabs;
Escape or Backspace goes back; Enter saves when finishing.

## On an iPhone

`ios.l8` is Tempo as a native iPhone app: the same program, compiled to
arm64 by `l8 arm64 --target ios` and run by UIKit (no web view, no
wrapper). Its view is an OpenGL ES layer that takes touches and, for the
name field, the keyboard; CoreLocation watches where the phone is while
Tempo wants it, with the screen locked too, and passes each fix on only as
a step from the one before, as the page does. The log is kept in the app's
Documents, and with a personal link once the app has been opened with it:
`tempo://link#me=SECRET` (the page's link with `tempo://link` in place of
its address, opened in Safari on the phone). The app then keeps it with
the worker itself (`sync.l8`, as `tempo.js` does on the page): the
worker's log when it starts or is looked at again, and its own changes
sent a second after each save.

```sh
./l8c3 arm64 --target ios programs/tempo/ios.l8 -o tempo-ios.s
tools/ios/build.sh sim tempo-ios.s build      # on a Mac: build/Tempo.app
tools/ios/simulate.sh build/Tempo.app shots   # run it in the simulator
```

GitHub builds it on every push to the `ios` branch
(`.github/workflows/ios.yml`): a Linux job compiles it, and a macOS job
builds the app, runs it in the simulator with `L8_DEMO=1` (it records a run
by itself while the simulator walks a loop), and keeps the screenshots, the
logs and the app (`Tempo-simulator.zip`, which runs in any iOS simulator,
or online at appetize.io) as the run's artifacts and on the `ci-shots`
branch. It builds `Tempo.ipa` for an iPhone too, as **Better** (Better Late Than
Never on the App Store), which `tools/ios/sign.sh` signs on Linux, for a
phone plugged in or for TestFlight, and `tools/ios/apple.py` sends to App
Store Connect through its API (the keys in `~/.config/tempo-ios`).

## Keeping it

The log is one text file, written after each change. On the page it is
kept in the browser (IndexedDB), and, with a personal link
(`.../tempo/#me=SECRET`), in a Cloudflare D1 database by the worker in
`web/tempo-log/`: the same on every device with the link, and only for
whoever has it. Logs changed in two places are put together: each activity
is kept once, and one deleted in either stays deleted. The worker also
keeps the text from before a save (one an hour, the last 500); `admin.sh
past LINK` and `restore LINK REV` get them back.

```sh
cd web/tempo-log
./admin.sh new NAME          # a log, and its link
./admin.sh past LINK         # its texts before
```

A recording under way is written every few seconds to its own file (kept
in this browser only, never sent), so a page shut mid-run (a phone may do
that to a page left behind) takes it up again, paused.

The log's file, a line to a thing, each activity's lines after its own:

```
units mi|km
act START TZ SPORT ELAPSED MOVING DIST MAX NAME...
                 START seconds from 1970 (UTC), TZ minutes ahead of UTC,
                 SPORT run|ride|walk, seconds, DIST decimeters, MAX cm/s
sp STEP D...     decimeters gone in each STEP seconds of moving (at most 360)
up GAIN LOSS     decimeters climbed and descended
el Z...          decimeters higher than the start, at the end of each step
km S...          seconds each whole kilometer took
mi S...          the same, each mile
best S...        the fastest 1 km, 1 mile, 5 km, 10 km, half and marathon
                 (rides: 5, 10, 20, 40 km, 50 and 100 miles); 0 not gone
gone START       an activity deleted
```

## How it is built

`paint.l8` (the recipe book's) draws everything as quads one shader shapes
per pixel, in Rubik from `../skate/font.l8`. `record.l8` is the recording:
fixes smoothed (a Kalman filter on position; the phone's measured speed
for the distance where it has one, as it does not wander; heights
smoothed, and climbing counted only in steps of 3 m while moving, as a
phone's heights wander by more than that), moving or not,
the second-by-second distance, splits and fastest stretches worked out at
the end, and the recording's own file, and the simulation. `log.l8` is
the activities, adding up, and the log's file; `ui.l8` buttons, easing,
scrolling, the name field and the icons; `touch.l8` turns a finger into
taps, scrolls, slides, a chart read and a held Finish; `app.l8` is the
state and what each button does; `pages.l8` draws the pages.

On a phone a web page is watched only while it is shown: with the screen
locked, or another app in front, the browser stops passing fixes. The
screen is kept on while recording; if the page is left anyway, the
distance between the fix before and the next one is counted straight.

## Not built yet

Heart rate and cadence; calories; laps; editing an activity's name or
sport after it is saved; adding one by hand; goals; sharing.
