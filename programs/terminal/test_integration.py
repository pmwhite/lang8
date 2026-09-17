"""PTY/native Wayland tests, with an isolated headless Sway compositor."""
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

from wayland_test_client import Client

BINARY = str(Path(sys.argv.pop(1) if len(sys.argv) > 1 else '.build/terminal').resolve())


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
        result = subprocess.run([BINARY, '--help'], env={**os.environ, 'DISPLAY': '', 'WAYLAND_DISPLAY': '/nonexistent/l8-wayland-test', 'WAYLAND_SOCKET': ''},
                                capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 0)
        self.assertIn(b'Usage: terminal', result.stdout)

    def test_missing_display(self):
        result = subprocess.run([BINARY], env={**os.environ, 'DISPLAY': '', 'WAYLAND_DISPLAY': '/nonexistent/l8-wayland-test', 'WAYLAND_SOCKET': ''},
                                capture_output=True, timeout=3)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b'Wayland/EGL/font setup failed', result.stderr)


@unittest.skipUnless(shutil.which('sway') and shutil.which('swaymsg'), 'requires sway/swaymsg for headless Wayland tests')
class TerminalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = tempfile.TemporaryDirectory(prefix='l8-wayland-')
        cls.addClassCleanup(cls.runtime.cleanup)
        runtime = Path(cls.runtime.name)
        runtime.chmod(0o700)
        config = runtime / 'sway.conf'
        config.write_text('xwayland disable\noutput * resolution 1280x800\nseat seat0 fallback true\nfocus_follows_mouse no\ninput * repeat_delay 200\ninput * repeat_rate 25\n')
        cls.env = {**os.environ, 'XDG_RUNTIME_DIR': str(runtime), 'WLR_BACKENDS': 'headless',
                   'WLR_LIBINPUT_NO_DEVICES': '1', 'WLR_RENDERER': 'pixman', 'DISPLAY': '',
                   'LIBGL_ALWAYS_SOFTWARE': '1', 'LANG': 'C.UTF-8'}
        cls.env.pop('WAYLAND_SOCKET', None)
        cls.env.pop('SWAYSOCK', None)
        cls.log = (runtime / 'sway.log').open('w+')
        cls.addClassCleanup(cls.log.close)
        cls.compositor = subprocess.Popen(['sway', '-c', str(config)], env=cls.env,
                                          stdout=cls.log, stderr=cls.log)
        def stop():
            cls.compositor.terminate()
            try: cls.compositor.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.compositor.kill()
                cls.compositor.wait()
        cls.addClassCleanup(stop)
        def ready():
            if cls.compositor.poll() is not None:
                cls.log.seek(0)
                raise RuntimeError('headless Sway failed: ' + cls.log.read())
            sockets = list(runtime.glob('sway-ipc.*.sock'))
            displays = [p for p in runtime.glob('wayland-*') if p.suffix != '.lock']
            return (sockets[0], displays[0]) if sockets and displays else None
        ipc, socket = eventually(ready)
        cls.env['SWAYSOCK'] = str(ipc)
        cls.env['WAYLAND_DISPLAY'] = socket.name
        cls.socket = str(socket)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.client = Client(self.socket)
        self.addCleanup(self.client.close)

    def ipc(self, *args):
        result = subprocess.run(['swaymsg', '-r', *args], env=self.env, capture_output=True,
                                timeout=3, check=True)
        return json.loads(result.stdout)

    def windows(self):
        found = {}
        def visit(node):
            if node.get('app_id') == 'org.lang8.Terminal':
                found[node['id']] = node
            for child in node.get('nodes', []) + node.get('floating_nodes', []):
                visit(child)
        visit(self.ipc('-t', 'get_tree'))
        return found

    def launch(self, script):
        source = self.path / 'child.py'
        source.write_text(script)
        before = self.windows()
        self.proc = subprocess.Popen([BINARY, 'exec python3 ' + shlex.quote(str(source))], env=self.env,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.addCleanup(self.stop)
        def mapped():
            if self.proc.poll() is not None:
                raise AssertionError('terminal exited during startup: ' + self.proc.stderr.read().decode())
            return next(iter(self.windows().keys() - before.keys()), None)
        self.win = eventually(mapped)
        self.command('focus')
        self.client.roundtrip()

    def stop(self):
        if self.proc.poll() is None:
            self.close_window()
            try: self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        self.proc.stdout.close()
        self.proc.stderr.close()

    def command(self, command):
        response = self.ipc(f'[con_id={self.win}] {command}')
        self.assertTrue(all(r.get('success') for r in response), response)

    def close_window(self):
        self.command('kill')

    def key(self, sym, state=0):
        code = {ord('a'): 30, ord('c'): 46, 0xff52: 103, 0xff54: 108, 0xff08: 14}[sym]
        self.client.key(code, state)

    def geometry(self):
        r = self.windows()[self.win]['rect']
        return r['width'], r['height']

    def test_missing_font(self):
        result = subprocess.run([BINARY, '--font', str(self.path / 'missing.ttf')],
                                capture_output=True, timeout=3, env=self.env)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b'Wayland/EGL/font setup failed', result.stderr)

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
os.write(1, b'\\x1b[6 q\\x1b[?1049h\\x1b[2J\\x1b[HHello from L8 Terminal\\r\\n\\x1b[31mRED \\x1b[32mGREEN \\x1b[38;5;81mNVIM256 \\x1b[38;2;255;120;190mTRUECOLOR\\x1b[0m\\r\\n')
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
        self.command(f'floating enable, resize set {requested[0]} {requested[1]}')
        def resized():
            try:
                return json.loads((self.path / 'size').read_text()) != original
            except json.JSONDecodeError:
                return False
        eventually(resized)
        artifact = Path(os.environ.get('TERMINAL_SCREENSHOT', '.build/terminal-wayland.png')).resolve()
        artifact.parent.mkdir(parents=True, exist_ok=True)
        time.sleep(.25)
        self.assertGreater(self.client.screenshot(artifact), 30, 'window has no rendered text')
        (self.path / 'exit').touch()
        self.assertEqual(self.proc.wait(timeout=5), 0)
        self.assertEqual(self.proc.stderr.read(), b'')

    def test_compose_and_repeat(self):
        self.launch(f'''import os, tty, time, select
from pathlib import Path
p = Path({str(self.path)!r})
tty.setraw(0)
(p / 'ready').touch()
data = b''
end = time.monotonic() + 1.2
while time.monotonic() < end:
    if select.select([0], [], [], .05)[0]: data += os.read(0, 256)
(p / 'keys').write_bytes(data)
while not (p / 'exit').exists(): time.sleep(.02)
''')
        eventually(lambda: (self.path / 'ready').exists())
        self.client.key(40)  # dead acute on the test's US intl layout
        self.client.key(18)  # e
        self.client.key(30, release=False)
        time.sleep(.45)
        self.client.release(30)
        eventually(lambda: (self.path / 'keys').exists())
        data = (self.path / 'keys').read_bytes()
        self.assertTrue(data.startswith('é'.encode()), data)
        self.assertGreaterEqual(len(data[2:]), 3, data)
        self.assertLess(len(data[2:]), 16, 'repeat continued after release')
        self.assertEqual(set(data[2:]), {ord('a')})
        (self.path / 'exit').touch()
        self.assertEqual(self.proc.wait(timeout=3), 0)

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
