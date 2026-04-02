import { describe, test, expect } from 'bun:test';
import { applyDefaultNeSru } from '../../src/commands/sru-report/neDefaultSru.js';
import type { SieDocument } from '@skattata/sie-core';

function makeDoc(accounts: Array<{ id: string; sruCode?: string }>): SieDocument {
  const doc = {
    companyName: 'Test',
    organizationNumber: '',
    format: 'PC8',
    sieType: 1,
    flagga: 0,
    currency: 'SEK',
    program: '',
    generatedAt: '',
    bookingYears: [],
    accounts: new Map(),
    vouchers: [],
    dimensions: [],
    errors: [],
  } as SieDocument;

  for (const a of accounts) {
    doc.accounts.set(a.id, {
      accountId: a.id,
      name: `Account ${a.id}`,
      type: '' as any,
      sruCode: a.sruCode ?? '',
      unit: '',
      openingBalance: 0,
      closingBalance: 0,
      result: 0,
      yearBalances: new Map(),
      periodValues: [],
    });
  }

  return doc;
}

describe('applyDefaultNeSru', () => {
  test('maps accounts without sruCode to K1 defaults', () => {
    const doc = makeDoc([
      { id: '1930' },  // -> 7280
      { id: '2010' },  // -> 7300
      { id: '3010' },  // -> 7400
      { id: '4010' },  // -> 7500
      { id: '5010' },  // -> 7501
      { id: '8310' },  // -> 7403
    ]);

    const count = applyDefaultNeSru(doc);

    expect(count).toBe(6);
    expect(doc.accounts.get('1930')!.sruCode).toBe('7280');
    expect(doc.accounts.get('2010')!.sruCode).toBe('7300');
    expect(doc.accounts.get('3010')!.sruCode).toBe('7400');
    expect(doc.accounts.get('4010')!.sruCode).toBe('7500');
    expect(doc.accounts.get('5010')!.sruCode).toBe('7501');
    expect(doc.accounts.get('8310')!.sruCode).toBe('7403');
  });

  test('existing sruCode is never overwritten', () => {
    const doc = makeDoc([
      { id: '1930', sruCode: '7281' },  // already mapped — should stay 7281
      { id: '3010' },                    // no mapping — should get 7400
    ]);

    const count = applyDefaultNeSru(doc);

    expect(count).toBe(1);
    expect(doc.accounts.get('1930')!.sruCode).toBe('7281');
    expect(doc.accounts.get('3010')!.sruCode).toBe('7400');
  });

  test('unmapped accounts are skipped (return count excludes them)', () => {
    const doc = makeDoc([
      { id: '2150' },  // untaxed reserves — NOT in K1, should stay unmapped
      { id: '3350' },  // not in K1 chart
      { id: '8050' },  // 8000-8299 gap — not mapped
      { id: '1930' },  // mapped -> 7280
    ]);

    const count = applyDefaultNeSru(doc);

    expect(count).toBe(1);
    expect(doc.accounts.get('2150')!.sruCode).toBe('');
    expect(doc.accounts.get('3350')!.sruCode).toBe('');
    expect(doc.accounts.get('8050')!.sruCode).toBe('');
    expect(doc.accounts.get('1930')!.sruCode).toBe('7280');
  });

  test('depreciation accounts map to correct R9/R10 splits', () => {
    const doc = makeDoc([
      { id: '7700' },  // R9: 7504
      { id: '7810' },  // R10: 7505
      { id: '7825' },  // R9: 7504
      { id: '7850' },  // R10: 7505
    ]);

    const count = applyDefaultNeSru(doc);

    expect(count).toBe(4);
    expect(doc.accounts.get('7700')!.sruCode).toBe('7504');
    expect(doc.accounts.get('7810')!.sruCode).toBe('7505');
    expect(doc.accounts.get('7825')!.sruCode).toBe('7504');
    expect(doc.accounts.get('7850')!.sruCode).toBe('7505');
  });

  test('3970-3989 maps to R2 (7401), not R1', () => {
    const doc = makeDoc([
      { id: '3970' },
      { id: '3980' },
    ]);

    const count = applyDefaultNeSru(doc);

    expect(count).toBe(2);
    expect(doc.accounts.get('3970')!.sruCode).toBe('7401');
    expect(doc.accounts.get('3980')!.sruCode).toBe('7401');
  });

  test('3700-3969 maps to R1 (7400) — documented blocker', () => {
    const doc = makeDoc([
      { id: '3700' },
      { id: '3800' },
      { id: '3900' },
      { id: '3969' },
    ]);
    const count = applyDefaultNeSru(doc);
    expect(count).toBe(4);
    expect(doc.accounts.get('3700')!.sruCode).toBe('7400');
    expect(doc.accounts.get('3800')!.sruCode).toBe('7400');
    expect(doc.accounts.get('3900')!.sruCode).toBe('7400');
    expect(doc.accounts.get('3969')!.sruCode).toBe('7400');
  });

  test('returns 0 when all accounts already have sruCode', () => {
    const doc = makeDoc([
      { id: '1930', sruCode: '7281' },
      { id: '3010', sruCode: '7410' },
    ]);

    const count = applyDefaultNeSru(doc);
    expect(count).toBe(0);
  });
});
