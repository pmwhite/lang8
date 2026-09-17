"""PTY/X11 integration tests; uses only Python's standard library and libX11."""
import ctypes as C
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import time
import unittest

BINARY = str(Path(sys.argv.pop(1) if len(sys.argv) > 1 else '.build/terminal').resolve())


class Key(C.Structure):
    _fields_ = [('type', C.c_int), ('serial', C.c_ulong), ('send_event', C.c_int),
                ('display', C.c_void_p), ('window', C.c_ulong), ('root', C.c_ulong),
                ('subwindow', C.c_ulong), ('time', C.c_ulong), ('x', C.c_int),
                ('y', C.c_int), ('x_root', C.c_int), ('y_root', C.c_int),
                ('state', C.c_uint), ('keycode', C.c_uint), ('same_screen', C.c_int)]


class Message(C.Structure):
    _fields_ = [('type', C.c_int), ('serial', C.c_ulong), ('send_event', C.c_int),
                ('display', C.c_void_p), ('window', C.c_ulong), ('message_type', C.c_ulong),
                ('format', C.c_int), ('data', C.c_long * 5)]


def eventually(fn, timeout=5):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = fn()
        if value:
            return value
        time.sleep(.02)
    raise AssertionError('timed out waiting for terminal')


class StartupTests(unittest.TestCase):
    def test_invalid_font_sizes(self):
        for size in ('0', '7', '33', 'lots', '99999999999999999999'):
            result = subprocess.run([BINARY, '--font-size', size],
                                    capture_output=True, timeout=3)
            self.assertEqual(result.returncode, 2, size)

    def test_help_without_display(self):
        result = subprocess.run([BINARY, '--help'], env={**os.environ, 'DISPLAY': ''},
                                capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 0)
        self.assertIn(b'Usage: terminal', result.stdout)

    def test_missing_display(self):
        result = subprocess.run([BINARY], env={**os.environ, 'DISPLAY': ''},
                                capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b'cannot open X11 display', result.stderr)


