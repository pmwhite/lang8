import pathlib
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

from tools import expect


class ExpectTests(unittest.TestCase):
    def fixture(self, text: str) -> pathlib.Path:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        path = pathlib.Path(self.temp.name) / "case.l8"
        path.write_text(text, encoding="utf-8")
        return path

    def test_parses_exact_output_with_trailing_newline(self) -> None:
        source = self.fixture('main(): int { 0 }\n//% test: run\n//% stdout: "Hi\\n"\n//% exit: 0\n')
        self.assertEqual(expect.expectations(source)["stdout"], "Hi\n")

    def test_rejects_unknown_and_duplicate_directives(self) -> None:
        unknown = self.fixture("//% test: run\n//% output: \"Hi\"\n")
        with self.assertRaisesRegex(ValueError, "invalid expectation"):
            expect.expectations(unknown)
        duplicate = self.fixture("//% test: run\n//% stdout: \"Hi\"\n//% stdout: \"Bye\"\n//% exit: 0\n")
        with self.assertRaisesRegex(ValueError, "duplicate stdout"):
            expect.expectations(duplicate)

    def test_checks_trailing_newline_exactly(self) -> None:
        source = self.fixture('//% test: run\n//% stdout: "Hi\\n"\n//% exit: 0\n')
        build = subprocess.CompletedProcess([], 0, b"", b"")
        run = subprocess.CompletedProcess([], 0, b"Hi", b"")
        with mock.patch.object(expect.subprocess, "run", side_effect=[build, run]):
            with self.assertRaisesRegex(ValueError, "stdout"):
                expect.run_one(pathlib.Path("compiler"), pathlib.Path(self.temp.name), source)

    def test_compiler_warnings_are_expected_without_source_locations(self) -> None:
        source = self.fixture('//% test: run\n//% stdout: ""\n//% exit: 0\n//% compiler-warnings: ["unused local value in main"]\n')
        build = subprocess.CompletedProcess([], 0, b"", b"warning: case.l8:4:7: unused local value in main\n")
        run = subprocess.CompletedProcess([], 0, b"", b"")
        with mock.patch.object(expect.subprocess, "run", side_effect=[build, run]):
            expect.run_one(pathlib.Path("compiler"), pathlib.Path(self.temp.name), source)

    def test_unexpected_compiler_warning_fails(self) -> None:
        source = self.fixture('//% test: run\n//% stdout: ""\n//% exit: 0\n')
        build = subprocess.CompletedProcess([], 0, b"", b"warning: case.l8:4:7: unused local value in main\n")
        with mock.patch.object(expect.subprocess, "run", return_value=build):
            with self.assertRaisesRegex(ValueError, "compiler warnings"):
                expect.run_one(pathlib.Path("compiler"), pathlib.Path(self.temp.name), source)

    def test_compile_failure_requires_matching_error(self) -> None:
        source = self.fixture('//% test: compile-fail\n//% error-contains: "type mismatch"\n')
        result = subprocess.CompletedProcess([], 1, b"", b"error: undefined variable\n")
        with mock.patch.object(expect.subprocess, "run", return_value=result):
            with self.assertRaisesRegex(ValueError, "type mismatch"):
                expect.run_one(pathlib.Path("compiler"), pathlib.Path(self.temp.name), source)

    def test_discovers_only_marked_sources_and_filters_bootstrap(self) -> None:
        root = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root)
        (root / "bootstrap.l8").write_text('//% test: run\n//% stdout: ""\n//% exit: 0\n//% bootstrap: true\n')
        (root / "later.l8").write_text('//% test: compile-fail\n//% error-contains: "bad"\n')
        (root / "helper.l8").write_text('main(): int { 0 }\n')
        (root / "notes.txt").write_text('//% test: run\n')
        self.assertEqual([p.name for p in expect.discover([root, root])], ["bootstrap.l8", "later.l8"])
        self.assertEqual([p.name for p in expect.discover([root], bootstrap_only=True)], ["bootstrap.l8"])
        empty = root / "empty"
        empty.mkdir()
        with self.assertRaisesRegex(ValueError, "no tests discovered"):
            expect.discover([empty])


if __name__ == "__main__":
    unittest.main()
