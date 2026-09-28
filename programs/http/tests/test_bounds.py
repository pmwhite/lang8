"""Keep HTTP array accesses statically proved in generated code."""
import os
import re
import subprocess
import unittest

from test_http import BUILD, ROOT, build


class BoundsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_http_has_no_runtime_index_checks(self):
        compiler = os.environ.get('L8C', str(BUILD / 'l8c2'))
        result = subprocess.run(
            [compiler, 'compile', str(ROOT / 'programs/http/tests/unit.l8')],
            cwd=ROOT, capture_output=True, text=True, check=True)
        functions = re.split(r'^([A-Za-z_][A-Za-z_0-9]*):\s*$',
                             result.stdout, flags=re.MULTILINE)
        checked = 0
        for name, body in zip(functions[1::2], functions[2::2]):
            if not name.startswith('http_'):
                continue
            checked += 1
            # emit_check_idx compares the index in rcx with the length in rdx.
            # Count-loop branches also use jae, but compare different registers.
            self.assertNotRegex(body, r'cmp\s+%rdx,\s*%rcx\s*\n\s*jae\b', name)
            self.assertNotRegex(body, r'call\s+check_index\b', name)
        self.assertGreater(checked, 50, 'HTTP function bodies were not found')
