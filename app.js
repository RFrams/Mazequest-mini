/* Sales Insights UI. All analysis lives in analysis.js; this file only renders and wires events. */
(function () {
  'use strict';

  const A = window.SalesAnalysis;
  const $ = (id) => document.getElementById(id);
  // Every value that comes from the uploaded file goes through esc() before touching innerHTML.
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const state = { deals: null, metric: 'revenue', cur: '$', file: '', warnings: [] };
  let toastTimer;

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function showError(msg) {
    const e = $('error');
    e.textContent = msg;
    e.hidden = false;
  }

  function load(text, name) {
    const res = A.parseDeals(text);
    if (res.error) { showError(res.error); return; }
    state.deals = res.deals;
    state.warnings = res.warnings;
    state.file = name;
    $('error').hidden = true;
    $('empty').hidden = true;
    $('app').hidden = false;
    render();
  }

  async function readFile(file) {
    const buf = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { text = new TextDecoder('windows-1252').decode(buf); } // older Excel CSV exports
    load(text, file.name);
  }

  // ---------- rendering ----------
  function change(cur, prev, metric, fmt, label) {
    if (prev == null || cur == null) return '';
    if (metric === 'winRate') {
      const pts = Math.round((cur - prev) * 100);
      if (!pts) return '<span class="muted">no change ' + esc(label) + '</span>';
      return '<span class="' + (pts > 0 ? 'up' : 'down') + '">' + (pts > 0 ? '▲ ' : '▼ ') + Math.abs(pts) + (Math.abs(pts) === 1 ? ' pt ' : ' pts ') + esc(label) + '</span>';
    }
    if (!prev) return '';
    const p = Math.round(((cur - prev) / prev) * 100);
    if (!p) return '<span class="muted">no change ' + esc(label) + '</span>';
    return '<span class="' + (p > 0 ? 'up' : 'down') + '">' + (p > 0 ? '▲ ' : '▼ ') + Math.abs(p) + '% ' + esc(label) + '</span>';
  }

  function kpis(an, fmt) {
    const s = an.series;
    const L = s[s.length - 1];
    const P = s[s.length - 2];
    const label = P ? 'vs ' + A.monthShort(P.month) : '';
    return Object.keys(A.METRICS).map((k) => {
      const d = L && P ? change(L[k], P[k], k, fmt, label) : '';
      return '<div class="kpi' + (k === state.metric ? ' sel' : '') + '" data-metric="' + k + '">' +
        '<div class="k">' + A.METRICS[k].label + '</div>' +
        '<div class="v">' + esc(fmt.metric(k, an.total[k])) + '</div>' +
        '<div class="d">' + d + '</div></div>';
    }).join('');
  }

  function summaryHtml(sum) {
    let h = '<p class="lead">' + esc(sum.headline) + '</p>';
    h += sum.paragraphs.map((p) => '<p>' + esc(p) + '</p>').join('');
    if (sum.watch.length) {
      h += '<h3>Needs attention</h3><ul>' + sum.watch.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>';
    } else {
      h += '<p class="none">Nothing is flagged: no region, rep or product is far behind or sharply declining.</p>';
    }
    return h;
  }

  function trend(an, fmt) {
    if (!an.series.length) return '<p class="muted">No dated deals to chart. Add a close date column.</p>';
    const vals = an.series.map((s) => s[state.metric]);
    const max = Math.max.apply(null, vals.concat([0.0001]));
    return an.series.map((s, i) => {
      const v = s[state.metric];
      const h = Math.max(2, Math.round((v / max) * 112));
      return '<div class="col' + (i === an.series.length - 1 ? ' last' : '') + '"><div class="barwrap"><div class="v">' +
        esc(fmt.metric(state.metric, v)) + '</div><i style="height:' + h + 'px"></i></div><div class="l">' +
        esc(A.monthShort(s.month)) + '</div></div>';
    }).join('');
  }

  function panel(dim, title, an, fmt) {
    const g = an.dims[dim].groups;
    const max = Math.max.apply(null, g.map((x) => x.value).concat([0.0001]));
    const others = ['revenue', 'deals', 'avg', 'winRate'].filter((k) => k !== state.metric);
    const unit = { revenue: ' revenue', deals: ' deals', avg: ' avg', winRate: ' win rate' };
    const rows = g.map((x) => {
      const badges = (x.top ? '<span class="badge good">Top performer</span>' : '') +
        (x.attention ? '<span class="badge bad">Needs attention</span>' : '') +
        (x.declining ? '<span class="badge warn">Declining</span>' : '');
      const vs = g.length > 1 ? Math.round(Math.abs(x.vsMean) * 100) + '% ' + (x.vsMean < 0 ? 'below' : 'above') + ' avg' : '';
      const chg = x.change == null || Math.round(Math.abs(x.change) * 100) === 0 ? '' : '<span class="' + (x.change >= 0 ? 'up' : 'down') + '">' +
        (x.change >= 0 ? '▲ ' : '▼ ') + Math.round(Math.abs(x.change) * 100) + '% ' + esc(an.winLabel) + '</span>';
      const meta = [vs].concat(others.map((k) => fmt.metric(k, x.m[k]) + unit[k])).filter(Boolean).map(esc).join(' · ');
      return '<li class="row' + (x.attention ? ' warn' : x.top ? ' top' : '') + '">' +
        '<div class="rowtop"><span class="name">' + esc(x.name) + (x.sub ? ' <small>' + esc(x.sub) + '</small>' : '') +
        '</span><span class="val">' + esc(fmt.metric(state.metric, x.value)) + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.max(2, Math.round((x.value / max) * 100)) + '%"></i></div>' +
        (badges ? '<div class="badges">' + badges + '</div>' : '') +
        '<div class="meta">' + meta + (chg ? ' · ' + chg : '') + '</div></li>';
    }).join('');
    return '<section class="card"><h2>' + title + '</h2><p class="panel-sub">Ranked by ' +
      esc(A.METRICS[state.metric].short) + '</p><ol class="rank">' + rows + '</ol></section>';
  }

  function render() {
    const fmt = A.makeFmt(state.cur);
    const an = A.analyze(state.deals, state.metric);
    const sum = A.summarize(state.deals, fmt);
    const t = an.total;
    const open = state.deals.filter((d) => d.status === 'open').length;
    const notes = ['Showing ' + state.file + ': ' + state.deals.length.toLocaleString('en-US') + ' deals (' + t.deals + ' won, ' + t.lost + ' lost' + (open ? ', ' + open + ' open and not counted' : '') + ').']
      .concat(state.warnings);
    if (an.openLast) notes.push(an.openLast + ' deal(s) from ' + A.monthLabel(an.last) + ' are still open, so that month may look low.');
    $('notice').innerHTML = notes.map((n) => '<div>' + esc(n) + '</div>').join('');

    $('metricTabs').innerHTML = Object.keys(A.METRICS).map((k) =>
      '<button type="button" role="tab" data-metric="' + k + '" aria-selected="' + (k === state.metric) + '" class="' + (k === state.metric ? 'on' : '') + '">' + A.METRICS[k].label + '</button>').join('');
    $('kpis').innerHTML = kpis(an, fmt);
    $('summary').innerHTML = summaryHtml(sum);
    $('trendTitle').textContent = A.METRICS[state.metric].label + ' by month';
    $('trendNote').textContent = '';
    $('trend').innerHTML = trend(an, fmt);
    $('panels').innerHTML = [['region', 'By region'], ['rep', 'By sales rep'], ['product', 'By product']]
      .map((p) => panel(p[0], p[1], an, fmt)).join('');
  }

  // ---------- sharing ----------
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Copied'); } catch (_) { toast('Copy failed'); }
      ta.remove();
    }
  }

  // A standalone snapshot: aggregated numbers only, no scripts, no deal-level rows.
  function reportHtml() {
    const clone = $('report').cloneNode(true);
    clone.querySelectorAll('.no-export').forEach((n) => n.remove());
    const stamp = new Date().toISOString().slice(0, 10);
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>Sales Insights report ' + stamp + '</title><style>' + $('css').textContent + '</style></head><body><main class="wrap">' +
      '<header class="top"><div><h1>Sales Insights</h1><p class="sub">Report generated ' + stamp +
      '. Aggregated figures only; no deal-level data is included.</p></div></header>' + clone.outerHTML + '</main></body></html>';
  }

  function download() {
    const blob = new Blob([reportHtml()], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sales-insights-report-' + new Date().toISOString().slice(0, 10) + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Report downloaded');
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-metric]');
    if (m && state.deals) { state.metric = m.dataset.metric; render(); }
  });
  $('file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) readFile(f);
    e.target.value = '';
  });
  $('sampleBtn').addEventListener('click', () => load(window.SAMPLE_CSV, 'sample data (synthetic)'));
  $('currency').addEventListener('change', (e) => { state.cur = e.target.value; if (state.deals) render(); });
  $('copySummary').addEventListener('click', () => copy(A.summaryText(A.summarize(state.deals, A.makeFmt(state.cur)))));
  $('copyPrompt').addEventListener('click', () => copy(A.buildPrompt(state.deals, A.makeFmt(state.cur))));
  $('download').addEventListener('click', download);
  $('print').addEventListener('click', () => window.print());

  ['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); $('empty').classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); $('empty').classList.remove('over'); }));
  window.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) readFile(f);
  });
})();
