import unittest
from datetime import datetime, timezone

import macro_fred


class FredMacroTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc)

    def test_parse_missing_and_future(self):
        csv = "observation_date,SP500\n2026-10-08,8000.00\n2026-10-09,8080.00\n2026-10-10,.\n2026-10-12,9000\n"
        data = macro_fred.parse_fred_csv(csv, "SP500", self.now)
        self.assertEqual(data, [("2026-10-08", 8000), ("2026-10-09", 8080)])
        self.assertEqual(macro_fred.parse_fred_csv(csv, "UNSUPPORTED", self.now), [])

    def test_summary_fred_daily_sp500(self):
        values = [("2026-10-08", 8000.0), ("2026-10-09", 8080.0)]
        row = macro_fred.summarize_series("SP500", values, self.now)
        self.assertEqual(row["status"], "READY")
        self.assertEqual(row["observation_date"], "2026-10-09")
        self.assertEqual(row["change"], 1.0)
        self.assertEqual(row["change_unit"], "pct")
        self.assertEqual(row["source"], "FRED")

    def test_ust_yields_use_basis_points(self):
        values = [("2026-10-08", 3.51), ("2026-10-09", 3.55)]
        row = macro_fred.summarize_series("DGS10", values, self.now)
        self.assertEqual(row["change_unit"], "bp")
        self.assertEqual(row["change"], 4.0)

    def test_stale_and_no_leak(self):
        row = macro_fred.summarize_series("SP500", [
            ("2026-09-25", 100), ("2026-09-28", 101)
        ], self.now)
        self.assertEqual(row["status"], "NO_DATA")
        self.assertNotIn("value", row)
        self.assertNotIn("change", row)

    def test_proxy_label_and_no_fake_gold(self):
        self.assertIn("proxy ONLY", macro_fred.SERIES["DTWEXBGS"]["name"])
        self.assertNotIn("XAUUSD", macro_fred.SERIES)
        self.assertIn("XAUUSD", macro_fred.UNAVAILABLE)
        self.assertIn("DXY", macro_fred.UNAVAILABLE)


if __name__ == "__main__":
    unittest.main()
