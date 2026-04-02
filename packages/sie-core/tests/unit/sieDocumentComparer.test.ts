import { describe, expect, test } from 'bun:test';
import { compareSieDocuments } from '../../src/comparer/SieDocumentComparer.js';
import { SieDocument } from '../../src/models/SieDocument.js';
import { SieAccount } from '../../src/models/SieAccount.js';
import { SieVoucher } from '../../src/models/SieVoucher.js';

function makeDoc(): SieDocument {
  const doc = new SieDocument();
  doc.companyName = 'Test AB';
  doc.format = 'PC8';

  const acc = new SieAccount();
  acc.accountId = '1910';
  acc.name = 'Kassa';
  doc.accounts.set('1910', acc);

  const v = new SieVoucher();
  v.series = 'A';
  v.number = '1';
  v.date = new Date(2024, 0, 15);
  v.text = 'Test';
  doc.vouchers.push(v);

  return doc;
}

describe('SieDocumentComparer', () => {
  test('identical documents produce empty diffs', () => {
    const a = makeDoc();
    const b = makeDoc();
    expect(compareSieDocuments(a, b)).toEqual([]);
  });

  test('different company name produces diff containing "companyName"', () => {
    const a = makeDoc();
    const b = makeDoc();
    b.companyName = 'Other AB';
    const diffs = compareSieDocuments(a, b);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.some(d => d.includes('companyName'))).toBe(true);
  });

  test('different account count produces diff containing "accounts count"', () => {
    const a = makeDoc();
    const b = makeDoc();
    const extra = new SieAccount();
    extra.accountId = '2610';
    extra.name = 'Moms';
    b.accounts.set('2610', extra);
    const diffs = compareSieDocuments(a, b);
    expect(diffs.some(d => d.includes('accounts count'))).toBe(true);
  });

  test('different voucher count produces diff containing "vouchers count"', () => {
    const a = makeDoc();
    const b = makeDoc();
    const v2 = new SieVoucher();
    v2.series = 'B';
    v2.number = '2';
    v2.date = new Date(2024, 1, 1);
    v2.text = 'Extra';
    b.vouchers.push(v2);
    const diffs = compareSieDocuments(a, b);
    expect(diffs.some(d => d.includes('vouchers count'))).toBe(true);
  });

  test('different voucher series produces diff mentioning "series"', () => {
    const a = makeDoc();
    const b = makeDoc();
    b.vouchers[0].series = 'Z';
    const diffs = compareSieDocuments(a, b);
    expect(diffs.some(d => d.includes('series'))).toBe(true);
  });
});
