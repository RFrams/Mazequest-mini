#!/usr/bin/env python3
"""Meta Ads weekly report generator.

Reads a daily campaign export from Meta Ads Manager (CSV), compares the latest
7 days against the 7 days before, flags campaigns that need attention, and
writes a self-contained HTML report a client can open in any browser.

Standard library only, so it runs anywhere Python 3.9+ is installed.

Usage:
    python src/report.py data/sample_export.csv --out output/report.html \
        --client "Acme Dental" --end 2026-11-01
"""
import argparse
import csv
import html
import sys
from datetime import date, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# 1. Column mapping
# Ads Manager column names change with account currency and export presets,
# so each field we need accepts several header spellings (lowercase compare).
# ---------------------------------------------------------------------------
ALIASES = {
    "campaign": ["campaign name", "campaign"],
    "day": ["day", "date", "reporting starts"],
    "spend": ["amount spent (usd)", "amount spent (eur)", "amount spent (gbp)",
              "amount spent", "spend", "cost"],
    "impressions": ["impressions"],
    "clicks": ["link clicks", "clicks (all)", "clicks"],
    "results": ["results", "leads", "purchases"],
}

# Flag thresholds. Kept as named constants so they are easy to tune and explain.
MIN_SPEND_TO_JUDGE = 20.0      # ignore campaigns with tiny spend (too noisy)
CPR_INCREASE_LIMIT = 0.20      # cost per result up more than 20% -> flag
CTR_DROP_LIMIT = 0.15          # CTR down more than 15% (relative) -> flag


def to_float(value):
    """Parse '1,234.50', '$12', '3.2%' or '' into a float. Blank/invalid -> 0.0.

    Assumes a dot as the decimal separator (see README limitations).
    """
    if value is None:
        return 0.0
    text = str(value).strip()
    for junk in (",", "$", "€", "£", "%"):
        text = text.replace(junk, "")
    if text in ("", "-", "—"):
        return 0.0
    try:
        return float(text)
    except ValueError:
        return 0.0


def find_columns(header):
    """Map our field names to the real CSV header names.

    Raises ValueError listing every missing required field, so the user can fix
    the export in one go instead of one error at a time.
    """
    lowered = {name.strip().lower(): name for name in header}
    mapping, missing = {}, []
    for field, options in ALIASES.items():
        match = next((lowered[o] for o in options if o in lowered), None)
        if match is None:
            missing.append(f"{field} (looked for: {', '.join(options)})")
        else:
            mapping[field] = match
    if missing:
        raise ValueError("Missing columns in export: " + "; ".join(missing))
    return mapping


def load_rows(path):
    """Read the CSV into a list of dicts with typed values."""
    with open(path, newline="", encoding="utf-8-sig") as handle:  # utf-8-sig strips Excel BOM
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("The CSV file is empty.")
        cols = find_columns(reader.fieldnames)
        rows = []
        for raw in reader:
            try:
                day = date.fromisoformat(raw[cols["day"]].strip())
            except ValueError:
                continue  # skips Ads Manager's trailing 'Total' row and blanks
            rows.append({
                "campaign": raw[cols["campaign"]].strip(),
                "day": day,
                "spend": to_float(raw[cols["spend"]]),
                "impressions": to_float(raw[cols["impressions"]]),
                "clicks": to_float(raw[cols["clicks"]]),
                "results": to_float(raw[cols["results"]]),
            })
    if not rows:
        raise ValueError("No dated rows found. Export with breakdown 'By day'.")
    return rows


# ---------------------------------------------------------------------------
# 2. Aggregation and metrics
# ---------------------------------------------------------------------------
def aggregate(rows, start, end):
    """Sum additive metrics per campaign for start <= day <= end."""
    totals = {}
    for row in rows:
        if not (start <= row["day"] <= end):
            continue
        t = totals.setdefault(row["campaign"], {
            "spend": 0.0, "impressions": 0.0, "clicks": 0.0, "results": 0.0})
        for key in t:
            t[key] += row[key]
    return totals


