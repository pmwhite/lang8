import pathlib
import subprocess
import sys
import unittest

from tools.check_index_migrate import candidates, code_mask, replace_many


ROOT = pathlib.Path(__file__).resolve().parents[1]


class ScannerTests(unittest.TestCase):
    def test_inline_paths_and_comments(self):
        source = (
            b'// a[check_index(a, 0)]\n'
            b'"b[check_index(b, 0)]";\n'
            b'a[check_index(a, 0)] = b.data[check_index(b.data, b.cursor)];\n'
            b'a[check_index(a, get_index())];\n'
        )
        self.assertEqual(2, len(candidates(ROOT / "sample.l8", source)))
        self.assertNotIn(b"check_index", code_mask(source[:29]))

    def test_replacements_use_original_offsets(self):
        source = b"a[check_index(a, 0)] + a[check_index(a, 1)]"
        sites = candidates(ROOT / "sample.l8", source)
        self.assertEqual(b"a[0] + a[1]", replace_many(source, sites))


class TrialTests(unittest.TestCase):
    def test_classifications(self):
        script = ROOT / "tools/check_index_migrate.py"
        for name, expected in (
            ("removable", ": removable"),
            ("caller", ": needs caller change"),
            ("keep", ": keep runtime check"),
        ):
            with self.subTest(name=name):
                source = ROOT / f"tests/compiler/bounds_check_migration_{name}.l8"
                result = subprocess.run(
                    [sys.executable, str(script), str(source),
                     "--workspace", str(ROOT), "--compiler", str(ROOT / "l8c3")],
                    capture_output=True, text=True, cwd=ROOT,
                )
                self.assertEqual(0, result.returncode, result.stderr)
                self.assertIn(expected, result.stdout)


if __name__ == "__main__":
    unittest.main()
