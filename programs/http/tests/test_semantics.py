"""RFC 9110 origin semantics, tested through the real server with an independent client."""
import http.client
import unittest
from email import policy
from email.parser import BytesParser

from test_http import build
from test_network import server

BODY = b'Hello from L8 HTTP/1.1\n'
TAG = '"l8-hello-v1"'
DATE = 'Sun, 06 Nov 1994 08:49:37 GMT'


class SemanticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def fetch(self, port, headers, method='GET'):
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
        try:
            conn.request(method, '/', headers=headers)
            response = conn.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            conn.close()

    def test_etags_and_precedence_rfc9110_13(self):
        cases = [
            ({'If-Match': TAG}, 'GET', 200),
            ({'If-Match': '"other"'}, 'GET', 412),
            ({'If-Match': 'W/' + TAG}, 'GET', 412),
            ({'If-Match': '*'}, 'GET', 200),
            ({'If-None-Match': '*'}, 'GET', 304),
            ({'If-None-Match': TAG}, 'GET', 304),
            ({'If-None-Match': 'W/' + TAG}, 'GET', 304),
            ({'If-None-Match': '"no", ' + TAG}, 'GET', 304),
            ({'If-None-Match': '"comma,in,tag", W/' + TAG}, 'GET', 304),
            ({'If-None-Match': TAG}, 'HEAD', 304),
            ({'If-Match': '"no"', 'If-None-Match': TAG}, 'GET', 412),
            ({'If-Match': TAG, 'If-Unmodified-Since': 'Sun, 06 Nov 1994 08:49:36 GMT'}, 'GET', 200),
            ({'If-None-Match': '"different"', 'If-Modified-Since': DATE}, 'GET', 200),
            ({'If-None-Match': TAG, 'Range': 'bytes=0-1'}, 'GET', 304),
        ]
        with server() as port:
            for headers, method, expected in cases:
                with self.subTest(headers=headers, method=method):
                    status, fields, body = self.fetch(port, headers, method)
                    self.assertEqual(status, expected)
                    self.assertEqual(body, BODY if expected == 200 and method != 'HEAD' else b'')
                    self.assertEqual(fields['etag'], TAG)
                    if status == 304:
                        self.assertNotIn('Content-Length', fields)

    def test_three_date_formats_rfc9110_5_6_7(self):
        with server() as port:
            for date in [DATE, 'Sunday, 06-Nov-94 08:49:37 GMT', 'Sun Nov  6 08:49:37 1994']:
                with self.subTest(date=date):
                    self.assertEqual(self.fetch(port, {'If-Modified-Since': date})[0], 304)
                    self.assertEqual(self.fetch(port, {'If-Unmodified-Since': date})[0], 200)
            for date in ['not a date', 'Sun, 31 Feb 1994 08:49:37 GMT', DATE + 'junk']:
                self.assertEqual(self.fetch(port, {'If-Modified-Since': date})[0], 200)
            self.assertEqual(self.fetch(port, {'If-Modified-Since': 'Sun, 06 Nov 1994 08:49:36 GMT'})[0], 200)
            self.assertEqual(self.fetch(port, {'If-Unmodified-Since': 'Sun, 06 Nov 1994 08:49:36 GMT'})[0], 412)

    def test_single_ranges_rfc9110_14(self):
        cases = [
            ('bytes=0-4', 206, BODY[:5]),
            ('bytes= 0-4', 206, BODY[:5]),  # RFC 9110 verified erratum 7306
            ('bytes=6-', 206, BODY[6:]),
            ('bytes=-4', 206, BODY[-4:]),
            ('bytes=-9999999999999999999999999999', 206, BODY),
            ('bytes=0-9999999999999999999999999999', 206, BODY),
            ('bytes=9999999999999999999999999999-', 416, b''),
            ('bytes=100-', 416, b''),
            ('bytes=-0', 416, b''),
            ('bytes=9-3', 200, BODY),
            ('bytes=invalid', 200, BODY),
            ('bytes=', 200, BODY),
            ('bytes=0-1,', 200, BODY),
            ('bytes=0-1, 100-', 206, BODY[:2]),
            ('widgets=0-4', 200, BODY),
            ('bytes=' + ','.join(['0-1'] * 17), 200, BODY),
        ]
        with server() as port:
            for value, expected, content in cases:
                with self.subTest(value=value):
                    status, headers, body = self.fetch(port, {'Range': value})
                    self.assertEqual(status, expected)
                    self.assertEqual(body, content)
                    if status == 416:
                        self.assertEqual(headers['content-range'], f'bytes */{len(BODY)}')
                    if status == 206:
                        self.assertTrue(headers['content-range'].endswith(f'/{len(BODY)}'))
            status, fields, body = self.fetch(port, {'Range': 'bytes=0-4'}, 'HEAD')
            self.assertEqual(status, 200)
            self.assertEqual(fields['Content-Length'], str(len(BODY)))
            self.assertEqual(body, b'')

    def test_multipart_ranges(self):
        with server() as port:
            status, headers, body = self.fetch(port, {'Range': 'bytes=0-4, 6-9'})
        self.assertEqual(status, 206)
        message = BytesParser(policy=policy.default).parsebytes(b'Content-Type: ' + headers['content-type'].encode() + b'\r\n\r\n' + body)
        self.assertTrue(message.is_multipart())
        parts = list(message.iter_parts())
        self.assertEqual([part.get_payload(decode=True) for part in parts], [BODY[:5], BODY[6:10]])
        self.assertEqual([part['Content-Range'] for part in parts], [f'bytes 0-4/{len(BODY)}', f'bytes 6-9/{len(BODY)}'])

    def test_if_range_rfc9110_13_1_5(self):
        with server() as port:
            for validator, expected in [(TAG, 206), ('W/' + TAG, 200), ('"different"', 200), (DATE, 206), ('Mon, 07 Nov 1994 08:49:37 GMT', 200), ('invalid', 200)]:
                with self.subTest(validator=validator):
                    status, _, body = self.fetch(port, {'Range': 'bytes=0-4', 'If-Range': validator})
                    self.assertEqual(status, expected)
                    self.assertEqual(body, BODY[:5] if expected == 206 else BODY)


if __name__ == '__main__':
    unittest.main(verbosity=2)
