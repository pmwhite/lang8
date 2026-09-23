import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

from tools import lib_expect


class LibraryExpectTests(unittest.TestCase):
    def source(self, contents: str) -> pathlib.Path:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = pathlib.Path(temporary.name) / "unit.l8"
        path.write_text(contents, encoding="utf-8")
        return path

    @staticmethod
    def marker(position: int) -> bytes:
        return b"\x1e" + position.to_bytes(7, "little")

    def test_multiple_checkpoints_keep_newlines(self) -> None:
        path = self.source('write(1, "a\\n", 2);\n//% expect: "a\\n"\n'
                           'write(1, "b", 1);\n//% expect: "b"\n')
        order, expected, _, labels = lib_expect.expectations(path)
        actual = lib_expect.checkpoint_output(
            b"a\n" + self.marker(order[0]) + b"b" + self.marker(order[1])
        )
        self.assertEqual([expected[pos] for pos in order], ["a\n", "b"])
        self.assertEqual(lib_expect.compare(order, expected, actual, labels), [])

    def test_rejects_moved_or_uncheckpointed_output(self) -> None:
        with self.assertRaisesRegex(ValueError, "order mismatch"):
            lib_expect.compare([1], {1: "x"}, [(2, "x")])
        with self.assertRaisesRegex(ValueError, "trailing stdout"):
            lib_expect.checkpoint_output(b"x" + self.marker(1) + b"extra")

    def test_reports_value_diff_and_accepts_it(self) -> None:
        path = self.source('//% expect: "old"\n')
        order, expected, lines, _ = lib_expect.expectations(path)
        actual = [(order[0], "new\n")]
        self.assertIn('-"old"', lib_expect.compare(order, expected, actual)[0])
        lib_expect.accept(lines, dict(actual), path)
        self.assertIn('//% expect: "new\\n"', path.read_text())
        self.assertEqual(lib_expect.expectations(path)[1][order[0]], "new\n")

    def test_rejects_malformed_directive(self) -> None:
        path = self.source('//% expect: 123\n')
        with self.assertRaisesRegex(ValueError, "JSON string"):
            lib_expect.expectations(path)

    def test_discovers_marked_sources_only(self) -> None:
        first = self.source('//% expect: "x"\n')
        (first.parent / "helper.l8").write_text('main(): int { 0 }\n')
        self.assertEqual(lib_expect.discover([], [first.parent]), [first.resolve()])

    def test_accept_does_not_hide_program_failures(self) -> None:
        path = self.source('//% expect: "old"\n')
        build = subprocess.CompletedProcess([], 0, b"", b"")
        failed = subprocess.CompletedProcess([], 1, b"new", b"assertion failed\n")
        with mock.patch.object(lib_expect.subprocess, "run", side_effect=[build, failed]):
            with self.assertRaisesRegex(ValueError, "assertion failed"):
                lib_expect.run(path, pathlib.Path("compiler"), True)
        self.assertIn('"old"', path.read_text())


if __name__ == "__main__":
    unittest.main()
