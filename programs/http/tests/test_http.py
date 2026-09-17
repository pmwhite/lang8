"""RFC-linked black-box tests of the compiled L8 implementation (stdlib only)."""
import os
from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[3]
BUILD = Path(os.environ.get('HTTP_BUILD', str(ROOT / '.build/http'))).resolve()
_BUILT = False

def build():
    global _BUILT
    if _BUILT:
        return
    BUILD.mkdir(parents=True, exist_ok=True)
    compiler = os.environ.get('L8C')
    if compiler is None:
        compiler = str(BUILD / 'l8c1')
        subprocess.run([str(ROOT / 'bootstrap'), 'build', str(ROOT / 'src1/main.l8'),
                        '-o', compiler], cwd=ROOT, check=True)
    for name in ('probe', 'unit', 'session', 'date', 'server', 'client'):
        source = ('tests/' if name in ('probe', 'unit', 'session', 'date') else '') + name + '.l8'
        result = subprocess.run([compiler, 'build', str(ROOT / 'programs/http' / source),
                                 '-o', str(BUILD / name)], cwd=ROOT, capture_output=True)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace'))
    _BUILT = True


def parse(wire, response=False, method='GET', buffer_size=None):
    args = [str(BUILD / 'probe'), 'response' if response else 'request', method]
    if buffer_size is not None:
        args.append(str(buffer_size))
    result = subprocess.run(args,
                            input=wire, capture_output=True, timeout=5, check=True)
    out = {}
    for line in result.stdout.decode('ascii').splitlines():
        key, value = line.split('=', 1)
        if key in ('method', 'target', 'authority', 'body', 'reason'):
            value = bytes.fromhex(value)
        elif key in ('header', 'trailer'):
            name, value = value.split(':', 1)
            out.setdefault(key, []).append((bytes.fromhex(name), bytes.fromhex(value)))
            continue
        else:
            value = int(value)
        out[key] = value
    return out


def request(headers=b'Host: example.test\r\n', body=b'', method=b'GET', target=b'/', version=b'HTTP/1.1'):
    return method + b' ' + target + b' ' + version + b'\r\n' + headers + b'\r\n' + body


class ProtocolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_request_forms_rfc9112_3_2(self):
        cases = [
            (b'GET', b'/a%20b?q=1', b'example.test', b'/a%20b?q=1'),
            (b'GET', b'http://other.test:81/a?q=2', b'other.test:81', b'/a?q=2'),
            (b'GET', b'http://other.test?q=2', b'other.test', b'/?q=2'),
            (b'GET', b'http://other.test', b'other.test', b'/'),
            (b'OPTIONS', b'*', b'example.test', b'*'),
            (b'CONNECT', b'[::1]:443', b'[::1]:443', b'[::1]:443'),
            (b'CUSTOM', b'/', b'example.test', b'/'),
        ]
        for method, target, authority, normalized in cases:
            with self.subTest(target=target):
                out = parse(request(method=method, target=target))
                self.assertEqual(out['error'], 0)
                self.assertEqual(out['method'], method)
                self.assertEqual(out['target'], normalized)
                self.assertEqual(out['authority'], authority)

    def test_start_line_and_host_rejections_rfc9112_2_3(self):
        cases = [
            (request(headers=b''), 400),
            (request(headers=b'Host: a\r\nHost: a\r\n'), 400),
            (request(headers=b'Host: a,b\r\n'), 400),
            (request(headers=b'Host: a b\r\n'), 400),
            (request(headers=b'Host: user@host\r\n'), 400),
            (request(headers=b'Host: a:xyz\r\n'), 400),
            (request(headers=b'Host: [broken\r\n'), 400),
            (request(target=b'http://user@host/'), 400),
            (request(target=b'/bad#fragment'), 400),
            (request(target=b'/bad%xx'), 400),
            (request(target=b'example.test:80'), 400),
            (request(method=b'CONNECT', target=b'/'), 400),
            (request(method=b'GET', target=b'*'), 400),
            (request(method=b'GE(T'), 400),
            (request(version=b'HTTP/2.0'), 505),
            (request(version=b'http/1.1'), 400),
            (request(version=b'HTTP/1.11'), 400),
            (b'GET  / HTTP/1.1\r\nHost: a\r\n\r\n', 400),
            (b'GET / HTTP/1.1\nHost: a\n\n', 400),
            (request(target=b'/' + b'a' * 8200), 414),
        ]
        for wire, error in cases:
            with self.subTest(wire=wire[:100]):
                self.assertEqual(parse(wire)['error'], error)

    def test_header_grammar_rfc9112_5(self):
        valid = request(b'hOsT:\texample.test \t\r\nX-Case: \tvalue\t \r\nSet-Cookie: a=1\r\nSet-Cookie: b=2\r\nX-Obs: \xff\r\n')
        out = parse(valid)
        self.assertEqual(out['error'], 0)
        self.assertIn((b'x-case', b'value'), out['header'])
        self.assertEqual([v for k, v in out['header'] if k == b'set-cookie'], [b'a=1', b'b=2'])
        self.assertIn((b'x-obs', b'\xff'), out['header'])
        for header in [b'Host : a', b': a', b'X(a): b', b' X: y', b'\tcontinued', b'X: a\x00b', b'X: a\x7fb', b'X: a\x01b', b'X: a\rb']:
            with self.subTest(header=header):
                self.assertEqual(parse(request(b'Host: a\r\n' + header + b'\r\n'))['error'], 400)
        self.assertEqual(parse(request(b'Host: a\r\n' + b'X: y\r\n' * 100))['error'], 431)
        self.assertEqual(parse(request(b'Host: a\r\nX: ' + b'a' * 8200 + b'\r\n'))['error'], 431)

    def test_content_length_rfc9112_6_3(self):
        for value in [b'4', b'004', b'4, 4', b'4\r\nContent-Length: 4']:
            with self.subTest(value=value):
                out = parse(request(b'Host: a\r\nContent-Length: ' + value + b'\r\n', b'a\x00\xffbNEXT', b'POST'))
                self.assertEqual(out['error'], 0)
                self.assertEqual(out['body'], b'a\x00\xffb')
                self.assertEqual(out['consumed'], len(request(b'Host: a\r\nContent-Length: ' + value + b'\r\n', b'a\x00\xffb', b'POST')))
        for value in [b'-1', b'+4', b'4x', b'', b'4,5', b'4,', b',4', b'99999999999999999999999999', b'4\r\nContent-Length: 5']:
            with self.subTest(value=value):
                self.assertEqual(parse(request(b'Host: a\r\nContent-Length: ' + value + b'\r\n'))['error'], 400)
        self.assertEqual(parse(request(b'Host: a\r\nContent-Length: 16777217\r\n'))['error'], 413)
        self.assertEqual(parse(request(body=b'ignored'))['body'], b'')

    def test_chunked_rfc9112_7_1(self):
        head = b'Host: a\r\nTransfer-Encoding: chunked\r\n'
        chunks = b'3;foo=bar;quoted="a\\\"b"\r\na\x00b\r\n2\r\ncd\r\n0;end\r\nX-Checksum: ok\r\n\r\n'
        out = parse(request(head, chunks, b'POST'))
        self.assertEqual(out['error'], 0)
        self.assertEqual(out['body'], b'a\x00bcd')
        self.assertEqual(out['trailer'], [(b'x-checksum', b'ok')])
        for body in [b'-1\r\n', b'+1\r\n', b'x\r\n', b'1\nx\r\n0\r\n\r\n', b'1\r\nxXX0\r\n\r\n', b'1;=bad\r\nx\r\n0\r\n\r\n', b'1;x="unterminated\r\n', b'0\r\nContent-Length: 0\r\n\r\n', b'0\r\nHost: evil\r\n\r\n', b'0\r\nTransfer-Encoding: chunked\r\n\r\n']:
            with self.subTest(body=body):
                self.assertNotEqual(parse(request(head, body, b'POST'))['error'], 0)
        self.assertEqual(parse(request(head, b'1000001\r\n', b'POST'))['error'], 413)

    def test_transfer_encoding_rfc9112_6_1(self):
        for value, expected in [(b'chunked, chunked', 400), (b'chunked;foo=bar', 400), (b'gzip, chunked', 501), (b'gzip;level=1, chunked', 501), (b'gzip;x="a,b", chunked', 501), (b'gzip;flag, chunked', 400), (b'chunked, gzip', 400), (b'gzip', 400), (b'', 400)]:
            with self.subTest(value=value):
                self.assertEqual(parse(request(b'Host: a\r\nTransfer-Encoding: ' + value + b'\r\n'))['error'], expected)
        self.assertEqual(parse(request(b'Host: a\r\nTransfer-Encoding: chunked\r\nContent-Length: 0\r\n'))['error'], 400)
        self.assertEqual(parse(request(b'Host: a\r\nTransfer-Encoding: chunked\r\n', version=b'HTTP/1.0'))['error'], 400)

    def test_transfer_coding_empty_elements_rfc9110_5_6_1_2(self):
        values = [b',chunked,', b' , \tChUnKeD , , ', b'chunked,',
                  b',chunked', b'chunked' + b',' * 16,
                  b'\r\nTransfer-Encoding: ,chunked,\r\nTransfer-Encoding: ']
        for value in values:
            for response in (False, True):
                with self.subTest(value=value, response=response):
                    headers = b'Transfer-Encoding: ' + value + b'\r\n'
                    chunks = b'3\r\na\0b\r\n0\r\nX-End: yes\r\n\r\n'
                    wire = (b'HTTP/1.1 200 OK\r\n' + headers + b'\r\n' + chunks
                            if response else request(b'Host: a\r\n' + headers, chunks, b'POST'))
                    result = parse(wire + b'NEXT', response)
                    self.assertEqual(result['error'], 0)
                    self.assertEqual(result['body'], b'a\0b')
                    self.assertEqual(result['consumed'], len(wire))
                    self.assertEqual(result['trailer'], [(b'x-end', b'yes')])

    def test_empty_transfer_elements_do_not_weaken_framing(self):
        for value, expected in [
            (b'', 400), (b', ,', 400), (b'chunked' + b',' * 17, 400),
            (b',chunked,,chunked,', 400), (b',chunked,,gzip,', 400),
            (b',chunked;x=1,', 400), (b',chunked x,', 400),
            (b',gzip;flag,chunked,', 400), (b',gzip;x="a,b",chunked,', 501),
            (b',gzip;x="a,\\"b",chunked,', 501), (b',gzip;x="unterminated,chunked', 400),
        ]:
            with self.subTest(value=value):
                self.assertEqual(parse(request(b'Host: a\r\nTransfer-Encoding: ' + value + b'\r\n'))['error'], expected)
        for extra in [b'Content-Length: 0\r\n', b'Content-Length: 4\r\n']:
            self.assertEqual(parse(request(b'Host: a\r\nTransfer-Encoding: ,chunked,\r\n' + extra))['error'], 400)
        self.assertEqual(parse(request(b'Host: a\r\nTransfer-Encoding: ,chunked,\r\n', version=b'HTTP/1.0'))['error'], 400)
        # The Content-Length recovery rule remains intentionally strict.
        self.assertEqual(parse(request(b'Host: a\r\nContent-Length: ,4,\r\n', b'body'))['error'], 400)

    def test_persistence_rfc9112_9_3(self):
        for version, headers, close in [(b'HTTP/1.1', b'Host: a\r\n', 0), (b'HTTP/1.1', b'Host: a\r\nConnection: keep-alive, CLOSE\r\n', 1), (b'HTTP/1.0', b'', 1), (b'HTTP/1.0', b'Connection: Keep-Alive\r\n', 0), (b'HTTP/1.9', b'Host: a\r\n', 0)]:
            with self.subTest(version=version, headers=headers):
                out = parse(request(headers, version=version))
                self.assertEqual(out['error'], 0)
                self.assertEqual(out['close'], close)
        self.assertEqual(parse(b'\r\n' + request())['error'], 0)

    def test_response_body_precedence_rfc9112_6_3(self):
        cases = [
            (b'HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\nbody', 'HEAD', b'', 0),
            (b'HTTP/1.1 304 Not Modified\r\nContent-Length: 100000000\r\n\r\n', 'GET', b'', 0),
            (b'HTTP/1.1 204 No Content\r\n\r\nnext', 'GET', b'', 0),
            (b'HTTP/1.1 103 Early Hints\r\nLink: </a>\r\n\r\nnext', 'GET', b'', 0),
            (b'HTTP/1.1 200 Connected\r\nContent-Length: wrong\r\nTransfer-Encoding: weird\r\n\r\ntunnel', 'CONNECT', b'', 4),
            (b'HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: test\r\n\r\ntunnel', 'GET', b'', 4),
            (b'HTTP/1.1 200 OK\r\n\r\nbody', 'GET', b'body', 3),
            (b'HTTP/1.0 200 OK\r\n\r\nbody', 'GET', b'body', 3),
            (b'HTTP/1.1 200 \r\nContent-Length: 4\r\n\r\nbody', 'GET', b'body', 1),
            (b'HTTP/1.1 599 Custom\r\nContent-Length: 0\r\n\r\n', 'GET', b'', 1),
        ]
        for wire, method, body, framing in cases:
            with self.subTest(wire=wire):
                out = parse(wire, True, method)
                self.assertEqual(out['error'], 0)
                self.assertEqual(out['body'], body)
                self.assertEqual(out['framing'], framing)
        for line in [b'HTTP/1.1 99 Bad', b'HTTP/1.1 600 Bad', b'HTTP/1.1 200', b'HTTP/1.1 xyz Bad']:
            self.assertEqual(parse(line + b'\r\n\r\n', True)['error'], 400)

    def test_every_truncation_rfc9112_8(self):
        messages = [request(b'Host: a\r\nContent-Length: 4\r\n', b'body', b'POST'), request(b'Host: a\r\nTransfer-Encoding: chunked\r\n', b'4\r\nbody\r\n0\r\nX-T: yes\r\n\r\n', b'POST')]
        for message in messages:
            for cut in range(1, len(message)):
                with self.subTest(cut=cut, wire=message[:cut]):
                    self.assertNotEqual(parse(message[:cut])['error'], 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
