/* Sales Insights: parsing, aggregation and plain-language insights.
 * Pure functions, no DOM, no network. Runs in the browser and in Node (tests).
 */
(function (root) {
  'use strict';

  // ---------- column detection ----------
  const ALIASES = {
    amount: ['amount', 'revenue', 'deal value', 'deal amount', 'deal size', 'value', 'arr', 'acv', 'price'],
    status: ['status', 'stage', 'outcome', 'deal status', 'result'],
    date: ['close date', 'closed date', 'date', 'deal date', 'closed', 'created date', 'created', 'month'],
    region: ['region', 'territory', 'area', 'market'],
    rep: ['sales rep', 'rep', 'salesrep', 'owner', 'account owner', 'salesperson', 'sales person', 'seller', 'agent'],
    product: ['product', 'product name', 'plan', 'sku', 'offering']
  };
  const REQUIRED = ['amount', 'region', 'rep', 'product'];
  const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();

  function mapColumns(headers) {
    const h = headers.map(norm);
    const used = new Set();
    const map = {};
    for (const key of Object.keys(ALIASES)) {
      let idx = -1;
      for (const a of ALIASES[key]) {
        idx = h.findIndex((x, i) => x === a && !used.has(i));
        if (idx >= 0) break;
      }
      if (idx < 0) {
        const single = ALIASES[key].filter((a) => !a.includes(' '));
        idx = h.findIndex((x, i) => !used.has(i) && x.split(' ').some((w) => single.includes(w)));
      }
      if (idx >= 0) { map[key] = idx; used.add(idx); }
    }
    return map;
  }

  // ---------- CSV ----------
  function detectDelimiter(text) {
    const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
    let best = ',';
    let bestN = -1;
    for (const d of [',', ';', '\t']) {
      let n = 0;
      let q = false;
      for (const ch of first) {
        if (ch === '"') q = !q;
        else if (!q && ch === d) n++;
      }
      if (n > bestN) { bestN = n; best = d; }
    }
    return best;
  }

  function parseCSV(text) {
    text = String(text).replace(/^﻿/, '');
    const d = detectDelimiter(text);
    const rows = [];
    let row = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = ''; rows.push(row); row = [];
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  // ---------- value parsing ----------
  function parseAmount(v) {
    let s = String(v == null ? '' : v).trim();
    if (!s) return NaN;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return NaN;
    const lc = s.lastIndexOf(',');
    const ld = s.lastIndexOf('.');
    if (lc >= 0 && ld >= 0) {
      const dec = lc > ld ? ',' : '.';
      const thou = dec === ',' ? '.' : ',';
      s = s.split(thou).join('').replace(dec, '.');
    } else if (lc >= 0) {
      s = /^\d+,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
    } else if (ld >= 0 && s.split('.').length > 2) {
      s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isNaN(n) ? NaN : (neg ? -n : n);
  }

  function ymd(y, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // Accepts 2026-03-15, 2026-03, 15.03.2026, 15/03/2026, 03/15/2026 (ambiguous d/m vs m/d defaults to m/d).
  function parseDate(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return ymd(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{4})-(\d{1,2})$/);
    if (m) return ymd(+m[1], +m[2], 1);
    m = s.match(/^(\d{1,2})([.\/-])(\d{1,2})\2(\d{2,4})/);
    if (m) {
      const a = +m[1];
      const b = +m[3];
      let y = +m[4];
      if (y < 100) y += 2000;
      let day;
      let mon;
      if (m[2] === '.') { day = a; mon = b; }
      else if (a > 12) { day = a; mon = b; }
      else { mon = a; day = b; }
      return ymd(y, mon, day);
    }
    const t = Date.parse(s);
    if (!isNaN(t)) {
      const d = new Date(t);
      return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    return null;
  }

  function statusOf(v) {
    const s = norm(v);
    if (/lost|declin|reject|cancel|churn/.test(s)) return 'lost';
    if (/won|closed|signed|paid|complete|success/.test(s)) return 'won';
    return 'open';
  }

  const clean = (v) => {
    const s = String(v == null ? '' : v).trim();
    return s || 'Unassigned';
  };

  function parseDeals(text) {
    const table = parseCSV(text);
    if (table.length < 2) return { error: 'The file has no data rows.' };
    const headers = table[0].map((h) => String(h).trim());
    const map = mapColumns(headers);
    const missing = REQUIRED.filter((k) => map[k] == null);
    if (missing.length) {
      return {
        error: 'Missing column(s): ' + missing.join(', ') + '. Found: ' + headers.join(', ') +
          '. Needed: region, sales rep, product, amount (plus status and a date, ideally).'
      };
    }
    const deals = [];
    let badAmount = 0;
    let badDate = 0;
    for (let i = 1; i < table.length; i++) {
      const r = table[i];
      const amount = parseAmount(r[map.amount]);
      if (isNaN(amount)) { badAmount++; continue; }
      const date = map.date != null ? parseDate(r[map.date]) : null;
      if (map.date != null && !date) badDate++;
      deals.push({
        date,
        month: date ? date.slice(0, 7) : null,
        region: clean(r[map.region]),
        rep: clean(r[map.rep]),
        product: clean(r[map.product]),
        amount,
        status: map.status != null ? statusOf(r[map.status]) : 'won'
      });
    }
    if (!deals.length) return { error: 'No rows with a valid amount were found.' };
    const warnings = [];
    if (badAmount) warnings.push(badAmount + ' row(s) skipped: amount was not a number.');
    if (badDate) warnings.push(badDate + ' row(s) have an unreadable date and are left out of the monthly trend.');
    if (map.status == null) warnings.push('No status column found, so every row is counted as a won deal.');
    if (map.date == null) warnings.push('No date column found, so monthly trends are unavailable.');
    return { deals, warnings, mapping: map, headers };
  }

  // ---------- metrics ----------
  const METRICS = {
    revenue: { label: 'Revenue', short: 'revenue' },
    deals: { label: 'Deals closed', short: 'deals closed' },
    avg: { label: 'Avg deal size', short: 'average deal size' },
    winRate: { label: 'Win rate', short: 'win rate' }
  };

  function measure(rows) {
    let revenue = 0;
    let won = 0;
    let lost = 0;
    for (const d of rows) {
      if (d.status === 'won') { revenue += d.amount; won++; }
      else if (d.status === 'lost') lost++;
    }
    const closed = won + lost;
    return { revenue, deals: won, lost, closed, avg: won ? revenue / won : 0, winRate: closed ? won / closed : 0 };
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthShort = (k) => MONTHS[+k.slice(5, 7) - 1];
  const monthLabel = (k) => monthShort(k) + ' ' + k.slice(0, 4);

  function mode(arr) {
    const c = new Map();
    for (const x of arr) c.set(x, (c.get(x) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  // Compares the latest month with the average of up to 3 months before it.
  // A single prior month is too noisy (one big deal swings revenue), so it is not used alone.
  function trendChange(rows, metric, last, win) {
    if (!last || !win.length) return null;
    const cur = measure(rows.filter((r) => r.month === last));
    const base = measure(rows.filter((r) => win.includes(r.month)));
    if (base.closed < 6) return null;
    let a = cur[metric];
    let b = base[metric];
    if (metric === 'revenue' || metric === 'deals') b = b / win.length;
    else if (cur.closed < 3) return null;
    return b > 0 ? (a - b) / b : null;
  }

  // Share of the average that counts as "far behind". Win rate is bounded, so its bar is lower.
  const BEHIND = { revenue: 0.35, deals: 0.35, avg: 0.35, winRate: 0.2 };

  function rankGroups(closed, dim, metric, last, win, total, teamChange) {
    const by = new Map();
    for (const d of closed) {
      if (!by.has(d[dim])) by.set(d[dim], []);
      by.get(d[dim]).push(d);
    }
    const groups = [...by].map(([name, rows]) => {
      const m = measure(rows);
      return {
        name,
        sub: dim === 'rep' ? mode(rows.map((r) => r.region)) : '',
        m,
        value: m[metric],
        share: total.revenue ? m.revenue / total.revenue : 0,
        change: trendChange(rows, metric, last, win),
        base: win.length ? measure(rows.filter((r) => win.includes(r.month))).revenue / win.length : 0
      };
    });
    groups.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const mean = groups.reduce((s, g) => s + g.value, 0) / groups.length;
    groups.forEach((g, i) => {
      g.rank = i + 1;
      g.vsMean = mean ? g.value / mean - 1 : 0;
      g.top = groups.length > 1 && i === 0;
      // A cheaper product line is not a problem by itself, so products are only flagged when declining.
      g.attention = dim !== 'product' && groups.length > 1 && g.vsMean <= -BEHIND[metric];
      // Declining = well below its own baseline AND falling clearly faster than the whole team.
      g.declining = g.change != null && g.change <= -0.3 && g.change <= (teamChange == null ? 0 : teamChange) - 0.15;
    });
    return { groups, mean };
  }

  function analyze(deals, metric) {
    metric = METRICS[metric] ? metric : 'revenue';
    const closed = deals.filter((d) => d.status !== 'open');
    const months = [...new Set(closed.filter((d) => d.month).map((d) => d.month))].sort();
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    const win = months.slice(Math.max(0, months.length - 4), months.length - 1);
    const winLabel = win.length === 1 ? 'vs ' + monthShort(win[0]) : 'vs prior ' + win.length + '-mo avg';
    const openLast = last ? deals.filter((d) => d.status === 'open' && d.month === last).length : 0;
    const total = measure(closed);
    const teamChange = trendChange(closed, metric, last, win);
    const series = months.map((m) => Object.assign({ month: m }, measure(closed.filter((d) => d.month === m))));
    const dims = {};
    for (const dim of ['region', 'rep', 'product']) dims[dim] = rankGroups(closed, dim, metric, last, win, total, teamChange);
    return { metric, months, last, prev, win, winLabel, openLast, teamChange, total, series, dims };
  }

  // ---------- formatting ----------
  function makeFmt(cur) {
    cur = cur || '$';
    const trim = (x) => x.replace(/\.0$/, '');
    const money = (n) => {
      const a = Math.abs(n);
      const s = n < 0 ? '-' : '';
      if (a >= 1e6) return s + cur + (a / 1e6).toFixed(2) + 'M';
      if (a >= 1e5) return s + cur + Math.round(a / 1e3) + 'K';
      if (a >= 1e3) return s + cur + trim((a / 1e3).toFixed(1)) + 'K';
      return s + cur + Math.round(a);
    };
    const int = (n) => Math.round(n).toLocaleString('en-US');
    const pct = (n) => Math.round(n * 100) + '%';
    const metric = (k, v) => (k === 'deals' ? int(v) : k === 'winRate' ? pct(v) : money(v));
    return { cur, money, int, pct, metric };
  }

  // ---------- plain-language summary (rule based, runs locally) ----------
  function summarize(deals, fmt) {
    const a = analyze(deals, 'revenue');
    const t = a.total;
    if (!(t.deals + t.lost)) return { headline: 'No closed deals were found in this file.', paragraphs: [], watch: [] };

    const ms = a.months;
    const span = ms.length > 1 ? monthLabel(ms[0]) + ' to ' + monthLabel(ms[ms.length - 1]) : ms.length === 1 ? monthLabel(ms[0]) : 'this file';
    const headline = (ms.length > 1 ? 'From ' : 'In ') + span + ', the team closed ' + fmt.int(t.deals) + ' deals worth ' +
      fmt.money(t.revenue) + ', averaging ' + fmt.money(t.avg) + ' per deal with a ' + fmt.pct(t.winRate) + ' win rate.';

    const paras = [];
    const s = a.series;
    if (s.length >= 2) {
      const L = s[s.length - 1];
      const P = s[s.length - 2];
      if (P.revenue > 0) {
        const ch = (L.revenue - P.revenue) / P.revenue;
        paras.push(monthLabel(L.month) + ' revenue was ' + fmt.money(L.revenue) + ', ' + (ch >= 0 ? 'up ' : 'down ') +
          Math.round(Math.abs(ch) * 100) + '% from ' + monthLabel(P.month) + '.');
      }
    }
    const R = a.dims.region.groups;
    if (R.length > 1) {
      const top = R[0];
      const low = R[R.length - 1];
      paras.push(top.name + ' is the strongest region with ' + fmt.money(top.value) + ' (' + fmt.pct(top.share) +
        ' of revenue). ' + low.name + ' is the weakest at ' + fmt.money(low.value) + ' (' + fmt.pct(low.share) + ').');
    }
    const REP = a.dims.rep.groups;
    if (REP.length > 1) {
      const top = REP[0];
      const low = REP[REP.length - 1];
      let p = top.name + ' leads the sales reps with ' + fmt.money(top.value) + '.';
      if (low.vsMean < 0) p += ' ' + low.name + ' is furthest behind at ' + fmt.money(low.value) + ', ' + fmt.pct(Math.abs(low.vsMean)) + ' below the rep average.';
      paras.push(p);
    }
    const PR = a.dims.product.groups;
    if (PR.length > 0) {
      let p = PR[0].name + ' drives ' + fmt.pct(PR[0].share) + ' of revenue';
      if (PR.length > 1) p += ', followed by ' + PR[1].name + ' (' + fmt.pct(PR[1].share) + ')';
      paras.push(p + '.');
    }

    const labels = { region: 'Region', rep: 'Rep', product: 'Product' };
    const all = (an, test) => {
      const out = [];
      for (const dim of ['region', 'rep', 'product']) for (const g of an.dims[dim].groups) if (test(g, dim)) out.push({ g, dim });
      return out;
    };
    const baseline = a.win.length === 1 ? monthLabel(a.win[0]) + ' level' : 'average of the previous ' + a.win.length + ' months';
    const declining = all(a, (g) => g.declining).sort((x, y) => x.g.change - y.g.change).map(({ g, dim }) =>
      g.change <= -0.99
        ? labels[dim] + ' ' + g.name + ': no revenue closed in ' + monthLabel(a.last) + ', against a normal ' + fmt.money(g.base) + ' a month.'
        : labels[dim] + ' ' + g.name + ': ' + monthLabel(a.last) + ' revenue is ' + fmt.pct(Math.abs(g.change)) + ' below its ' + baseline + '.');
    const behind = all(a, (g) => g.attention).sort((x, y) => x.g.vsMean - y.g.vsMean).map(({ g, dim }) =>
      labels[dim] + ' ' + g.name + ': revenue of ' + fmt.money(g.value) + ' is ' + fmt.pct(Math.abs(g.vsMean)) + ' below the ' + dim + ' average.');
    const w = analyze(deals, 'winRate');
    const lowWin = all(w, (g, dim) => g.attention && dim !== 'product').sort((x, y) => x.g.vsMean - y.g.vsMean).map(({ g, dim }) =>
      labels[dim] + ' ' + g.name + ': win rate is ' + fmt.pct(g.value) + ', ' + fmt.pct(Math.abs(g.vsMean)) + ' below the ' + dim + ' average.');
    const watch = declining.concat(behind, lowWin);
    return { headline, paragraphs: paras, watch: watch.slice(0, 9) };
  }

  function summaryText(sum) {
    const out = [sum.headline].concat(sum.paragraphs);
    if (sum.watch.length) out.push('Needs attention:\n' + sum.watch.map((x) => '- ' + x).join('\n'));
    else out.push('Nothing is flagged: no region, rep or product is far behind or sharply declining.');
    return out.join('\n\n');
  }

  // Aggregated figures only (no deal rows), for pasting into any AI chat for a richer write-up.
  function buildPrompt(deals, fmt) {
    const a = analyze(deals, 'revenue');
    const t = a.total;
    const line = (g) => g.name + ': ' + fmt.money(g.m.revenue) + ' revenue, ' + g.m.deals + ' deals, ' + fmt.money(g.m.avg) + ' avg deal, ' + fmt.pct(g.m.winRate) + ' win rate';
    const out = [
      'You are a sales analyst. Using ONLY the aggregated figures below (no customer data), write a plain-language executive summary of about 150 words for a monthly sales review. Cover what changed, who is performing best, what needs attention, and suggest two concrete actions.',
      '',
      'OVERALL: ' + fmt.money(t.revenue) + ' revenue, ' + t.deals + ' deals won, ' + t.lost + ' lost, ' + fmt.money(t.avg) + ' average deal, ' + fmt.pct(t.winRate) + ' win rate.'
    ];
    if (a.series.length) out.push('MONTHLY REVENUE: ' + a.series.map((s) => monthLabel(s.month) + ' ' + fmt.money(s.revenue)).join(', '));
    out.push('', 'BY REGION', ...a.dims.region.groups.map(line));
    out.push('', 'BY SALES REP', ...a.dims.rep.groups.map((g) => line(g) + ' (' + g.sub + ')'));
    out.push('', 'BY PRODUCT', ...a.dims.product.groups.map(line));
    return out.join('\n');
  }

  const api = {
    parseCSV, parseAmount, parseDate, parseDeals, mapColumns, statusOf,
    METRICS, measure, analyze, makeFmt, summarize, summaryText, buildPrompt, monthLabel, monthShort
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SalesAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