def safe_div(a, b):
    """Division that returns None instead of crashing on zero."""
    return a / b if b else None


def derive(t):
    """Add ratio metrics. Ratios are computed from sums, never averaged."""
    return {
        **t,
        "ctr": safe_div(t["clicks"], t["impressions"]),
        "cpc": safe_div(t["spend"], t["clicks"]),
        "cpm": safe_div(t["spend"] * 1000, t["impressions"]),
        "cpr": safe_div(t["spend"], t["results"]),
    }


def pct_change(new, old):
    """Relative change, or None when it is undefined."""
    if new is None or old in (None, 0):
        return None
    return (new - old) / old


# ---------------------------------------------------------------------------
# 3. Flags: the 'insight' layer. Plain rules, each explained in the message.
# ---------------------------------------------------------------------------
def flags_for(this_week, last_week):
    msgs = []
    if this_week["spend"] < MIN_SPEND_TO_JUDGE:
        return msgs
    if this_week["results"] == 0:
        msgs.append("Spent money but produced zero results this week.")
    change = pct_change(this_week["cpr"], last_week["cpr"] if last_week else None)
    if change is not None and change > CPR_INCREASE_LIMIT:
        msgs.append(f"Cost per result rose {change:.0%} versus last week.")
    ctr_change = pct_change(this_week["ctr"], last_week["ctr"] if last_week else None)
    if ctr_change is not None and ctr_change < -CTR_DROP_LIMIT:
        msgs.append(f"CTR fell {abs(ctr_change):.0%}: creative may be fatiguing.")
    if last_week is None:
        msgs.append("New this week: no previous week to compare against.")
    return msgs


def build_report(rows, end=None):
    """Return the data structure the renderer needs."""
    end = end or max(r["day"] for r in rows)
    this_start, last_end = end - timedelta(days=6), end - timedelta(days=7)
    last_start = end - timedelta(days=13)
    this_raw = aggregate(rows, this_start, end)
    last_raw = aggregate(rows, last_start, last_end)

    campaigns = []
    for name in sorted(this_raw, key=lambda n: -this_raw[n]["spend"]):
        now = derive(this_raw[name])
        before = derive(last_raw[name]) if name in last_raw else None
        campaigns.append({"name": name, "now": now, "before": before,
                          "flags": flags_for(now, before)})

    def total(raw):
        keys = ("spend", "impressions", "clicks", "results")
        return derive({k: sum(c[k] for c in raw.values()) for k in keys})

    return {
        "window": (this_start, end), "previous_window": (last_start, last_end),
        "total_now": total(this_raw),
        "total_before": total(last_raw) if last_raw else None,
        "campaigns": campaigns,
    }


# ---------------------------------------------------------------------------
# 4. Rendering (HTML). Every value from the CSV goes through html.escape,
# because campaign names are user-controlled text.
# ---------------------------------------------------------------------------
def fmt(value, kind):
    if value is None:
        return "–"
    if kind == "money":
        return f"{value:,.2f}"
    if kind == "pct":
        return f"{value:.2%}"
    return f"{value:,.0f}"


def delta_cell(new, old, lower_is_better=False):
    change = pct_change(new, old)
    if change is None:
        return "<td>–</td>"
    good = (change < 0) if lower_is_better else (change > 0)
    css = "good" if good else "bad"
    if abs(change) < 0.005:
        css = "flat"
    return f'<td class="{css}">{change:+.0%}</td>'


