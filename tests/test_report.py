"""Unit tests for report.py. Run from the project root: python -m unittest discover tests -v"""
import csv
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
import report  # noqa: E402


def write_csv(rows, header=("Campaign name", "Day", "Amount spent (USD)", "Impressions", "Link clicks", "Results")):
    handle = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="")
    writer = csv.writer(handle)
    writer.writerow(header)
    writer.writerows(rows)
    handle.close()
    return handle.name


def daily(campaign, start_day, days, spend, impressions, clicks, results):
    """Build `days` identical daily rows starting at start_day (an int day of Nov 2026)."""
    return [[campaign, date(2026, 11, start_day + i).isoformat(), spend, impressions, clicks, results]
            for i in range(days)]


class ParsingTests(unittest.TestCase):
    def test_to_float_handles_currency_commas_percent_and_blanks(self):
        self.assertEqual(report.to_float("$1,234.50"), 1234.5)
        self.assertEqual(report.to_float("3.2%"), 3.2)
        self.assertEqual(report.to_float(""), 0.0)
        self.assertEqual(report.to_float("-"), 0.0)
        self.assertEqual(report.to_float("abc"), 0.0)

    def test_find_columns_accepts_other_currency_headers(self):
        cols = report.find_columns(["Campaign name", "Day", "Amount spent (EUR)", "Impressions", "Link clicks", "Leads"])
        self.assertEqual(cols["spend"], "Amount spent (EUR)")
        self.assertEqual(cols["results"], "Leads")

    def test_missing_columns_are_all_reported_at_once(self):
        with self.assertRaises(ValueError) as ctx:
            report.find_columns(["Campaign name", "Day"])
        message = str(ctx.exception)
        self.assertIn("spend", message)
        self.assertIn("impressions", message)

    def test_total_row_without_date_is_skipped(self):
        path = write_csv(daily("A", 1, 2, 10, 1000, 20, 1) + [["Total", "", 20, 2000, 40, 2]])
        self.assertEqual(len(report.load_rows(path)), 2)


class MetricTests(unittest.TestCase):
    def test_ratios_are_computed_from_sums(self):
        d = report.derive({"spend": 100.0, "impressions": 10000.0, "clicks": 200.0, "results": 10.0})
        self.assertAlmostEqual(d["ctr"], 0.02)
        self.assertAlmostEqual(d["cpc"], 0.5)
        self.assertAlmostEqual(d["cpm"], 10.0)
        self.assertAlmostEqual(d["cpr"], 10.0)

    def test_zero_denominators_return_none_not_crash(self):
        d = report.derive({"spend": 50.0, "impressions": 0.0, "clicks": 0.0, "results": 0.0})
        self.assertIsNone(d["ctr"])
        self.assertIsNone(d["cpr"])

    def test_week_windows_split_correctly(self):
        # Days 1-7 spend 10/day, days 8-14 spend 20/day, latest day is 14.
        rows = report.load_rows(write_csv(daily("A", 1, 7, 10, 1000, 20, 2) + daily("A", 8, 7, 20, 1000, 20, 2)))
        result = report.build_report(rows)
        self.assertEqual(result["total_before"]["spend"], 70)
        self.assertEqual(result["total_now"]["spend"], 140)


class FlagTests(unittest.TestCase):
    def build(self, last, now):
        rows = daily("A", 1, 7, *last) + daily("A", 8, 7, *now)
        return report.build_report(report.load_rows(write_csv(rows)))["campaigns"][0]["flags"]

    def test_cost_per_result_spike_is_flagged(self):
        flags = self.build(last=(10, 1000, 20, 2), now=(20, 1000, 20, 2))  # CPR 5 -> 10
        self.assertTrue(any("Cost per result rose" in f for f in flags))

    def test_zero_results_is_flagged(self):
        flags = self.build(last=(10, 1000, 20, 2), now=(10, 1000, 20, 0))
        self.assertTrue(any("zero results" in f for f in flags))

    def test_healthy_campaign_has_no_flags(self):
        self.assertEqual(self.build(last=(10, 1000, 20, 2), now=(10, 1000, 20, 2)), [])

    def test_tiny_spend_is_not_judged(self):
        self.assertEqual(self.build(last=(1, 100, 2, 1), now=(1, 100, 2, 0)), [])


class RenderTests(unittest.TestCase):
    def test_campaign_names_are_html_escaped(self):
        evil = "<script>alert(1)</script>"
        rows = daily(evil, 1, 14, 10, 1000, 20, 1)
        result = report.build_report(report.load_rows(write_csv(rows)))
        page = report.render_html(result, "Client <b>X</b>")
        self.assertNotIn("<script>alert(1)", page)
        self.assertIn("&lt;script&gt;", page)
        self.assertIn("Client &lt;b&gt;X&lt;/b&gt;", page)


if __name__ == "__main__":
    unittest.main()
