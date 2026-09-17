"""Independent peers exercise the compiled L8 client and server over TCP."""
import contextlib
import email.utils
import http.client
import os
from pathlib import Path
import select
import signal
import socket
import subprocess
import threading
import time
import unittest

from test_http import BUILD, build, request


@contextlib.contextmanager
def server(timeout=2000, host='127.0.0.1'):
    family = socket.AF_INET6 if ':' in host else socket.AF_INET
    with socket.socket(family) as reservation:
        reservation.bind((host, 0))
        port = reservation.getsockname()[1]
    process = subprocess.Popen([str(BUILD / 'server'), str(port), host, str(timeout)],
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               start_new_session=True)
    try:
        ready, _, _ = select.select([process.stdout], [], [], 5)
        if not ready or process.stdout.readline() != b'ready\n':
            raise RuntimeError('server failed to start: ' + repr(process.poll()))
        yield port
    finally:
        os.killpg(process.pid, signal.SIGTERM)
        process.communicate(timeout=5)


@contextlib.contextmanager
def peer(handler):
    listener = socket.socket()
    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    listener.bind(('127.0.0.1', 0))
    listener.listen(1)
    listener.settimeout(5)
    errors = []
    def run():
        try:
            with listener.accept()[0] as conn:
                conn.settimeout(5)
                handler(conn)
        except BaseException as exc:
            errors.append(exc)
        finally:
            listener.close()
    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    try:
        yield listener.getsockname()[1]
    finally:
        worker.join(6)
        if worker.is_alive():
            raise AssertionError('peer did not terminate')
        if errors:
            raise errors[0]


def read_head(conn):
    buf = bytearray()
    while not buf.endswith(b'\r\n\r\n'):
        byte = conn.recv(1)
        if not byte:
            raise EOFError(bytes(buf))
        buf.extend(byte)
    return bytes(buf)


def client(port, method='GET', body='', mode=''):
    return subprocess.run([str(BUILD / 'client'), '127.0.0.1', str(port), '/', method, body, mode],
                          capture_output=True, timeout=7)


def connect(port):
    conn = socket.create_connection(('127.0.0.1', port), timeout=3)
    conn.settimeout(3)
    return conn


class NetworkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_python_client_keep_alive_head_and_echo(self):
        with server() as port:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
            for method, path, body, expected in [('GET', '/', None, b'Hello from L8 HTTP/1.1\n'), ('HEAD', '/', None, b''), ('POST', '/', b'a\0b\xff', b'a\0b\xff'), ('PUT', '/', b'replaced', b'replaced'), ('GET', '/chunked', None, b'Hello from L8 HTTP/1.1\n'), ('OPTIONS', '*', None, b''), ('DELETE', '/', None, b'')]:
                with self.subTest(method=method, path=path):
                    conn.request(method, path, body=body)
                    response = conn.getresponse()
                    self.assertEqual(response.status, 204 if method in ('OPTIONS', 'DELETE') else 200)
                    self.assertEqual(response.read(), expected)
                    self.assertIsNotNone(email.utils.parsedate_to_datetime(response.getheader('Date')))
            conn.close()

    def test_chunked_request_and_response(self):
        with server() as port:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
            conn.request('POST', '/chunked', body=iter([b'a\0', b'bc', b'\xff']), encode_chunked=True)
            response = conn.getresponse()
            self.assertEqual(response.read(), b'a\0bc\xff')
            self.assertEqual(response.getheader('Transfer-Encoding'), 'chunked')
            self.assertEqual(response.getheader('Trailer'), 'x-complete')
            conn.close()

    def test_pipeline_and_close_rfc9112_9(self):
        with server() as port, connect(port) as conn:
            conn.sendall(request(method=b'POST', headers=b'Host: a\r\nContent-Length: 3\r\n', body=b'one') + request(headers=b'Host: a\r\nConnection: close\r\n') + request())
            stream = conn.makefile('rb')
            for expected in (b'one', b'Hello from L8 HTTP/1.1\n'):
                self.assertTrue(stream.readline().startswith(b'HTTP/1.1 200'))
                headers = {}
                while True:
                    line = stream.readline()
                    if line == b'\r\n':
                        break
                    key, value = line.split(b':', 1)
                    headers[key.lower()] = value.strip()
                self.assertEqual(stream.read(int(headers[b'content-length'])), expected)
            self.assertEqual(stream.read(), b'')
            stream.close()

    def test_every_network_split(self):
        wire = request(b'Host: a\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n', b'3;x="y"\r\na\0b\r\n0\r\nX-Final: yes\r\n\r\n', b'POST')
        with server() as port:
            for split in range(1, len(wire)):
                with self.subTest(split=split), connect(port) as conn:
                    conn.sendall(wire[:split])
                    # Separate writes exercise arbitrary fragmentation without timing assumptions.
                    conn.sendall(wire[split:])
                    response = http.client.HTTPResponse(conn)
                    response.begin()
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.read(), b'a\0b')

    def test_expect_continue_and_reject_without_body(self):
        with server() as port, connect(port) as conn:
            conn.sendall(request(b'Host: a\r\nContent-Length: 4\r\nExpect: 100-continue\r\n', method=b'POST'))
            self.assertEqual(read_head(conn), b'HTTP/1.1 100 Continue\r\n\r\n')
            conn.sendall(b'body')
            response = http.client.HTTPResponse(conn)
            response.begin()
            self.assertEqual(response.read(), b'body')
        with server() as port, connect(port) as conn:
            conn.sendall(request(b'Host: a\r\nContent-Length: 4\r\nExpect: unknown\r\n', method=b'POST'))
            response = http.client.HTTPResponse(conn)
            response.begin()
            self.assertEqual(response.status, 417)
            self.assertEqual(response.getheader('Connection'), 'close')
            response.read()

    def test_bad_framing_and_incomplete_body_close(self):
        with server() as port:
            for wire in [request(b'Host: a\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n'), request(b'Host: a\r\nContent-Length: 4\r\n', b'ab', b'POST')]:
                with self.subTest(wire=wire), connect(port) as conn:
                    conn.sendall(wire)
                    conn.shutdown(socket.SHUT_WR)
                    response = http.client.HTTPResponse(conn)
                    response.begin()
                    self.assertEqual(response.status, 400)
                    self.assertEqual(response.getheader('Connection'), 'close')
                    response.read()

    def test_connect_rejection_closes_rfc9931(self):
        with server() as port, connect(port) as conn:
            conn.sendall(request(method=b'CONNECT', target=b'example.test:443') + request())
            response = http.client.HTTPResponse(conn)
            response.begin()
            self.assertEqual(response.status, 501)
            self.assertEqual(response.getheader('Connection'), 'close')
            response.read()
            self.assertEqual(conn.recv(1), b'')

    def test_http10(self):
        with server() as port, connect(port) as conn:
            conn.sendall(request(headers=b'', version=b'HTTP/1.0'))
            head = read_head(conn)
            self.assertTrue(head.startswith(b'HTTP/1.0 200'))
            self.assertIn(b'Connection: close\r\n', head)
            self.assertNotIn(b'Transfer-Encoding', head)
            self.assertEqual(conn.recv(1024), b'Hello from L8 HTTP/1.1\n')

    def test_timeout_and_concurrency(self):
        with server(timeout=150) as port, connect(port) as stalled:
            stalled.sendall(b'GET / HTTP/1.1\r\nHost:')
            with connect(port) as active:
                active.sendall(request())
                response = http.client.HTTPResponse(active)
                response.begin()
                self.assertEqual(response.status, 200)
                response.read()
            response = http.client.HTTPResponse(stalled)
            response.begin()
            self.assertEqual(response.status, 408)
            response.read()

    def test_l8_client_to_l8_server(self):
        with server() as port:
            for method, body, mode in [('GET', '', ''), ('HEAD', '', ''), ('POST', 'body', ''), ('POST', 'chunk-body', 'chunked'), ('POST', 'expect-body', 'expect')]:
                with self.subTest(method=method, mode=mode):
                    result = client(port, method, body, mode)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertEqual(result.stdout, b'' if method == 'HEAD' else body.encode() if method == 'POST' else b'Hello from L8 HTTP/1.1\n')

    def test_client_independent_responses(self):
        cases = [
            (b'HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\na\0b\xff', b'a\0b\xff', 0),
            (b'HTTP/1.1 200 OK\r\n\r\nclosed', b'closed', 0),
            (b'HTTP/1.1 103 Early Hints\r\nLink: </x>\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok', b'ok', 0),
            (b'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\na\0b\r\n0\r\nX-End: yes\r\n\r\n', b'a\0b', 0),
            (b'HTTP/1.1 204 No Content\r\n\r\n', b'', 0),
            (b'HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nabc', b'', 1),
            (b'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n', b'', 1),
            (b'HTTP/1.1 200 OK\r\nContent-Length: 1\r\nContent-Length: 2\r\n\r\na', b'', 1),
            (b'HTTP/1.1 404 Missing\r\nContent-Length: 2\r\n\r\nno', b'no', 22),
        ]
        for wire, expected, code in cases:
            def handler(conn):
                head = read_head(conn)
                self.assertIn(b'Host: 127.0.0.1:', head)
                for byte in wire:
                    conn.sendall(bytes([byte]))
            with self.subTest(wire=wire), peer(handler) as port:
                result = client(port)
                self.assertEqual(result.returncode, code, result.stderr)
                self.assertEqual(result.stdout, expected)

    def test_client_expect_early_final(self):
        def handler(conn):
            self.assertIn(b'expect: 100-continue', read_head(conn))
            conn.sendall(b'HTTP/1.1 417 Expectation Failed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            self.assertEqual(conn.recv(100), b'')
        with peer(handler) as port:
            result = client(port, 'POST', 'do-not-send', 'expect')
            self.assertEqual(result.returncode, 22)

    def test_client_expect_fallback(self):
        def handler(conn):
            read_head(conn)
            self.assertEqual(conn.recv(4), b'body')
            conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok')
        with peer(handler) as port:
            result = client(port, 'POST', 'body', 'expect')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, b'ok')

    @unittest.skipUnless(socket.has_ipv6, 'IPv6 unavailable')
    def test_ipv6(self):
        try:
            with socket.socket(socket.AF_INET6) as check:
                check.bind(('::1', 0))
        except OSError:
            self.skipTest('IPv6 loopback unavailable')
        with server(host='::1') as port:
            result = subprocess.run([str(BUILD / 'client'), '::1', str(port), '/'], capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, b'Hello from L8 HTTP/1.1\n')


if __name__ == '__main__':
    unittest.main(verbosity=2)
