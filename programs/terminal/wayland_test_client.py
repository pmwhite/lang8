"""Small test-only Wayland client: virtual keyboard and headless screenshots.

Uses ctypes and the real libwayland/xkbcommon libraries. It only connects to the
private compositor started by test_integration.py, never the desktop session.
"""
import ctypes as C
import mmap
import os
import struct
import zlib

class Interface(C.Structure):
    pass
class Message(C.Structure):
    _fields_ = [('name', C.c_char_p), ('signature', C.c_char_p),
                ('types', C.POINTER(C.POINTER(Interface)))]
Interface._fields_ = [('name', C.c_char_p), ('version', C.c_int),
                     ('nmethods', C.c_int), ('methods', C.POINTER(Message)),
                     ('nevents', C.c_int), ('events', C.POINTER(Message))]
class Arg(C.Union):
    _fields_ = [('u', C.c_uint32), ('i', C.c_int32), ('p', C.c_void_p), ('s', C.c_char_p)]


def interface(name, requests, events=()):
    types = [(C.POINTER(Interface) * len(sig))() for n, sig in (*requests, *events)]
    methods = (Message * len(requests))(*(Message(n.encode(), sig.encode(), types[i]) for i, (n, sig) in enumerate(requests)))
    evs = (Message * len(events))(*(Message(n.encode(), sig.encode(), types[len(requests)+i]) for i, (n, sig) in enumerate(events)))
    value = Interface(name.encode(), 1, len(methods), methods, len(evs), evs)
    value.keepalive = (methods, evs, types)
    return value


