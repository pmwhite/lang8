"""Full-duplex upload regressions; peers deliberately respond before consuming content."""
import socket
import subprocess
import unittest

from test_http import BUILD, build
from test_network import peer, read_head

SIZE = 8 * 1024 * 1024


def upload(port, mode, size=SIZE):
    result = subprocess.run([str(BUILD / 'session'), str(port), mode, str(size)],
                            capture_output=True, timeout=5, check=True)
    return dict(line.split(b'=', 1) for line in result.stdout.splitlines())


def drain_to_eof(conn):
    total = 0
    while True:
        data = conn.recv(65536)
        if not data:
            return total
        total += len(data)


class UploadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_rejection_during_fixed_and_chunked_upload(self):
        for mode in ('upload-fixed', 'upload-chunked', 'upload-expect-fixed', 'upload-expect-chunked'):
            received = []
            def handler(conn):
                head = read_head(conn)
                if b'expect: 100-continue' in head:
                    conn.sendall(b'HTTP/1.1 100 Continue\r\n\r\n')
                initial = conn.recv(1024)
                self.assertTrue(initial)
                # Fragment the response and leave reads open until the client half-closes.
                for piece in (b'HTTP/1.1 413', b' Content Too Large\r\nConnection: close\r\n',
                              b'Content-Length: 6\r\n\r\n', b'denied'):
                    conn.sendall(piece)
                received.append(len(initial) + drain_to_eof(conn))
            with self.subTest(mode=mode), peer(handler) as port:
                result = upload(port, mode)
                self.assertEqual(result, {b'status': b'413', b'error': b'0', b'reusable': b'0', b'body': b'denied'})
            # Already queued TCP bytes cannot be recalled; the remainder must not be sent.
            self.assertLess(received[0], SIZE // 8)

    def test_early_final_without_connection_close_and_eof_delimited_body(self):
        received = []
        def handler(conn):
            read_head(conn)
            first = conn.recv(1024)
            # No CL: client must stop writing before waiting for this response's EOF.
            conn.sendall(b'HTTP/1.1 413 Content Too Large\r\n\r\ndenied')
            received.append(len(first) + drain_to_eof(conn))
        with peer(handler) as port:
            result = upload(port, 'upload-fixed')
            self.assertEqual(result, {b'status': b'413', b'error': b'0', b'reusable': b'0', b'body': b'denied'})
        self.assertLess(received[0], SIZE // 8)

    def test_early_success_does_not_reuse_unfinished_request(self):
        received = []
        def handler(conn):
            read_head(conn)
            first = conn.recv(1024)
            conn.sendall(b'HTTP/1.1 200 OK\r\nConnection: keep-alive\r\nContent-Length: 2\r\n\r\nok')
            received.append(len(first) + drain_to_eof(conn))
        with peer(handler) as port:
            result = upload(port, 'upload-chunked')
            self.assertEqual(result, {b'status': b'200', b'error': b'0', b'reusable': b'0', b'body': b'ok'})
        self.assertLess(received[0], SIZE // 8)

    def test_expect_fallback_remains_interruptible(self):
        received = []
        def handler(conn):
            self.assertIn(b'expect: 100-continue', read_head(conn))
            # No interim response: wait for the one-second fallback, then reject.
            first = conn.recv(1024)
            self.assertTrue(first)
            conn.sendall(b'HTTP/1.1 413 Content Too Large\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            received.append(len(first) + drain_to_eof(conn))
        with peer(handler) as port:
            result = upload(port, 'upload-expect-chunked')
            self.assertEqual(result[b'status'], b'413')
            self.assertEqual(result[b'error'], b'0')
            self.assertEqual(result[b'reusable'], b'0')
        self.assertLess(received[0], SIZE // 8)

    def test_informationals_do_not_abort_or_restart_upload(self):
        size = 262144
        expected = bytes(i % 251 for i in range(size))
        for mode in ('upload-fixed', 'upload-chunked', 'upload-expect-fixed', 'upload-expect-chunked'):
            def handler(conn):
                head = read_head(conn)
                if b'expect: 100-continue' in head:
                    conn.sendall(b'HTTP/1.1 100 Continue\r\n\r\n')
                with conn.makefile('rb') as stream:
                    chunked = b'Transfer-Encoding: chunked' in head
                    if chunked:
                        self.assertEqual(int(stream.readline(), 16), size)
                    first = stream.read(1024)
                    self.assertEqual(first, expected[:1024])
                    conn.sendall(b'HTTP/1.1 103 Early Hints\r\nLink: </x>\r\n\r\nHTTP/1.1 100 Continue\r\n\r\n')
                    self.assertEqual(first + stream.read(size - len(first)), expected)
                    if chunked:
                        self.assertEqual(stream.readline(), b'\r\n')
                        self.assertEqual(stream.readline(), b'0\r\n')
                        self.assertEqual(stream.readline(), b'x-end: done\r\n')
                        self.assertEqual(stream.readline(), b'\r\n')
                    conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok')
            with self.subTest(mode=mode), peer(handler) as port:
                result = upload(port, mode, size)
                self.assertEqual(result, {b'status': b'200', b'error': b'0', b'reusable': b'1', b'body': b'ok'})

    def test_partial_rejection_head_keeps_transaction_deadline(self):
        received = []
        def handler(conn):
            read_head(conn)
            first = conn.recv(1024)
            conn.sendall(b'HTTP/1.1 413')
            # Do not finish the head. Reading an early response must not reset the deadline.
            received.append(len(first) + drain_to_eof(conn))
        with peer(handler) as port:
            result = upload(port, 'upload-fixed')
            self.assertEqual(result[b'error'], b'408')
            self.assertEqual(result[b'reusable'], b'0')
        self.assertLess(received[0], SIZE // 8)

    def test_malformed_and_incomplete_early_responses_fail_closed(self):
        for wire in (b'HTTP/1.1 bad\r\n\r\n',
                     b'HTTP/1.1 413 Error\r\nContent-Length: 10\r\n\r\nbad',
                     b'HTTP/1.1 103 Early Hints\r\n\r\n' * 33):
            received = []
            def handler(conn):
                read_head(conn)
                first = conn.recv(1024)
                conn.sendall(wire)
                conn.shutdown(socket.SHUT_WR)
                received.append(len(first) + drain_to_eof(conn))
            with self.subTest(wire=wire[:70]), peer(handler) as port:
                result = upload(port, 'upload-fixed')
                self.assertNotEqual(result[b'error'], b'0')
                self.assertEqual(result[b'reusable'], b'0')
            self.assertLess(received[0], SIZE // 8)


if __name__ == '__main__':
    unittest.main(verbosity=2)
