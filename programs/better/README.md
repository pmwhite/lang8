# Better

Runs, rides and walks, recorded and kept as a log, drawn the way the games
here are: the picture is the interface (no HTML or CSS on its page).

While recording, the phone's location measures how far, how fast, and
how much you climb and descend, and nothing else: **where you went is
never kept**. The page passes Better each fix only as how far it is east
and north of the one before, and how much higher (it holds that one fix,
in memory, until the next comes); Better smooths the steps, and what it
keeps is how far was gone by each second, and how much higher or lower
than the start it was then. No position, route or height above the sea is
saved, sent, or shown. Signed in to an account, the log is kept by a
worker, the same on every device signed in to it, and only there.

```sh
make better && .build/better [LOG [LIVE]]
L8_PEOPLE=demo .build/better           # a made-up account and friends
make web                             # the page is .build/web/better/
```

`LOG` is `.build/better-log.txt` if none, `LIVE` (a recording under way)
`.build/better-live.txt`. Off a page there is no location, so `L8_SIM=K`
records a made-up course K times as fast as the clock (`?sim=K` on the
page). `L8_W`, `L8_H` and `L8_UI` set the window's size and its pixels
to Better's (in hundredths); `L8_TZ` its minutes ahead of UTC.
`L8_PEOPLE=demo` (`?people=demo` on the page) makes up an account, an
admin's, with three friends and their weeks and a list of people, with no
worker; `many` has eight friends, `alone` none, `offline` cannot reach the
worker, and `out` is signed out (see `people.l8` for codes that are answered
as wrong, used and so on).

## Using it

Three tabs along the bottom (four signed in: Friends, before You); a
finger slides between them too.

- **Record**: pick Run, Ride or Walk, and **Start**. The chip at the top
  says whether the GPS has found the phone (it looks while this tab is
  shown, so it is ready by the time Start is tapped). Under it, this
  week's distance and time for the sport. If location is refused, it says
  how to allow it on an iPhone, with **Try again**.
- **Goal pace** (a speed for rides), set for each sport with a switch and
  − and + (5 s a mile or km for a run, 15 for a walk, half a mph or km/h
  for a ride; kept on each device). The goal is an *effort pace*: the
  pace that effort would give on the flat, so a hill asks for less speed
  and allows more down it (`pace.l8` has the model: ACSM-like for runs,
  Minetti's measured costs for walks, the power it takes for rides).
  While recording, a card shows the effort pace over the last 150 m or so,
  the grade, and a gauge against the goal; and soft chimes say when it is
  off by more than 6% for 15 s: two notes up, faster; two down, ease off;
  one, back on it. A chime is said again only a minute later, then two,
  then four; nothing in the first minute, after a stop, while the grade
  is changing, or (for faster) downhill or for half a minute after. On an
  iPhone they play with the screen locked, over music, which ducks for
  the moment.
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
- **Friends** (signed in): friends' runs, rides and walks of the last four
  weeks, by the week, with whose each is and when; each friend's alone
  (picked out by name), with since when, and **Remove** (asked twice).
  **+ Add**: **Send a code** (the share sheet: Messages, say), or enter one
  that came. Friends see each other's last four weeks, and only when, the
  sport, how long and far, its name and the climbing: never where.
- **You**: the account (**Sign in**, or its name: its page);
  miles or kilometers; light or dark (Auto follows the phone's
  own setting; the pick is kept on each device, and the colors ease from
  one to the other); each sport's totals (all time, and this
  year); each sport's records (the fastest stretch of each standard length
  ever gone; a tap opens the activity); and the goal's chimes, on or off,
  with **Hear them**.

An activity's page slides in over them (slide it back to the right, or
the arrow): its distance, moving and elapsed time, average pace or speed,
fastest mile or top speed; its elevation (how much higher or lower than
the start it was, along the way, with the climbing and descending, and its
effort pace: what it was with the hills taken out); its
speed through it as a chart (a finger on
it reads it: when, how far by then, how fast); its splits, a bar each;
its best efforts; and Delete (asked twice).

Keys: Space starts, pauses and resumes; Tab or `1` to `4` the tabs;
Escape or Backspace goes back; Enter saves when finishing, and sends a code
or a name.

## Accounts and friends

A log is an account. **Sign in** (on You) takes a code of 8 letters and
digits (`K7QM-3XPA`; big or small, dashes and spaces left out, or the whole
link pasted); every code comes with a link too,
`https://trailingwhite.space/better/#c=k7qm3xpa`, which opens the page with
the code written in, for a tap to use. Signing in puts what was recorded
on the device together with the account's; each device gets a token of its
own. The account's page (the name on You) gives **a code for another
device** (good 10 minutes, once), and **signs out**: the device forgets
the account's activities (not while some are not yet saved); units, light
or dark and goals stay. If a device is signed out elsewhere, You says
**Sign in again** and nothing on it is lost.