def render_html(report, client):
    start, end = report["window"]
    now, before = report["total_now"], report["total_before"]
    metrics = [("Spend", "spend", "money", False), ("Impressions", "impressions", "num", False),
               ("Clicks", "clicks", "num", False), ("CTR", "ctr", "pct", False),
               ("CPC", "cpc", "money", True), ("Results", "results", "num", False),
               ("Cost / result", "cpr", "money", True)]

    cards = ""
    for label, key, kind, lower_better in metrics:
        change = pct_change(now[key], before[key] if before else None)
        arrow = "" if change is None else f"<small>{change:+.0%} vs last week</small>"
        cards += f'<div class="card"><span>{label}</span><b>{fmt(now[key], kind)}</b>{arrow}</div>'

    rows_html = ""
    for c in report["campaigns"]:
        n, b = c["now"], c["before"]
        flags = "".join(f"<li>{html.escape(f)}</li>" for f in c["flags"]) or "<li class='ok'>No issues</li>"
        rows_html += (
            f"<tr><td>{html.escape(c['name'])}</td><td>{fmt(n['spend'], 'money')}</td>"
            f"<td>{fmt(n['results'], 'num')}</td><td>{fmt(n['cpr'], 'money')}</td>"
            f"{delta_cell(n['cpr'], b['cpr'] if b else None, True)}"
            f"<td>{fmt(n['ctr'], 'pct')}</td>"
            f"{delta_cell(n['ctr'], b['ctr'] if b else None)}"
            f"<td><ul>{flags}</ul></td></tr>")

    attention = [c for c in report["campaigns"] if c["flags"]]
    summary = (f"{len(attention)} of {len(report['campaigns'])} campaigns need attention."
               if attention else "All campaigns are within normal ranges.")

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weekly Meta Ads report - {html.escape(client)}</title>
<style>
body{{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#f6f7f9;color:#1a1d21}}
main{{max-width:1000px;margin:auto}} h1{{margin:0 0 4px}} .sub{{color:#5b6470;margin-bottom:20px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px}}
.card{{background:#fff;border-radius:10px;padding:12px;box-shadow:0 1px 2px #0001}}
.card span{{display:block;color:#5b6470;font-size:12px}} .card b{{font-size:20px}} .card small{{display:block;color:#5b6470}}
table{{width:100%;min-width:760px;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px #0001}}
th,td{{padding:8px 10px;text-align:left;border-bottom:1px solid #eceef1;vertical-align:top}} th{{background:#eef0f3;font-size:12px}}
.good{{color:#0a7a3d}} .bad{{color:#b3261e}} .flat{{color:#5b6470}} ul{{margin:0;padding-left:16px}} li.ok{{color:#0a7a3d;list-style:none;margin-left:-16px}}
.table-wrap{{overflow-x:auto}}
</style></head><body><main>
<h1>Weekly Meta Ads report</h1>
<div class="sub">{html.escape(client)} · {start:%d %b %Y} to {end:%d %b %Y} (compared with the 7 days before)</div>
<p><b>{summary}</b></p>
<div class="cards">{cards}</div>
<div class="table-wrap"><table><thead><tr><th>Campaign</th><th>Spend</th><th>Results</th><th>Cost/result</th><th>Δ</th><th>CTR</th><th>Δ</th><th>Flags</th></tr></thead>
<tbody>{rows_html}</tbody></table></div>
<p class="sub">Green means better, red means worse. Cost metrics are better when lower.</p>
</main></body></html>"""


def main(argv=None):
    parser = argparse.ArgumentParser(description="Generate a weekly Meta Ads report from a CSV export.")
    parser.add_argument("csv_path", help="Daily campaign export from Ads Manager (CSV)")
    parser.add_argument("--out", default="output/report.html", help="Where to write the HTML report")
    parser.add_argument("--client", default="Client", help="Client name shown in the report")
    parser.add_argument("--end", help="Last day of the report week, YYYY-MM-DD (default: last day in the data)")
    args = parser.parse_args(argv)

    try:
        rows = load_rows(args.csv_path)
        end = date.fromisoformat(args.end) if args.end else None
        report = build_report(rows, end)
    except (ValueError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_html(report, args.client), encoding="utf-8")
    print(f"Report written to {out}")
    for c in report["campaigns"]:
        for message in c["flags"]:
            print(f"  [{c['name']}] {message}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
