# PRD: Meta Ads Weekly Report Automation

**Author:** Rodrigo (Monocore) · **Status:** v1 built · **Type:** Business / productivity automation

## 1. Problem
Every week, each Meta ads client needs a report. Today it is built by hand: export from Ads Manager, paste into a sheet, calculate week-over-week changes, write comments, format for the client. It takes 30 to 45 minutes per client, is easy to get wrong (averaging ratios instead of summing, missing a campaign that stopped converting), and does not scale with more clients.

## 2. User
Freelance media buyer managing several client accounts who needs a clear, trustworthy weekly update without manual spreadsheet work. Secondary reader: the client, who opens the report and wants to know "is it working, and what needs attention?".

## 3. Goals
1. Turn one Ads Manager CSV export into a client-ready report in under 10 seconds.
2. Compare the latest 7 days against the previous 7 days, per campaign and in total.
3. Automatically flag campaigns that need attention, with a plain-language reason.
4. Produce one self-contained file (HTML) that can be emailed or opened anywhere.

## 4. Non-goals (v1)
- No live connection to the Meta API or login handling.
- No cross-client dashboards, no scheduling, no email sending.
- No ad-set or ad-level breakdown (campaign level only).
- No recommendations that change budgets automatically. The tool flags, the human decides.

## 5. Input
CSV exported from Ads Manager with breakdown **By day** and these columns: Campaign name, Day, Amount spent, Impressions, Link clicks, Results. Header spelling varies by currency and preset, so common aliases are accepted.

## 6. Functional requirements
| ID | Requirement |
|----|-------------|
| F1 | Read the CSV and map columns by flexible header names; list **all** missing columns in one error message. |
| F2 | Ignore rows without a valid date (Ads Manager's "Total" row, blanks). |
| F3 | Define the report week as the last 7 days in the data (or a user-given end date) and compare with the 7 days before. |
| F4 | Compute per campaign and in total: spend, impressions, clicks, results, CTR, CPC, CPM, cost per result. Ratios are calculated from summed values, never averaged. |
| F5 | Never crash on division by zero; show "–" instead. |
| F6 | Flag a campaign when: cost per result rises more than 20%; CTR falls more than 15%; it spent money with zero results; it is new this week. Ignore campaigns under 20 spend (too noisy). |
| F7 | Output a single HTML file with summary line, KPI cards, campaign table, colored deltas (green = better, red = worse; for cost metrics lower is better). |
| F8 | Escape all CSV text in the HTML (campaign names are untrusted input). |
| F9 | Print the flags in the terminal as well. |

## 7. Metric definitions
- CTR = link clicks / impressions
- CPC = spend / link clicks
- CPM = spend / impressions × 1000
- Cost per result = spend / results
- Week-over-week change = (this week − last week) / last week

## 8. Acceptance criteria
- Given the sample file, the report shows 4 campaigns and flags exactly the ones engineered to be problems (cost per result spike, CTR drop, zero results).
- A file with missing columns fails with a message naming every missing column.
- A campaign named `<script>alert(1)</script>` never appears unescaped in the output.
- 12 automated tests pass with `python -m unittest discover tests`.

## 9. Known limitations and risks
- **Reach and frequency are excluded.** Reach is not additive across days (the same person is counted once per day), so summing it gives wrong numbers.
- Assumes dot decimals (`12.50`). European-format exports (`12,50`) need conversion first.
- "Results" means whatever the campaign objective counts. Mixing objectives in one export makes the totals row less meaningful.
- Thresholds (20%, 15%, 20 spend) are starting points, not universal truths. They are constants at the top of `src/report.py`.
- Week-over-week on small spend can be noise; the minimum-spend rule reduces but does not remove this.

## 10. Success measure
Report time per client drops from ~40 minutes to ~5 minutes (export + run + a human read of the flags).
