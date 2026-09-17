import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[3]
BUILD = ROOT / ".build"


class VisibilityTests(unittest.TestCase):
    def test_codec_helpers_are_internal(self):
        compiler = os.environ.get("L8C", str(ROOT / "l8c1"))
        cases = [
            ("ws_sha1", 'ws_sha1("text");'),
            ("WsBuffer", "value: ?*WsBuffer = null;"),
            ("WsState", "value: ?*WsState = null;"),
            ("WS_MAX_MESSAGE", "value: int = WS_MAX_MESSAGE;"),
            ("ws_write_frame", "ws_write_frame(null, 1, bytes(\"\"), 0);"),
        ]
        with tempfile.TemporaryDirectory(dir=BUILD) as directory:
            source = Path(directory) / "visibility.l8"
            for name, expression in cases:
                with self.subTest(name=name):
                    source.write_text(
                        "tag application;\nuse_tag websocket;\n"
                        f'import "{ROOT / "programs/websocket/websocket.l8"}";\n'
                        f"main(): int {{ {expression} 0; }}\n"
                    )
                    result = subprocess.run(
                        [compiler, "compile", str(source)],
                        capture_output=True,
                        cwd=ROOT,
                        timeout=10,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    error = result.stderr.decode()
                    self.assertIn(name, error)
                    self.assertIn("websocket_internal", error)


if __name__ == "__main__":
    unittest.main()
