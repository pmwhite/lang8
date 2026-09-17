import os
import random
import socket
import subprocess
import unittest
from test_http import BUILD, build, parse, request
from test_network import peer, read_head, server, connect


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_l8_unit_suite(self):
        result = subprocess.run([str(BUILD / 'unit')], capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(b'API checks', result.stdout)

    def test_streaming_buffers(self):
        data = bytes(range(256)) * 3
        fixed = request(b'Host: a\r\nContent-Length: 768\r\n', data, b'POST')
        chunked = request(b'Host: a\r\nTransfer-Encoding: chunked\r\n', b'101\r\n' + data[:257] + b'\r\n1ff\r\n' + data[257:] + b'\r\n0\r\nX-Final: done\r\n\r\n', b'POST')
        closed = b'HTTP/1.1 200 OK\r\n\r\n' + data
        for wire, response in [(fixed, False), (chunked, False), (closed, True)]:
            for size in [1, 2, 3, 7, 256, 511, 768, 8192]:
                with self.subTest(size=size, response=response):
                    result = parse(wire, response, buffer_size=size)
                    self.assertEqual(result['error'], 0)
                    self.assertEqual(result['body'], data)
                    self.assertEqual(result['consumed'], len(wire))
        self.assertEqual(parse(fixed, buffer_size=0)['error'], 400)

    def test_many_small_chunks(self):
        count = 100000
        wire = request(b'Host: a\r\nTransfer-Encoding: chunked\r\n', b'1;x=y\r\nx\r\n' * count + b'0\r\n\r\n', b'POST')
        result = parse(wire)
        self.assertEqual(result['error'], 0)
        self.assertEqual(result['body'], b'x' * count)

    def test_generated_binary_chunk_cases(self):
        rng = random.Random(9112)
        for case in range(100):
            chunks = [rng.randbytes(rng.randrange(1, 1024)) for _ in range(rng.randrange(1, 8))]
            wire = b''.join(f'{len(chunk):X};case={case}\r\n'.encode() + chunk + b'\r\n' for chunk in chunks) + b'0\r\n\r\n'
            result = parse(request(b'Host: a\r\nTransfer-Encoding: ChUnKeD\r\n', wire, b'POST'))
            with self.subTest(case=case):
                self.assertEqual(result['error'], 0)
                self.assertEqual(result['body'], b''.join(chunks))

    def test_mutated_messages_do_not_crash(self):
        rng = random.Random(9110)
        base = request(b'Host: example.test\r\nContent-Length: 4\r\n', b'body', b'POST')
        for case in range(200):
            wire = bytearray(base)
            for _ in range(rng.randrange(1, 5)):
                wire[rng.randrange(len(wire))] = rng.randrange(256)
            with self.subTest(case=case):
                result = parse(bytes(wire))
                self.assertIn('error', result)

    def test_client_reuses_connection_in_order(self):
        def handler(conn):
            for content in [b'one', b'two', b'three']:
                self.assertTrue(read_head(conn).startswith(b'GET / HTTP/1.1'))
                conn.sendall(b'HTTP/1.1 200 OK\r\nContent-Length: ' + str(len(content)).encode() + b'\r\n\r\n' + content)
        with peer(handler) as port:
            result = subprocess.run([str(BUILD / 'session'), str(port), 'reuse'], capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, b'onetwothree')

    def test_upgrade_and_connect_handoff_preserve_buffered_bytes(self):
        for mode, wire in [('upgrade', b'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\ntunnel'), ('connect', b'HTTP/1.1 200 Connected\r\nContent-Length: wrong\r\n\r\ntunnel')]:
            def handler(conn):
                head = read_head(conn)
                if mode == 'upgrade':
                    self.assertIn(b'Connection: keep-alive, Upgrade\r\n', head)
                conn.sendall(wire)
            with self.subTest(mode=mode), peer(handler) as port:
                result = subprocess.run([str(BUILD / 'session'), str(port), mode], capture_output=True, timeout=5)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, b'tunnel')

    def test_streaming_sender(self):
        with server() as port:
            result = subprocess.run([str(BUILD / 'session'), str(port), 'stream'], capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, b'firstsecondthird')

    def test_large_binary_roundtrip(self):
        import http.client
        data = bytes(range(256)) * 8192
        with server() as port:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
            conn.request('POST', '/chunked', data)
            response = conn.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.read(), data)
            conn.close()

    def test_request_limit_closes_after_final_response(self):
        import http.client
        with server() as port:
            conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
            for i in range(1000):
                conn.request('HEAD', '/')
                response = conn.getresponse()
                response.read()
                self.assertEqual(response.status, 200)
                if i == 999:
                    self.assertEqual(response.getheader('Connection'), 'close')
            conn.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