An admin (`admin.sh admin ID`) sees **People** on the account's page:
everyone, whether they have signed in, **New code** for someone who lost
theirs (7 days; 14 if not signed in yet), and **Add someone**: a name, and
an invite (14 days), sent with the share sheet as it is made, optionally
making them the admin's friend. Codes are sent with the phone's share
sheet, or copied on a computer. `people.l8` keeps the account and asks the
worker; `people_pages.l8` draws its pages.

## On an iPhone

`ios.l8` is Better as a native iPhone app: the same program, compiled to
arm64 by `l8 arm64 --target ios` and run by UIKit (no web view, no
wrapper). Its view is an OpenGL ES layer that takes touches and, for the
name field, the keyboard; CoreLocation watches where the phone is while
Better wants it, with the screen locked too, and passes each fix on only as
a step from the one before, as the page does. The log is kept in the app's
Documents, and with the account once signed in (with a code, as on the
page). The app keeps it with the worker itself (`sync.l8`, as `better.js` does on the page): the
worker's log when it starts or is looked at again, and its own changes
sent a second after each save.

```sh
./l8c3 arm64 --target ios programs/better/ios.l8 -o better-ios.s
tools/ios/build.sh sim better-ios.s build      # on a Mac: build/Better.app
```

GitHub builds it on every push to `trunk` that changes it or what it is
built from (`.github/workflows/ios.yml` lists the paths): Linux compiles the
app, and macOS builds the iPhone and simulator artifacts. UI test runs and
screenshot publishing have been removed. It builds `Better.ipa` for an iPhone too, as **Better** (Better Late Than
Never on the App Store), which `tools/ios/sign.sh` signs on Linux, for a
phone plugged in or for TestFlight, and `tools/ios/apple.py` sends to App
Store Connect through its API (the keys in `~/.config/better-ios`).

## On Android

`android.l8` is Better as a native Android app, the same way: the program
compiled by `l8 arm64 --target android` into `libbetter.so`, which runs on
a thread of its own and draws with OpenGL ES on the app's surface (no web
view). A little Java (`tools/android/java`) passes it lines as the page
does (`fix`, `touch`, `type`, the phone's edges; see `android.l8`) and
does what it asks (`L8GPS`, `L8WAKE`, `L8CUE`...); `tools/android/glue.c`
is between them. Where the phone is is watched with Android's GPS while
Better wants it; while recording, a foreground service (its notification
says so) keeps it measuring with the screen off, with only "while using
the app" allowed. The chimes duck other sound for the moment. The log and
settings are kept in the app's files, and with the account once signed in,
as on an iPhone.

```sh
tools/android/build.sh better.apk [VERSION_CODE]   # on Linux, no Gradle
adb install -r better.apk
adb shell am start -n space.trailingwhite.better/.Better --ei sim 10
adb shell am start -n space.trailingwhite.better/.Better --es people demo
adb shell am start -n space.trailingwhite.better/.Better --es api http://10.0.2.2:8799/better/api
```

It needs the Android SDK's build-tools, platform 36 and the NDK (under
`~/android-sdk`), and a JDK. It is signed with the key in
`~/.config/better-android` (made the first time; every update must be
signed with it). `--ei sim K` records a made-up course K times as fast;
`--es people MODE` makes up an account as `L8_PEOPLE` does; `--es api URL`
asks another worker (one run on the computer, from the emulator).

## Keeping it

The log is one text file, written after each change. On the page it is
kept in the browser (IndexedDB), and, signed in, in a Cloudflare D1
database by the worker in `web/better-log/`: the same on every device
signed in to the account, and only for its owner. Logs changed in two places are put together: each activity
is kept once, and one deleted in either stays deleted. The worker also
keeps the text from before a save (one an hour, the last 500); `admin.sh
past LINK` and `restore LINK REV` get them back.

```sh
cd web/better-log
./admin.sh invite NAME       # an account for someone, and the text to send them
./admin.sh admin ID          # mark someone an admin (People in the app)
./admin.sh all               # everyone
./admin.sh past LINK         # a log's texts before (with its #me= link)
```

The first logs were made with a personal link instead of a code
(`admin.sh new`: Better's page with the log's secret after `#me=`, or
`better://link#me=` in the apps); those still work, as a token does.

A recording under way is written every few seconds to its own file (kept
in this browser only, never sent), so a page shut mid-run (a phone may do
that to a page left behind) takes it up again, paused.

The log's file, a line to a thing, each activity's lines after its own:

If the web app stops, recording and location tracking stop. The recovery
message offers downloads of the log and recording files last written in that
page. These may include work not yet saved to IndexedDB or the worker, but
cannot include changes the app had not written. Keep the copies for recovery
help before restarting. Restart reopens saved data, including a saved recording
paused; the latest seconds may be missing. Test sessions (`?fresh` or made-up
accounts) do not save changes and need those downloads to keep their work.

The saved format is:

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

`shared.l8` assembles the shared application and its math, font and drawing
dependencies. Linux/web (`main.l8`), iOS and Android import that entry point.
Each platform root supplies its GL bindings, services and event loop; iOS and
Android also compose `native.l8` for their shared native host support.

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
sport after it is saved; adding one by hand; a friend's activity opened;
links that open the apps (a code is typed or pasted there).