class Client:
    def __init__(self, socket):
        self.lib = C.CDLL('libwayland-client.so.0')
        signatures = {
            'wl_display_connect': ([C.c_char_p], C.c_void_p),
            'wl_display_disconnect': ([C.c_void_p], None),
            'wl_display_roundtrip': ([C.c_void_p], C.c_int),
            'wl_display_dispatch': ([C.c_void_p], C.c_int),
            'wl_display_flush': ([C.c_void_p], C.c_int),
            'wl_proxy_add_listener': ([C.c_void_p, C.c_void_p, C.c_void_p], C.c_int),
            'wl_proxy_marshal_array_flags': ([C.c_void_p, C.c_uint, C.POINTER(Interface), C.c_uint, C.c_uint, C.POINTER(Arg)], C.c_void_p),
            'wl_proxy_destroy': ([C.c_void_p], None),
        }
        for name, (args, ret) in signatures.items():
            f = getattr(self.lib, name)
            f.argtypes, f.restype = args, ret
        self.display = self.lib.wl_display_connect(os.fsencode(socket))
        assert self.display, 'cannot connect test Wayland client'
        self.refs = []
        self.globals = {}
        self.registry = self.request(self.display, 1, [Arg(p=None)], self.core('wl_registry'))
        global_cb = C.CFUNCTYPE(None, C.c_void_p, C.c_void_p, C.c_uint, C.c_char_p, C.c_uint)
        remove_cb = C.CFUNCTYPE(None, C.c_void_p, C.c_void_p, C.c_uint)
        self.listen(self.registry, [global_cb(lambda _, p, n, i, v: self.globals.update({i.decode(): (n, v)})),
                                    remove_cb(lambda *args: None)])
        self.roundtrip()
        self.seat = self.bind('wl_seat')
        self.manager_interface = interface('zwp_virtual_keyboard_manager_v1', [('create_virtual_keyboard', 'on')])
        self.keyboard_interface = interface('zwp_virtual_keyboard_v1', [('keymap', 'uhu'), ('key', 'uuu'),
                                                                         ('modifiers', 'uuuu'), ('destroy', '')])
        self.manager = self.bind('zwp_virtual_keyboard_manager_v1', self.manager_interface)
        self.keyboard = self.request(self.manager, 0, [Arg(p=self.seat), Arg(p=None)], self.keyboard_interface)
        x = C.CDLL('libxkbcommon.so.0')
        for n, args, ret in [('xkb_context_new', [C.c_int], C.c_void_p),
                             ('xkb_keymap_new_from_names', [C.c_void_p, C.c_void_p, C.c_int], C.c_void_p),
                             ('xkb_keymap_get_as_string', [C.c_void_p, C.c_int], C.c_void_p),
                             ('xkb_keymap_unref', [C.c_void_p], None), ('xkb_context_unref', [C.c_void_p], None)]:
            getattr(x, n).argtypes, getattr(x, n).restype = args, ret
        context = x.xkb_context_new(0)
        class Names(C.Structure):
            _fields_ = [(name, C.c_char_p) for name in ('rules', 'model', 'layout', 'variant', 'options')]
        names = Names(None, None, b'us', b'intl', None)
        keymap = x.xkb_keymap_new_from_names(context, C.byref(names), 0)
        raw = x.xkb_keymap_get_as_string(keymap, 1)
        data = C.string_at(raw) + b'\0'
        libc = C.CDLL('libc.so.6')
        libc.free.argtypes = [C.c_void_p]
        libc.free(raw)
        x.xkb_keymap_unref(keymap)
        x.xkb_context_unref(context)
        fd = os.memfd_create('l8-test-keymap')
        os.write(fd, data)
        self.request(self.keyboard, 0, [Arg(u=1), Arg(i=fd), Arg(u=len(data))])
        os.close(fd)
        self.roundtrip()

    def core(self, name):
        return Interface.in_dll(self.lib, name + '_interface')

    def listen(self, proxy, callbacks):
        table = (C.c_void_p * len(callbacks))(*(C.cast(c, C.c_void_p) for c in callbacks))
        self.refs.extend([table, *callbacks])
        assert self.lib.wl_proxy_add_listener(proxy, table, None) == 0

    def request(self, proxy, opcode, args=(), new=None, destroy=False):
        array = (Arg * len(args))(*args)
        return self.lib.wl_proxy_marshal_array_flags(proxy, opcode, C.byref(new) if new is not None else None,
                                                   1, int(destroy), array)

    def bind(self, name, desc=None):
        if desc is None:
            desc = self.core(name)
        n, version = self.globals[name]
        return self.request(self.registry, 0, [Arg(u=n), Arg(s=name.encode()), Arg(u=1), Arg(p=None)], desc)

    def roundtrip(self):
        assert self.lib.wl_display_roundtrip(self.display) >= 0, 'test Wayland connection failed'

    def key(self, code, modifiers=0, release=True):
        self.request(self.keyboard, 2, [Arg(u=modifiers), Arg(u=0), Arg(u=0), Arg(u=0)])
        self.request(self.keyboard, 1, [Arg(u=1), Arg(u=code), Arg(u=1)])
        if release:
            self.release(code)
        else:
            self.roundtrip()

    def release(self, code):
        self.request(self.keyboard, 1, [Arg(u=2), Arg(u=code), Arg(u=0)])
        self.request(self.keyboard, 2, [Arg(u=0), Arg(u=0), Arg(u=0), Arg(u=0)])
        self.roundtrip()

    def screenshot(self, path, region=None):
        manager_type = interface('zwlr_screencopy_manager_v1', [('capture_output', 'nio'), ('capture_output_region', 'nioiiii'), ('destroy', '')])
        frame_type = interface('zwlr_screencopy_frame_v1', [('copy', 'o'), ('destroy', '')],
                               [('buffer', 'uuuu'), ('flags', 'u'), ('ready', 'uuu'), ('failed', '')])
        manager = self.bind('zwlr_screencopy_manager_v1', manager_type)
        output = self.bind('wl_output')
        shm = self.bind('wl_shm')
        frame = self.request(manager, 0, [Arg(p=None), Arg(i=0), Arg(p=output)], frame_type)
        result = {}
        def buffer(_, proxy, fmt, width, height, stride):
            fd = os.memfd_create('l8-test-screenshot')
            os.ftruncate(fd, stride * height)
            memory = mmap.mmap(fd, stride * height)
            pool = self.request(shm, 0, [Arg(p=None), Arg(i=fd), Arg(i=stride * height)], self.core('wl_shm_pool'))
            image = self.request(pool, 0, [Arg(p=None), Arg(i=0), Arg(i=width), Arg(i=height), Arg(i=stride), Arg(u=fmt)], self.core('wl_buffer'))
            os.close(fd)
            result.update(memory=memory, width=width, height=height, stride=stride, fmt=fmt, buffer=image, pool=pool)
            self.request(frame, 0, [Arg(p=image)])
        self.listen(frame, [C.CFUNCTYPE(None, C.c_void_p, C.c_void_p, *([C.c_uint] * 4))(buffer),
                            C.CFUNCTYPE(None, C.c_void_p, C.c_void_p, C.c_uint)(lambda _, p, flags: result.update(flags=flags)),
                            C.CFUNCTYPE(None, C.c_void_p, C.c_void_p, *([C.c_uint] * 3))(lambda *args: result.update(done=True)),
                            C.CFUNCTYPE(None, C.c_void_p, C.c_void_p)(lambda *args: result.update(failed=True))])
        while not result.get('done') and not result.get('failed'):
            assert self.lib.wl_display_dispatch(self.display) >= 0
        assert result.get('done'), 'screencopy failed'
        assert result['fmt'] in (0, 1), 'unexpected screenshot pixel format'
        width, height, stride = result['width'], result['height'], result['stride']
        raw = result['memory'][:]
        rows = []
        for y in range(height):
            row = raw[y*stride:y*stride+width*4]
            rows.append(b'\0' + b''.join(bytes((row[i+2], row[i+1], row[i])) for i in range(0,len(row),4)))
        if result.get('flags', 0) & 1:
            rows.reverse()
        def chunk(name, data):
            return struct.pack('!I', len(data)) + name + data + struct.pack('!I', zlib.crc32(name+data))
        path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB',width,height,8,2,0,0,0)) +
                         chunk(b'IDAT',zlib.compress(b''.join(rows))) + chunk(b'IEND',b''))
        self.request(frame, 1, destroy=True)
        self.request(result['buffer'], 0, destroy=True)
        self.request(result['pool'], 1, destroy=True)
        result['memory'].close()
        if region is not None:
            x, y, w, h = region
            assert 0 <= x < x + w <= width and 0 <= y < y + h <= height
            pixels = set()
            ink = 0
            for row in range(y, y + h):
                if result.get('flags', 0) & 1:
                    row = height - row - 1
                start = row * stride + x * 4
                for i in range(start, start + w * 4, 4):
                    pixel = raw[i:i+3]
                    pixels.add(pixel)
                    ink += max(pixel) > 64
            return {'colors': len(pixels), 'ink_fraction': ink / (w * h)}
        return len(set(raw[i:i+3] for i in range(0, len(raw), 4)))

    def close(self):
        if self.display:
            self.lib.wl_display_disconnect(self.display)
            self.display = None
