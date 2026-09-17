"""Public imports must not make implementation helpers available to callers."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

from test_http import BUILD, ROOT, build


class VisibilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_internal_declarations_are_not_public(self):
        compiler = os.environ.get('L8C', str(BUILD / 'l8c1'))
        cases = [
            ('http', 'http/http.l8', 'http_decimal', 'http_decimal("1");'),
            ('http', 'http/http.l8', 'HttpUpload', 'value: ?*HttpUpload = null;'),
            ('http', 'http/http.l8', 'close', 'close(-1);'),
            ('freetype', 'freetype/ft.l8', 'empty_glyph', 'empty_glyph();'),
            ('freetype', 'freetype/ft.l8', 'FT_FaceRec', 'value: ?*FT_FaceRec = null;'),
        ]
        with tempfile.TemporaryDirectory(dir=BUILD) as directory:
            source = Path(directory) / 'visibility.l8'
            for tag, library, name, expression in cases:
                with self.subTest(name=name):
                    source.write_text(
                        f'tag application;\nuse_tag {tag};\n'
                        f'import "{ROOT / "programs" / library}";\n'
                        f'main(): int {{ {expression} 0; }}\n')
                    result = subprocess.run([compiler, 'compile', str(source)],
                                            capture_output=True, cwd=ROOT, timeout=10)
                    self.assertNotEqual(result.returncode, 0)
                    error = result.stderr.decode()
                    self.assertIn(name, error)
                    self.assertIn(tag + '_internal', error)
