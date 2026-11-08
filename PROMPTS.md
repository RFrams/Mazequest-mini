# AI-Assisted Build Log

This file documents how the PRD was translated into prompts and how the result was tested and refined.

> **Rodrigo: edit this before submitting.** The prompts below are the structured sequence this build follows. Replace the "Your notes" lines with what you actually saw, changed or fixed when you ran it. A reviewer will value your real iterations more than a clean script.

## Stage 1: PRD to scope
**Prompt:** "I manage Meta ads for several clients. Write a PRD for a tool that turns a daily Ads Manager CSV export into a weekly client report with week-over-week comparison and flags for problem campaigns. Include non-goals, metric definitions, acceptance criteria and risks."
**Result:** `PRD.md`.
**Your notes:** (what did you cut or change in scope?)

## Stage 2: Core logic
**Prompt:** "Using PRD.md, write a standard-library Python script `src/report.py` that loads the CSV with flexible header names, aggregates the last 7 days vs the 7 days before per campaign, computes CTR, CPC, CPM and cost per result from summed values, and applies the flag rules in section F6. Comment every function."
**Result:** `src/report.py`.
**Your notes:**

## Stage 3: Output
**Prompt:** "Add `render_html` producing one self-contained HTML file: summary sentence, KPI cards, campaign table, green/red deltas where lower is better for cost metrics, readable on a phone."
**Your notes:** (open `output/sample_report.html` on your phone and write what you would change)

## Stage 4: Test and debug
**Prompt:** "Write unit tests for parsing, zero-division, window splitting, each flag rule, and HTML escaping of campaign names."
**Result:** 12 passing tests in `tests/test_report.py`.
**Design decisions made while testing:**
- Reach and frequency removed: summing daily reach double counts people.
- A minimum-spend rule was added so tiny campaigns do not trigger false flags.
- Campaign names are HTML-escaped because they come from untrusted CSV data.
**Your notes:** (run it on a real client export, anonymize it, and record what broke)

## Stage 5: Documentation
**Prompt:** "Write a README with quick start, how to export from Ads Manager, flag rules, how the code works, and limitations."
**Result:** `README.md`.
