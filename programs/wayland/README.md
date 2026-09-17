# Native Wayland windows

Import `wayland.l8` and activate `use_tag wayland;`. The library is written in L8,
including all event callbacks. It connects through libwayland-client, creates an
xdg-shell toplevel and a desktop OpenGL context through EGL, and handles keyboard
input with xkbcommon. No C shim, C compiler, or wayland-scanner is needed to build
applications. Rebuild the L8 compiler with `./build.sh selfhost` first.

`wl_window_open(width, height, title, app_id)` returns `?*WLWindow@new`. Opening a
window requires `noregion`: libwayland retains its callback data until close.
`wl_window_close` releases the EGL and Wayland objects, keymap/compose state,
cursor theme, file descriptors, and connection. Use each window from one thread.

The application draws with OpenGL (`../gl/core.l8`) and calls
`wl_window_present` when `frame_ready` is true. `width` and `height` reflect the
last acknowledged configure; `changed` requests a redraw and `closed` requests
shutdown. The library requests server-side decorations if supported. The terminal
in `../terminal/` is a complete example with a PTY and animated renderer.

Integrate `wl_display_get_fd(window.display)` into the application's poll loop:

1. Dispatch pending events and consume the window's bounded `keys` ring.
2. Call `wl_window_repeat(window, wl_mono_ms())` for keyboard repeats; cap the poll
   timeout at `repeat_at` when `repeat_key` is nonzero.
3. Call `wl_window_prepare`. A negative result means the connection failed;
   otherwise its result is the poll event mask (POLLIN, plus POLLOUT when needed).
4. After polling, call `wl_window_finish` with the display's revents, or zero on
   timeout/interruption. Every successful prepare must have exactly one finish
   before drawing or making another dispatch/read operation.

Keyboard events carry a keysym and up to 63 UTF-8 bytes in `WLKey.text`, with
`size` giving the byte count. Modifier masks and layout groups come from the
compositor; dead-key/Compose sequences use LC_ALL, LC_CTYPE, or LANG. Seat version
5 is used for repeat settings and release requests. Focus loss, key release, and
keyboard removal stop repeats. Pointer events install a standard cursor; mouse
reporting, clipboard, text-input/IME, client-side decorations, and fractional
scaling are not implemented. Surface buffers currently use scale 1.

`protocol.l8` contains interface/message metadata and typed request wrappers.
`generate.py` regenerates it from the checked-in XML under `protocol/`:

```sh
python3 programs/wayland/generate.py
python3 programs/wayland/generate.py --check
./build.sh terminal-test
```

The XML retains upstream copyright/license notices. Core metadata comes from
Wayland 1.21.0's `wayland.xml`; xdg-shell and xdg-decoration come from
[wayland-protocols](https://gitlab.freedesktop.org/wayland/wayland-protocols).
The generated file includes complete descriptors, while the convenience library
binds wl_compositor/xdg-shell version 1 and wl_seat version 5. Listener tables use
ordinary `fn` values. Typed `extern` aliases give the generic C marshalling and
listener entry points a distinct checked signature for each layout.

Protocol and event-loop references: [Wayland client API](https://wayland.freedesktop.org/docs/html/apb.html),
[xdg-shell](https://gitlab.freedesktop.org/wayland/wayland-protocols/-/blob/main/stable/xdg-shell/xdg-shell.xml).
