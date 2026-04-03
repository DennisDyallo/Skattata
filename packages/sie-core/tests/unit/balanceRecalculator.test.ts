import { describe, it, expect } from 'bun:test';
import { BalanceRecalculator } from '../../src/recalculator/BalanceRecalculator.js';
import { SieDocument } from '../../src/models/SieDocument.js';
import { SieAccount } from '../../src/models/SieAccount.js';
import { SieVoucher } from '../../src/models/SieVoucher.js';
import { SieVoucherRow } from '../../src/models/SieVoucherRow.js';

function makeAccount(id: string, opts?: {
  openingBalance?: number;
  closingBalance?: number;
  result?: number;
  yearBalances?: Map<number, { opening: number; closing: number; result: number }>;
}): SieAccount {
  const acc = new SieAccount();
  acc.accountId = id;
  acc.name = `Account ${id}`;
  acc.openingBalance = opts?.openingBalance ?? 0;
  acc.closingBalance = opts?.closingBalance ?? 0;
  acc.result = opts?.result ?? 0;
  acc.yearBalances = opts?.yearBalances ?? new Map();
  return acc;
}

function makeVoucher(rows: Array<{ account: string; amount: number }>): SieVoucher {
  const v = new SieVoucher();
  v.date = new Date('2023-06-15');
  v.rows = rows.map((r) => {
    const row = new SieVoucherRow();
    row.accountNumber = r.account;
    row.amount = r.amount;
    return row;
  });
  return v;
}

function makeDoc(
  accounts: Map<string, SieAccount>,
  vouchers: SieVoucher[] = [],
): SieDocument {
  const doc = new SieDocument();
  doc.accounts = accounts;
  doc.vouchers = vouchers;
  return doc;
}

const recalculator = new BalanceRecalculator();

describe('BalanceRecalculator', () => {
  it('recalculates balance sheet account: IB + movement = closing', () => {
    const accounts = new Map<string, SieAccount>();
    accounts.set('1930', makeAccount('1930', {
      openingBalance: 100000,
      closingBalance: 100000,
      yearBalances: new Map([[0, { opening: 100000, closing: 100000, result: 0 }]]),
    }));

    const vouchers = [
      makeVoucher([
        { account: '1930', amount: 10000 },
        { account: '3000', amount: -10000 },
      ]),
    ];

    const doc = makeDoc(accounts, vouchers);
    const result = recalculator.recalculate(doc);

    expect(doc.accounts.get('1930')!.closingBalance).toBe(110000);
    expect(doc.accounts.get('1930')!.yearBalances.get(0)!.closing).toBe(110000);
    expect(result.updatedAccounts.some(
      (u) => u.accountId === '1930' && u.previousClosing === 100000 && u.newClosing === 110000,
    )).toBe(true);
  });

  it('recalculates income account: result = sum of movements', () => {
    const accounts = new Map<string, SieAccount>();
    accounts.set('3000', makeAccount('3000', { result: 0 }));

    const vouchers = [
      makeVoucher([
        { account: '3000', amount: -50000 },
        { account: '1930', amount: 50000 },
      ]),
      makeVoucher([
        { account: '3000', amount: 20000 },
        { account: '1930', amount: -20000 },
      ]),
    ];

    const doc = makeDoc(accounts, vouchers);
    recalculator.recalculate(doc);

    expect(doc.accounts.get('3000')!.result).toBe(-30000);
  });

  it('creates accounts on-demand for unknown voucher references', () => {
    const accounts = new Map<string, SieAccount>();
    const vouchers = [
      makeVoucher([
        { account: '1930', amount: 5000 },
        { account: '3000', amount: -5000 },
      ]),
    ];

    const doc = makeDoc(accounts, vouchers);
    recalculator.recalculate(doc);

    expect(doc.accounts.has('1930')).toBe(true);
    expect(doc.accounts.get('1930')!.closingBalance).toBe(5000);
    expect(doc.accounts.has('3000')).toBe(true);
    expect(doc.accounts.get('3000')!.result).toBe(-5000);
  });

  it('keeps closingBalance = openingBalance when no vouchers exist (balance sheet)', () => {
    const accounts = new Map<string, SieAccount>();
    accounts.set('1930', makeAccount('1930', {
      openingBalance: 50000,
      closingBalance: 99999, // wrong value to be corrected
      yearBalances: new Map([[0, { opening: 50000, closing: 99999, result: 0 }]]),
    }));

    const doc = makeDoc(accounts, []);
    recalculator.recalculate(doc);

    expect(doc.accounts.get('1930')!.closingBalance).toBe(50000);
  });

  it('sets result to 0 for income accounts with no vouchers', () => {
    const accounts = new Map<string, SieAccount>();
    accounts.set('3000', makeAccount('3000', { result: 12345 }));

    const doc = makeDoc(accounts, []);
    recalculator.recalculate(doc);

    expect(doc.accounts.get('3000')!.result).toBe(0);
  });

  it('returns correct updatedAccounts list', () => {
    const accounts = new Map<string, SieAccount>();
    accounts.set('1930', makeAccount('1930', { openingBalance: 100, closingBalance: 100 }));
    accounts.set('1940', makeAccount('1940', { openingBalance: 200, closingBalance: 200 }));

    const vouchers = [
      makeVoucher([
        { account: '1930', amount: 50 },
        { account: '3000', amount: -50 },
      ]),
    ];

    const doc = makeDoc(accounts, vouchers);
    const result = recalculator.recalculate(doc);

    // 1930 changed (100 -> 150), 1940 unchanged (200 -> 200), 3000 created
    expect(result.updatedAccounts.find((u) => u.accountId === '1930')).toBeTruthy();
    expect(result.updatedAccounts.find((u) => u.accountId === '1940')).toBeUndefined();
    expect(result.updatedAccounts.find((u) => u.accountId === '3000')).toBeTruthy();
  });
});
