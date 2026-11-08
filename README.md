# Meta Ads Weekly Report Automation

Turns a daily campaign export from Meta Ads Manager into a client-ready HTML report: week-over-week KPIs, a per-campaign table, and plain-language flags for campaigns that need attention.

No dependencies. Python 3.9+ only.

## Quick start
```bash
# 1. Run on the included fictional sample
python src/report.py data/sample_export.csv --out output/report.html --client "Sample Client"

# 2. Open output/report.html in a browser

# 3. Run the tests
python -m unittest discover tests -v
```
A ready-made result is in `output/sample_report.html`.

## Using your own data
1. In Ads Manager choose the date range (at least 14 days), level **Campaigns**, breakdown **Time → Day**.
2. Columns needed: Campaign name, Day, Amount spent, Impressions, Link clicks, Results.
3. Export as CSV, then run:
```bash
python src/report.py my_export.csv --client "Acme Dental" --out output/acme.html
```
Optional: `--end 2026-11-01` to set the last day of the report week (default is the last day in the file).

## What you get
- KPI cards: spend, impressions, clicks, CTR, CPC, results, cost per result, each vs last week
- Campaign table with colored changes (green better, red worse)
- Flags with a reason, for example "Cost per result rose 76% versus last week"

| Flag | Rule |
|------|------|
| Cost per result up | more than 20% vs previous week |
| CTR down | more than 15% relative drop |
| Zero results | spent, but no results |
| New campaign | no previous week to compare |

Campaigns under 20 spend are not judged. Thresholds are constants at the top of `src/report.py`.

## How it works
```
CSV -> load_rows() -> aggregate() per week -> derive() ratios -> flags_for() -> render_html()
```
1. `find_columns` matches header aliases and reports every missing column at once.
2. `load_rows` parses typed rows and skips rows without a date (the "Total" row).
3. `aggregate` sums additive metrics per campaign for each 7-day window.
4. `derive` computes CTR, CPC, CPM, cost per result from the sums (never averages ratios).
5. `flags_for` applies the rules above. `render_html` writes one self-contained file.

## Project structure
```
PRD.md                  requirements, scope, acceptance criteria
PROMPTS.md              AI-assisted build log (prompts and iterations)
src/report.py           the whole tool, commented
tests/test_report.py    12 unit tests
data/sample_export.csv  fictional sample data
output/sample_report.html  example output
```

## Limitations
- Reach and frequency are left out on purpose: reach is not additive across days.
- Assumes dot decimals. European `12,50` exports must be converted first.
- Campaign level only. No Meta API connection, no scheduling or emailing.
- Flags point to where to look. They do not explain why, and they are not budget advice.

## Security note
Campaign names come from the CSV, so they are HTML-escaped before being written to the report (covered by a test).
