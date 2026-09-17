"""Deterministic RFC850 rollover checks using an explicitly supplied current time."""
from datetime import datetime, timedelta, timezone
import subprocess
import unittest

from test_http import BUILD, build


def utc(year, month=1, day=1, hour=0, minute=0, second=0):
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


def parse_date(now, text):
    result = subprocess.run([str(BUILD / 'date'), str(int(now.timestamp())), text],
                            capture_output=True, timeout=5, check=True)
    return int(result.stdout)


def obsolete(date):
    return date.strftime('%A, %d-%b-%y %H:%M:%S GMT')


class DateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        build()

    def test_full_timestamp_fifty_year_boundary(self):
        now = utc(2026, 9, 16, 12, 34, 56)
        cutoff = utc(2076, 9, 16, 12, 34, 56)
        for delta in (-86400, -3600, -60, -1, 0, 1, 60, 3600, 86400, 32 * 86400):
            date = cutoff + timedelta(seconds=delta)
            expected = date if delta <= 0 else date.replace(year=1976)
            with self.subTest(delta=delta):
                self.assertEqual(parse_date(now, obsolete(date)), int(expected.timestamp()))

    def test_century_rollover_and_leap_dates(self):
        for now, wire_date, expected in [
            (utc(1999, 12, 31), utc(2000, 1, 1), utc(2000, 1, 1)),
            (utc(2090), utc(2120), utc(2120)),
            (utc(2090), utc(2070), utc(2070)),
            (utc(2050), utc(2100), utc(2100)),
            (utc(2050), utc(2100, second=1), utc(2000, second=1)),
            (utc(2026, 2, 28), utc(2076, 2, 29), utc(1976, 2, 29)),
            (utc(2026, 3, 1), utc(2076, 2, 29), utc(2076, 2, 29)),
            # Interpret the century before validating the calendar date (1900/2100 aren't leap years).
            (utc(2050), utc(2000, 2, 29), utc(2000, 2, 29)),
        ]:
            with self.subTest(now=now, date=wire_date):
                self.assertEqual(parse_date(now, obsolete(wire_date)), int(expected.timestamp()))

    def test_explicit_years_and_invalid_dates_do_not_roll(self):
        now = utc(2026, 9, 16, 12, 34, 56)
        self.assertEqual(parse_date(now, 'Wed, 16 Sep 2076 12:34:57 GMT'), int(utc(2076, 9, 16, 12, 34, 57).timestamp()))
        self.assertEqual(parse_date(now, 'Wed Sep 16 12:34:57 2076'), int(utc(2076, 9, 16, 12, 34, 57).timestamp()))
        self.assertEqual(parse_date(now, 'Thursday, 31-Feb-76 12:34:56 GMT'), -9223372036854775807)
        self.assertEqual(parse_date(now, 'Sunday, 06-Nov-94 08:49:37 GMT'), 784111777)


if __name__ == '__main__':
    unittest.main(verbosity=2)
