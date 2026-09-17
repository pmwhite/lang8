import base64
import hashlib
import os
import socket
import struct
import subprocess
import threading
import time
import unittest


BUILD = os.environ.get("WEBSOCKET_BUILD", ".build/websocket")
SERVER = os.path.join(BUILD, "server")
CLIENT = os.path.join(BUILD, "client")


def recv_exact(sock, count):
    data = b""
    while len(data) < count:
        part = sock.recv(count - len(data))
        if not part:
            raise EOFError("connection closed")
        data += part
    return data


def recv_head(sock):
    data = b""
    while b"\r\n\r\n" not in data:
        data += recv_exact(sock, 1)
    return data


def frame(opcode, payload=b"", *, fin=True, masked=False, key=b"\x11\x22\x33\x44"):
    first = opcode | (0x80 if fin else 0)
    length = len(payload)
    mark = 0x80 if masked else 0
    if length < 126:
        head = bytes((first, mark | length))
    elif length <= 0xFFFF:
        head = bytes((first, mark | 126)) + struct.pack("!H", length)
    else:
        head = bytes((first, mark | 127)) + struct.pack("!Q", length)
    if not masked:
        return head + payload
    coded = bytes(byte ^ key[i % 4] for i, byte in enumerate(payload))
    return head + key + coded


def read_frame(sock):
    first, second = recv_exact(sock, 2)
    length = second & 0x7F
    if length == 126:
        length = struct.unpack("!H", recv_exact(sock, 2))[0]
    elif length == 127:
        length = struct.unpack("!Q", recv_exact(sock, 8))[0]
    masked = bool(second & 0x80)
    key = recv_exact(sock, 4) if masked else b""
    payload = recv_exact(sock, length)
    if masked:
        payload = bytes(byte ^ key[i % 4] for i, byte in enumerate(payload))
    return bool(first & 0x80), first & 0x0F, masked, payload


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class L8Server(unittest.TestCase):
    def setUp(self):
        self.port = free_port()
        self.process = subprocess.Popen(
            [SERVER, str(self.port)], stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        self.assertEqual(self.process.stdout.readline(), b"ready\n")

    def tearDown(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.process.stdout.close()
        self.process.stderr.close()

    def connect(self):
        sock = socket.create_connection(("127.0.0.1", self.port), timeout=3)
        key = "dGhlIHNhbXBsZSBub25jZQ=="
        request = (
            "GET /echo HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: keep-alive, Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode()
        sock.sendall(request)
        response = recv_head(sock)
        self.assertIn(b"HTTP/1.1 101 Switching Protocols\r\n", response)
        self.assertIn(b"sec-websocket-accept: s3pplmbitxaq9kygzzhzrbk+xoo=\r\n", response.lower())
        return sock

    def test_fragment_ping_echo_and_close(self):
        with self.connect() as sock:
            sock.sendall(frame(1, b"hel", fin=False, masked=True))
            sock.sendall(frame(9, b"p", masked=True))
            sock.sendall(frame(0, b"lo", masked=True))
            self.assertEqual(read_frame(sock), (True, 10, False, b"p"))
            self.assertEqual(read_frame(sock), (True, 1, False, b"hello"))
            sock.sendall(frame(8, struct.pack("!H", 1000), masked=True))
            self.assertEqual(read_frame(sock), (True, 8, False, struct.pack("!H", 1000)))

    def test_rejects_unmasked_client_frame(self):
        with self.connect() as sock:
            sock.sendall(frame(1, b"bad"))
            fin, opcode, masked, payload = read_frame(sock)
            self.assertEqual((fin, opcode, masked), (True, 8, False))
            self.assertEqual(struct.unpack("!H", payload[:2])[0], 1002)

    def test_extended_binary_length(self):
        with self.connect() as sock:
            payload = bytes(range(130))
            sock.sendall(frame(2, payload, masked=True))
            self.assertEqual(read_frame(sock), (True, 2, False, payload))
            sock.sendall(frame(8, struct.pack("!H", 1000), masked=True))
            read_frame(sock)

    def test_rejects_invalid_text_utf8(self):
        with self.connect() as sock:
            sock.sendall(frame(1, b"\xc0\x80", masked=True))
            fin, opcode, masked, payload = read_frame(sock)
            self.assertEqual((fin, opcode, masked), (True, 8, False))
            self.assertEqual(struct.unpack("!H", payload[:2])[0], 1007)


class L8Client(unittest.TestCase):
    def test_masking_buffered_frames_ping_and_close(self):
        port = free_port()
        ready = threading.Event()
        failures = []

        def peer():
            try:
                with socket.socket() as listener:
                    listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    listener.bind(("127.0.0.1", port))
                    listener.listen()
                    ready.set()
                    conn, _ = listener.accept()
                    with conn:
                        conn.settimeout(3)
                        request = recv_head(conn)
                        headers = {}
                        for line in request.decode().split("\r\n")[1:]:
                            if ":" in line:
                                name, value = line.split(":", 1)
                                headers[name.lower()] = value.strip()
                        accept = base64.b64encode(
                            hashlib.sha1(
                                (headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()
                            ).digest()
                        ).decode()
                        response = (
                            "HTTP/1.1 101 Switching Protocols\r\n"
                            "Upgrade: websocket\r\n"
                            "Connection: Upgrade\r\n"
                            f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
                        ).encode()
                        # Coalesce upgraded bytes with the HTTP response to exercise
                        # preservation of bytes already buffered by HttpReader.
                        conn.sendall(
                            response
                            + frame(1, b"he", fin=False)
                            + frame(9, b"p")
                            + frame(0, b"llo")
                        )
                        self.assertEqual(read_frame(conn), (True, 1, True, b"from-client"))
                        self.assertEqual(read_frame(conn), (True, 10, True, b"p"))
                        fin, opcode, masked, payload = read_frame(conn)
                        self.assertEqual((fin, opcode, masked), (True, 8, True))
                        self.assertEqual(struct.unpack("!H", payload[:2])[0], 1000)
                        conn.sendall(frame(8, payload))
            except BaseException as error:
                failures.append(error)
                ready.set()

        thread = threading.Thread(target=peer)
        thread.start()
        self.assertTrue(ready.wait(2))
        result = subprocess.run(
            [CLIENT, "127.0.0.1", str(port), "/echo", "from-client"],
            capture_output=True,
            timeout=5,
        )
        thread.join(timeout=5)
        if failures:
            raise failures[0]
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.assertEqual(result.stdout, b"hello\n")


if __name__ == "__main__":
    unittest.main()
