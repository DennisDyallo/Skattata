import { describe, expect, test } from 'bun:test';
import { SieDocumentWriter, writeSie4, formatDate, quoteToken } from '../../src/writer/SieDocumentWriter.js';
import { SieTagParser } from '../../src/parser/SieTagParser.js';
import { SieDocument } from '../../src/models/SieDocument.js';
import { SieAccount } from '../../src/models/SieAccount.js';
import { SieVoucher } from '../../src/models/SieVoucher.js';
import { SieVoucherRow } from '../../src/models/SieVoucherRow.js';
import { decodeSie4 } from '../../src/internal/encoding.js';

describe('quoteToken', () => {
  test('quotes empty string', () => {
    expect(quoteToken('')).toBe('""');
  });

  test('quotes string with space', () => {
    expect(quoteToken('hello world')).toBe('"hello world"');
  });

  test('does not quote object reference {1 "100"}', () => {
    expect(quoteToken('{1 "100"}')).toBe('{1 "100"}');
  });

  test('does not quote simple string', () => {
    expect(quoteToken('PC8')).toBe('PC8');
  });

  test('quotes string with backslash', () => {
    expect(quoteToken('a\\b')).toBe('"a\\\\b"');
  });

  test('quotes string containing double quotes', () => {
    expect(quoteToken('say "hi"')).toBe('"say \\"hi\\""');
  });
});

describe('formatDate', () => {
  test('formats January 15, 2024', () => {
    expect(formatDate(new Date(2024, 0, 15))).toBe('20240115');
  });

  test('formats December 31, 2023', () => {
    expect(formatDate(new Date(2023, 11, 31))).toBe('20231231');
  });
});

describe('SieDocumentWriter', () => {
  test('emits #FORMAT tag', () => {
    const doc = new SieDocument();
    doc.format = 'PC8';
    const buf = writeSie4(doc);
    const text = decodeSie4(buf);
    expect(text).toContain('#FORMAT PC8');
  });

  test('emits #FNAMN for company name', () => {
    const doc = new SieDocument();
    doc.companyName = 'Test AB';
    const buf = writeSie4(doc);
    const text = decodeSie4(buf);
    expect(text).toContain('#FNAMN "Test AB"');
  });

  test('round-trip: minimal doc with one account and one voucher', () => {
    const doc = new SieDocument();
    doc.format = 'PC8';
    doc.companyName = 'RoundTrip AB';

    const acc = new SieAccount();
    acc.accountId = '1910';
    acc.name = 'Kassa';
    doc.accounts.set(acc.accountId, acc);

    const voucher = new SieVoucher();
    voucher.series = 'A';
    voucher.number = '1';
    voucher.date = new Date(2024, 0, 15);
    voucher.text = 'Test voucher';

    const row = new SieVoucherRow();
    row.accountNumber = '1910';
    row.amount = 100.0;
    row.transactionDate = voucher.date;
    voucher.rows.push(row);

    doc.vouchers.push(voucher);

    const buf = writeSie4(doc);

    // Re-parse the written buffer
    const parser = new SieTagParser();
    const reparsed = parser.parse(buf);

    // Verify account name survived round-trip
    expect(reparsed.accounts.get('1910')?.name).toBe('Kassa');

    // Verify voucher series survived round-trip
    expect(reparsed.vouchers.length).toBe(1);
    expect(reparsed.vouchers[0].series).toBe('A');
    expect(reparsed.companyName).toBe('RoundTrip AB');
  });

  test('uses CRLF line endings', () => {
    const doc = new SieDocument();
    const buf = writeSie4(doc);
    const text = decodeSie4(buf);
    expect(text).toContain('\r\n');
  });
});