@unittest.skipUnless(os.environ.get('DISPLAY'), 'requires an X11 display (or xvfb-run)')
class TerminalTests(unittest.TestCase):
    def setUp(self):
        self.x = C.CDLL('libX11.so.6')
        declarations = {
            'XOpenDisplay': ([C.c_char_p], C.c_void_p),
            'XDefaultRootWindow': ([C.c_void_p], C.c_ulong),
            'XQueryTree': ([C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong), C.POINTER(C.c_ulong),
                            C.POINTER(C.POINTER(C.c_ulong)), C.POINTER(C.c_uint)], C.c_int),
            'XFetchName': ([C.c_void_p, C.c_ulong, C.POINTER(C.c_char_p)], C.c_int),
            'XFree': ([C.c_void_p], C.c_int),
            'XFlush': ([C.c_void_p], C.c_int),
            'XCloseDisplay': ([C.c_void_p], C.c_int),
            'XResizeWindow': ([C.c_void_p, C.c_ulong, C.c_uint, C.c_uint], C.c_int),
            'XGetGeometry': ([C.c_void_p, C.c_ulong, C.POINTER(C.c_ulong),
                              C.POINTER(C.c_int), C.POINTER(C.c_int),
                              C.POINTER(C.c_uint), C.POINTER(C.c_uint),
                              C.POINTER(C.c_uint), C.POINTER(C.c_uint)], C.c_int),
            'XKeysymToKeycode': ([C.c_void_p, C.c_ulong], C.c_uint),
            'XSendEvent': ([C.c_void_p, C.c_ulong, C.c_int, C.c_long, C.c_void_p], C.c_int),
            'XInternAtom': ([C.c_void_p, C.c_char_p, C.c_int], C.c_ulong),
        }
        for name, (args, result) in declarations.items():
            fn = getattr(self.x, name)
            fn.argtypes, fn.restype = args, result
        self.d = self.x.XOpenDisplay(None)
        if not self.d:
            self.skipTest('cannot connect to X11 display')
        self.addCleanup(self.x.XCloseDisplay, self.d)
        self.root = self.x.XDefaultRootWindow(self.d)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)

    def windows(self, parent=None):
        parent = self.root if parent is None else parent
        root, above, count = C.c_ulong(), C.c_ulong(), C.c_uint()
        children = C.POINTER(C.c_ulong)()
        self.x.XQueryTree(self.d, parent, C.byref(root), C.byref(above), C.byref(children), C.byref(count))
        ids = list(children[:count.value])
        if children:
            self.x.XFree(children)
        found = set()
        for win in ids:
            name = C.c_char_p()
            if self.x.XFetchName(self.d, win, C.byref(name)) and name:
                if name.value == b'L8 Terminal':
                    found.add(win)
                self.x.XFree(name)
            found.update(self.windows(win))
        return found

    def launch(self, script):
        source = self.path / 'child.py'
        source.write_text(script)
        before = self.windows()
        self.proc = subprocess.Popen([BINARY, 'exec python3 ' + shlex.quote(str(source))],
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(self.stop)
        self.win = eventually(lambda: next(iter(self.windows() - before), None))

    def stop(self):
        if self.proc.poll() is None:
            self.close_window()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        self.proc.stdout.close()
        self.proc.stderr.close()

    def close_window(self):
        msg = Message(type=33, display=self.d, window=self.win, format=32)
        msg.message_type = self.x.XInternAtom(self.d, b'WM_PROTOCOLS', 0)
        msg.data[0] = self.x.XInternAtom(self.d, b'WM_DELETE_WINDOW', 0)
        event = C.create_string_buffer(192)
        C.memmove(event, C.byref(msg), C.sizeof(msg))
        self.x.XSendEvent(self.d, self.win, 0, 0, event)
        self.x.XFlush(self.d)

    def key(self, sym, state=0):
        key = Key(type=2, display=self.d, window=self.win, root=self.root,
                  state=state, same_screen=1, keycode=self.x.XKeysymToKeycode(self.d, sym))
        event = C.create_string_buffer(192)
        C.memmove(event, C.byref(key), C.sizeof(key))
        self.x.XSendEvent(self.d, self.win, 0, 1, event)
        self.x.XFlush(self.d)

    def geometry(self):
        root = C.c_ulong()
        x, y = C.c_int(), C.c_int()
        width, height, border, depth = C.c_uint(), C.c_uint(), C.c_uint(), C.c_uint()
        if not self.x.XGetGeometry(self.d, self.win, C.byref(root), C.byref(x), C.byref(y),
                                   C.byref(width), C.byref(height), C.byref(border), C.byref(depth)):
            return None
        return width.value, height.value

    def test_missing_font(self):
        result = subprocess.run([BINARY, '--font', str(self.path / 'missing.ttf')],
                                capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b'OpenGL/font setup failed', result.stderr)

    def test_shell_io_resize_and_queries(self):
        self.launch(f'''
import os, tty, signal, json, time
from pathlib import Path
p = Path({str(self.path)!r})
tty.setraw(0)
def size(*args):
    z = os.get_terminal_size(0)
    (p / 'size').write_text(json.dumps([z.columns, z.lines]))
signal.signal(signal.SIGWINCH, size)
size()
(p / 'ready').write_text(json.dumps([os.isatty(0), os.tcgetpgrp(0) == os.getpgrp(), os.environ['TERM'], os.environ['COLORTERM']]))
os.write(1, b'\\x1b[2J\\x1b[HHello from L8 Terminal\\r\\n\\x1b[31mRED \\x1b[32mGREEN \\x1b[38;5;81mNVIM256 \\x1b[38;2;255;120;190mTRUECOLOR\\x1b[0m\\r\\n')
os.write(1, 'Unicode: café λ Ж € ✓ é 😀\\r\\n'.encode())
data = b''
while len(data) < 6:
    data += os.read(0, 6 - len(data))
(p / 'keys').write_bytes(data)
os.write(1, b'\\x1b[?1h')
time.sleep(.1)
(p / 'application').touch()
data = os.read(0, 3)
(p / 'arrow').write_bytes(data)
os.write(1, b'\\x1b[3;4H\\x1b[6n')
reply = b''
while not reply.endswith(b'R'):
    reply += os.read(0, 1)
(p / 'reply').write_bytes(reply)
while not (p / 'exit').exists():
    time.sleep(.02)
''')
        eventually(lambda: (self.path / 'ready').exists())
        self.assertEqual(json.loads((self.path / 'ready').read_text()),
                         [True, True, 'xterm-256color', 'truecolor'])
        original = json.loads((self.path / 'size').read_text())
        self.key(ord('a'))
        self.key(0xff52)  # Up
        self.key(0xff08)  # Backspace
        self.key(ord('c'), 4)  # Ctrl-C (raw PTY, so delivered as a byte)
        eventually(lambda: (self.path / 'keys').exists())
        self.assertEqual((self.path / 'keys').read_bytes(), b'a\x1b[A\x7f\x03')
        eventually(lambda: (self.path / 'application').exists())
        self.key(0xff54)
        eventually(lambda: (self.path / 'reply').exists())
        self.assertEqual((self.path / 'arrow').read_bytes(), b'\x1bOB')
        self.assertEqual((self.path / 'reply').read_bytes(), b'\x1b[3;4R')
        original_geometry = self.geometry()
        requested = (360, 160) if original_geometry != (360, 160) else (480, 240)
        self.x.XResizeWindow(self.d, self.win, *requested)
        self.x.XFlush(self.d)
        def resized():
            try:
                return json.loads((self.path / 'size').read_text()) != original
            except json.JSONDecodeError:
                return False
        # Tiling window managers may reject client resize requests. Require the
        # PTY update only when X11 reports that the window geometry changed.
        deadline = time.monotonic() + 1
        while time.monotonic() < deadline and self.geometry() == original_geometry:
            time.sleep(.02)
        if self.geometry() != original_geometry:
            eventually(resized)
        if os.environ.get('TERMINAL_SCREENSHOT'):
            subprocess.run(['import', '-window', str(self.win), os.environ['TERMINAL_SCREENSHOT']], check=True)
        (self.path / 'exit').touch()
        self.assertEqual(self.proc.wait(timeout=5), 0)
        self.assertEqual(self.proc.stderr.read(), b'')

    def test_close_reaps_uncooperative_child(self):
        self.launch(f'''
import os, signal, time
from pathlib import Path
signal.signal(signal.SIGHUP, signal.SIG_IGN)
Path({str(self.path / 'pid')!r}).write_text(str(os.getpid()))
while True: os.write(1, b"flooding output\\r\\n" * 1000)
''')
        eventually(lambda: (self.path / 'pid').exists())
        pid = int((self.path / 'pid').read_text())
        self.close_window()
        self.assertEqual(self.proc.wait(timeout=3), 0)
        with self.assertRaises(ProcessLookupError):
            os.kill(pid, 0)


if __name__ == '__main__':
    unittest.main()
