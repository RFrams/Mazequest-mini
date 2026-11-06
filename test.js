// Run with: node test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const A = require('./analysis.js');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }

const csv = fs.readFileSync(path.join(__dirname, 'sample_data', 'sales_sample.csv'), 'utf8');
const fmt = A.makeFmt('$');

test('CSV parser handles quotes, embedded commas, BOM and CRLF', () => {
  const t = A.parseCSV('﻿a,b\r\n"x, y","he said ""hi"""\r\n');
  assert.deepStrictEqual(t, [['a', 'b'], ['x, y', 'he said "hi"']]);
});

test('semicolon and tab delimiters are detected', () => {
  assert.deepStrictEqual(A.parseCSV('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
  assert.deepStrictEqual(A.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('amounts: currency symbols, EU decimals, negatives, junk', () => {
  assert.strictEqual(A.parseAmount('$1,234.50'), 1234.5);
  assert.strictEqual(A.parseAmount('1.234,50'), 1234.5);
  assert.strictEqual(A.parseAmount('12 000'), 12000);
  assert.strictEqual(A.parseAmount('1,234'), 1234);
  assert.strictEqual(A.parseAmount('(500)'), -500);
  assert.ok(isNaN(A.parseAmount('n/a')));
  assert.ok(isNaN(A.parseAmount('')));
});

test('dates: ISO, month only, d.m.y, d/m/y when unambiguous, m/d/y', () => {
  assert.strictEqual(A.parseDate('2026-03-15'), '2026-03-15');
  assert.strictEqual(A.parseDate('2026-03'), '2026-03-01');
  assert.strictEqual(A.parseDate('15.03.2026'), '2026-03-15');
  assert.strictEqual(A.parseDate('15/03/2026'), '2026-03-15');
  assert.strictEqual(A.parseDate('03/15/2026'), '2026-03-15');
  assert.strictEqual(A.parseDate('garbage'), null);
});

test('status words map to won / lost / open', () => {
  assert.strictEqual(A.statusOf('Closed Won'), 'won');
  assert.strictEqual(A.statusOf('Closed Lost'), 'lost');
  assert.strictEqual(A.statusOf('closed'), 'won');
  assert.strictEqual(A.statusOf('Negotiation'), 'open');
  assert.strictEqual(A.statusOf('Declined'), 'lost');
});

test('column aliases are recognised', () => {
  const r = A.parseDeals('Close Date,Territory,Account Owner,Plan,Deal Value,Stage\n2026-01-05,EMEA,Ann,Pro,"$1,000",Closed Won\n');
  assert.ok(!r.error, r.error);
  assert.strictEqual(r.deals[0].rep, 'Ann');
  assert.strictEqual(r.deals[0].amount, 1000);
  assert.strictEqual(r.deals[0].status, 'won');
});

test('missing required column gives a helpful error', () => {
  const r = A.parseDeals('region,rep,amount\nEMEA,Ann,100\n');
  assert.ok(/product/.test(r.error));
});

test('bad amounts are skipped and reported, not fatal', () => {
  const r = A.parseDeals('region,rep,product,amount,status\nEMEA,A,P,100,won\nEMEA,A,P,oops,won\n');
  assert.strictEqual(r.deals.length, 1);
  assert.ok(r.warnings.some((w) => /skipped/.test(w)));
});

test('sample data parses cleanly', () => {
  const r = A.parseDeals(csv);
  assert.ok(!r.error);
  assert.strictEqual(r.warnings.length, 0);
  assert.ok(r.deals.length > 1000);
});

test('totals equal the sum of every breakdown (nothing lost or double counted)', () => {
  const { deals } = A.parseDeals(csv);
  const a = A.analyze(deals, 'revenue');
  for (const dim of ['region', 'rep', 'product']) {
    const sum = a.dims[dim].groups.reduce((s, g) => s + g.m.revenue, 0);
    assert.ok(Math.abs(sum - a.total.revenue) < 1e-6, dim);
    assert.strictEqual(a.dims[dim].groups.reduce((s, g) => s + g.m.deals, 0), a.total.deals, dim);
  }
  assert.ok(Math.abs(a.series.reduce((s, m) => s + m.revenue, 0) - a.total.revenue) < 1e-6);
});

test('open deals never count towards revenue or win rate', () => {
  const m = A.measure([
    { status: 'won', amount: 100 }, { status: 'lost', amount: 999 }, { status: 'open', amount: 5000 }
  ]);
  assert.strictEqual(m.revenue, 100);
  assert.strictEqual(m.deals, 1);
  assert.strictEqual(m.winRate, 0.5);
  assert.strictEqual(m.avg, 100);
});

test('every metric can be ranked and sorted descending', () => {
  const { deals } = A.parseDeals(csv);
  for (const k of Object.keys(A.METRICS)) {
    const a = A.analyze(deals, k);
    for (const dim of ['region', 'rep', 'product']) {
      const v = a.dims[dim].groups.map((g) => g.value);
      assert.deepStrictEqual(v, v.slice().sort((x, y) => y - x), k + ' ' + dim);
      assert.ok(v.every((x) => Number.isFinite(x)));
    }
  }
});

test('sample data surfaces the planted story', () => {
  const { deals } = A.parseDeals(csv);
  const a = A.analyze(deals, 'revenue');
  assert.strictEqual(a.dims.region.groups[0].name, 'EMEA');
  assert.ok(a.dims.region.groups[0].top);
  const low = a.dims.region.groups[a.dims.region.groups.length - 1];
  assert.strictEqual(low.name, 'LATAM');
  assert.ok(low.attention);
  assert.strictEqual(a.dims.product.groups[0].name, 'Enterprise');
  const rep = (n) => a.dims.rep.groups.find((g) => g.name === n);
  assert.ok(rep('Tom Reyes').attention);
  assert.ok(rep('Marcus Webb').declining);
  assert.ok(!rep('Lena Fischer').attention);
});

test('products are never flagged just for being cheap', () => {
  const { deals } = A.parseDeals(csv);
  const a = A.analyze(deals, 'revenue');
  assert.ok(a.dims.product.groups.every((g) => !g.attention));
});

test('summary is readable: no NaN, undefined or dashes', () => {
  const { deals } = A.parseDeals(csv);
  const text = A.summaryText(A.summarize(deals, fmt));
  assert.ok(!/NaN|undefined|Infinity|—|–/.test(text), text);
  assert.ok(/EMEA/.test(text) && /Enterprise/.test(text));
});

test('summary handles a one-month, one-region file', () => {
  const r = A.parseDeals('date,region,rep,product,amount,status\n2026-01-02,EMEA,A,P,100,won\n2026-01-03,EMEA,A,P,50,lost\n');
  const text = A.summaryText(A.summarize(r.deals, fmt));
  assert.ok(!/NaN|undefined/.test(text), text);
  assert.ok(/Jan 2026/.test(text));
});

test('file without status or date still works', () => {
  const r = A.parseDeals('region,rep,product,amount\nEMEA,A,P,100\nAPAC,B,P,300\n');
  assert.ok(r.warnings.length === 2);
  const a = A.analyze(r.deals, 'revenue');
  assert.strictEqual(a.total.revenue, 400);
  assert.strictEqual(a.series.length, 0);
  assert.ok(!/NaN|undefined/.test(A.summaryText(A.summarize(r.deals, fmt))));
});

test('AI prompt contains aggregates only, no deal ids', () => {
  const { deals } = A.parseDeals(csv);
  const p = A.buildPrompt(deals, fmt);
  assert.ok(/BY REGION/.test(p) && /BY SALES REP/.test(p));
  assert.ok(!/D-1\d{3}/.test(p));
});

test('currency symbol is applied', () => {
  assert.strictEqual(A.makeFmt('€').money(12500), '€12.5K');
  assert.strictEqual(A.makeFmt('$').money(2500000), '$2.50M');
  assert.strictEqual(A.makeFmt('$').money(950), '$950');
});

console.log('\n' + passed + ' tests passed');
