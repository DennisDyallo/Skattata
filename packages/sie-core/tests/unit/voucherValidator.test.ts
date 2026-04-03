import { describe, it, expect } from 'bun:test';
import { VoucherValidator } from '../../src/validator/VoucherValidator.js';
import { SieVoucher } from '../../src/models/SieVoucher.js';
import { SieVoucherRow } from '../../src/models/SieVoucherRow.js';
import { SieDocument } from '../../src/models/SieDocument.js';
import { SieBookingYear } from '../../src/models/SieBookingYear.js';
import { SieAccount } from '../../src/models/SieAccount.js';

function makeRow(accountNumber: string, amount: number): SieVoucherRow {
  const row = new SieVoucherRow();
  row.accountNumber = accountNumber;
  row.amount = amount;
  return row;
}

function makeVoucher(opts: {
  rows?: SieVoucherRow[];
  date?: Date;
  text?: string;
  series?: string;
  number?: string;
}): SieVoucher {
  const v = new SieVoucher();
  v.rows = opts.rows ?? [makeRow('1930', 5000), makeRow('3000', -5000)];
  v.date = opts.date ?? new Date('2023-06-15');
  v.text = opts.text ?? 'Test voucher';
  v.series = opts.series ?? 'V';
  v.number = opts.number ?? '1';
  return v;
}

function makeDoc(opts?: {
  accounts?: Map<string, SieAccount>;
  vouchers?: SieVoucher[];
  bookingYears?: SieBookingYear[];
}): SieDocument {
  const doc = new SieDocument();
  if (opts?.accounts) doc.accounts = opts.accounts;
  if (opts?.vouchers) doc.vouchers = opts.vouchers;
  if (opts?.bookingYears) doc.bookingYears = opts.bookingYears;
  return doc;
}

function makeBookingYear(start: string, end: string): SieBookingYear {
  const by = new SieBookingYear();
  by.id = 0;
  by.startDate = new Date(start);
  by.endDate = new Date(end);
  return by;
}

function makeAccount(id: string, name: string): SieAccount {
  const acc = new SieAccount();
  acc.accountId = id;
  acc.name = name;
  return acc;
}

const validator = new VoucherValidator();

describe('VoucherValidator', () => {
  describe('valid vouchers', () => {
    it('accepts a balanced 2-row voucher', () => {
      const result = validator.validate(makeVoucher({}));
      expect(result.valid).toBe(true);
      expect(result.errors.filter((e) => e.fatal)).toHaveLength(0);
    });
  });

  describe('fatal errors', () => {
    it('rejects voucher with fewer than 2 rows', () => {
      const v = makeVoucher({ rows: [makeRow('1930', 5000)] });
      const result = validator.validate(v);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.fatal && e.message.includes('at least 2 rows'))).toBe(true);
    });

    it('rejects unbalanced voucher', () => {
      const v = makeVoucher({
        rows: [makeRow('1930', 5000), makeRow('3000', -4999)],
      });
      const result = validator.validate(v);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.fatal && e.message.includes('not balanced'))).toBe(true);
    });

    it('accepts voucher within tolerance (balance < 0.005)', () => {
      const v = makeVoucher({
        rows: [makeRow('1930', 5000), makeRow('3000', -5000.004)],
      });
      const result = validator.validate(v);
      const balanceErrors = result.errors.filter((e) => e.fatal && e.message.includes('not balanced'));
      expect(balanceErrors).toHaveLength(0);
    });

    it('rejects row with empty account number', () => {
      const v = makeVoucher({
        rows: [makeRow('', 5000), makeRow('3000', -5000)],
      });
      const result = validator.validate(v);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.fatal && e.message.includes('no account number'))).toBe(true);
    });

    it('rejects row with zero amount', () => {
      const v = makeVoucher({
        rows: [makeRow('1930', 0), makeRow('3000', 0)],
      });
      const result = validator.validate(v);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.fatal && e.message.includes('zero amount'))).toBe(true);
    });

    it('rejects sentinel date new Date(0)', () => {
      const v = makeVoucher({ date: new Date(0) });
      const result = validator.validate(v);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.fatal && e.message.includes('no valid date'))).toBe(true);
    });

    it('rejects date outside fiscal year', () => {
      const by = makeBookingYear('2023-01-01', '2023-12-31');
      const doc = makeDoc({ bookingYears: [by] });
      const v = makeVoucher({ date: new Date('2024-03-15') });
      const result = validator.validate(v, doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.fatal && e.message.includes('outside fiscal year'))).toBe(true);
    });

    it('accepts date inside fiscal year', () => {
      const by = makeBookingYear('2023-01-01', '2023-12-31');
      const accounts = new Map<string, SieAccount>();
      accounts.set('1930', makeAccount('1930', 'Bank'));
      accounts.set('3000', makeAccount('3000', 'Sales'));
      const doc = makeDoc({ bookingYears: [by], accounts });
      const v = makeVoucher({ date: new Date('2023-06-15') });
      const result = validator.validate(v, doc);
      const fiscalErrors = result.errors.filter((e) => e.message.includes('outside fiscal year'));
      expect(fiscalErrors).toHaveLength(0);
    });

    it('rejects duplicate voucher number in same series', () => {
      const existing = makeVoucher({ series: 'V', number: '1' });
      const doc = makeDoc({ vouchers: [existing] });
      const v = makeVoucher({ series: 'V', number: '1' });
      const result = validator.validate(v, doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.fatal && e.message.includes('already exists'))).toBe(true);
    });
  });

  describe('warnings (non-fatal)', () => {
    it('warns when account not found in chart of accounts', () => {
      const doc = makeDoc({ accounts: new Map() });
      const v = makeVoucher({});
      const result = validator.validate(v, doc);
      expect(result.valid).toBe(true);
      expect(result.errors.some((e) => !e.fatal && e.message.includes('not found in chart'))).toBe(true);
    });

    it('warns when voucher has no description', () => {
      const v = makeVoucher({ text: '' });
      const result = validator.validate(v);
      expect(result.valid).toBe(true);
      expect(result.errors.some((e) => !e.fatal && e.message.includes('no description'))).toBe(true);
    });

    it('warns on large amounts', () => {
      const v = makeVoucher({
        rows: [makeRow('1930', 2_000_000), makeRow('3000', -2_000_000)],
      });
      const result = validator.validate(v);
      expect(result.valid).toBe(true);
      expect(result.errors.filter((e) => !e.fatal && e.message.includes('large amount'))).toHaveLength(2);
    });
  });
});
