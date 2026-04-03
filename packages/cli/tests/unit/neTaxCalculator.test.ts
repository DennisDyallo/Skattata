import { describe, test, expect } from 'bun:test';
import { NeTaxCalculator } from '../../src/shared/NeTaxCalculator.js';
import type { SieDocument } from '@skattata/sie-core';
import type { TaxRates } from '../../src/shared/taxRates.js';

const RATES_2025: TaxRates = {
  year: 2025,
  egenavgifterRate: 0.2897,
  schablonavdrag: 0.25,
  rantefordelningPositive: 0.0796,
  rantefordelningNegative: 0.0296,
  expansionsfondRate: 0.206,
  pbb: 58800,
  stateTaxThreshold: 613900,
  stateTaxRate: 0.20,
};

function makeDoc(accounts: Array<{
  id: string;
  type?: string;
  result?: number;
  openingBalance?: number;
  closingBalance?: number;
}>): SieDocument {
  const doc = {
    companyName: 'Test',
    organizationNumber: '',
    format: 'PC8',
    sieType: 4,
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
      type: (a.type ?? '') as any,
      sruCode: '',
      unit: '',
      openingBalance: a.openingBalance ?? 0,
      closingBalance: a.closingBalance ?? 0,
      result: a.result ?? 0,
      balance: 0,
      quantity: 0,
      yearBalances: new Map(),
      periodValues: [],
      objectValues: [],
    });
  }

  return doc;
}

describe('NeTaxCalculator', () => {
  const calc = new NeTaxCalculator();

  test('positive income: egenavgifter and schablonavdrag computed', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -300000 },  // revenue (credit)
      { id: '4010', type: 'K', result: 0 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.netIncome).toBe(300000);
    expect(r.egenavgifter).toBe(Math.trunc(300000 * 0.2897));  // 86910
    expect(r.schablonavdrag).toBe(Math.trunc(300000 * 0.25));   // 75000
    expect(r.taxBase).toBe(Math.trunc(300000 * 0.75));           // 225000
  });

  test('zero income: no egenavgifter or schablonavdrag', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -100000 },
      { id: '4010', type: 'K', result: 100000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.netIncome).toBe(0);
    expect(r.egenavgifter).toBe(0);
    expect(r.schablonavdrag).toBe(0);
  });

  test('negative income: no egenavgifter or schablonavdrag', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -50000 },
      { id: '4010', type: 'K', result: 100000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.netIncome).toBe(-50000);
    expect(r.egenavgifter).toBe(0);
    expect(r.schablonavdrag).toBe(0);
  });

  test('positive capital base: rantefordelning positive', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -300000 },
      { id: '2081', type: 'S', openingBalance: -200000, closingBalance: -500000 },
      { id: '1930', type: 'T', openingBalance: 200000, closingBalance: 500000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.capitalBase).toBe(200000);
    expect(r.rantefordelningPositive).toBe(Math.trunc(200000 * 0.0796));  // 15920
    expect(r.rantefordelningNegative).toBe(0);
  });

  test('negative capital base: rantefordelning negative', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -100000 },
      { id: '2081', type: 'S', openingBalance: 50000, closingBalance: -60000 },
      { id: '1930', type: 'T', openingBalance: 10000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.capitalBase).toBe(-50000);  // -(50000) = -50000
    expect(r.rantefordelningPositive).toBe(0);
    expect(r.rantefordelningNegative).toBe(Math.trunc(50000 * 0.0296));  // 1480
  });

  test('zero capital base: no rantefordelning', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -100000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.capitalBase).toBe(0);
    expect(r.rantefordelningPositive).toBe(0);
    expect(r.rantefordelningNegative).toBe(0);
  });

  test('expansionsfond: equity increase', () => {
    // 2081 opening=-100000, closing=-300000 → equity opening=100000, closing=300000
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -500000 },
      { id: '4010', type: 'K', result: 300000 },
      { id: '2081', type: 'S', openingBalance: -100000, closingBalance: -300000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.equityOpening).toBe(100000);
    expect(r.equityClosing).toBe(300000);
    expect(r.expansionsfondBase).toBe(200000);
    expect(r.expansionsfondTax).toBe(Math.trunc(200000 * 0.206));  // 41200
  });

  test('expansionsfond: equity decrease = zero base', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -100000 },
      { id: '2081', type: 'S', openingBalance: -300000, closingBalance: -100000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.equityOpening).toBe(300000);
    expect(r.equityClosing).toBe(100000);
    expect(r.expansionsfondBase).toBe(0);
    expect(r.expansionsfondTax).toBe(0);
  });

  test('capitalBase includes 2100-2999 but expansionsfond only 2000-2099', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -100000 },
      { id: '2081', type: 'S', openingBalance: -100000, closingBalance: -200000 },
      { id: '2440', type: 'S', openingBalance: -50000, closingBalance: -80000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    // capitalBase = -((-100000) + (-50000)) = 150000
    expect(r.capitalBase).toBe(150000);
    // expansionsfond only 2000-2099: opening=100000, closing=200000
    expect(r.expansionsfondBase).toBe(100000);
  });

  test('adjustedResult positive when income exceeds deductions', () => {
    // netIncome=300000, schablonavdrag=75000, no rantefordelning, no expansionsfond
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -300000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    // adjustedResult = 300000 - 75000 - 0 + 0 - 0 = 225000
    expect(r.adjustedResult).toBe(225000);
  });

  test('adjustedResult negative when deductions exceed income', () => {
    // netIncome=100000, schablonavdrag=25000, rantefordelningPositive=7960 (capitalBase=100000),
    // expansionsfondBase=200000
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -100000 },
      { id: '2081', type: 'S', openingBalance: -100000, closingBalance: -300000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    // adjustedResult = 100000 - 25000 - 7960 + 0 - 200000 = -132960
    expect(r.adjustedResult).toBe(-132960);
  });

  test('adjustedResult zero when netIncome is zero', () => {
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -100000 },
      { id: '4010', type: 'K', result: 100000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    expect(r.adjustedResult).toBe(0);
  });

  test('adjustedResult excludes egenavgifter (R41)', () => {
    // Verify R41 is NOT part of the adjusted result formula
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -300000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    // If R41 were included: 300000 + 86910 - 75000 = 311910
    // Without R41: 300000 - 75000 = 225000
    expect(r.adjustedResult).toBe(225000);
    expect(r.egenavgifter).toBe(86910); // R41 exists but not in adjustedResult
  });

  test('adjustedResult includes rantefordelning', () => {
    // Positive räntefördelning reduces result, negative increases it
    const doc = makeDoc([
      { id: '3010', type: 'I', result: -300000 },
      { id: '2081', type: 'S', openingBalance: -200000, closingBalance: -200000 },
    ]);
    const r = calc.calculate(doc, 0, RATES_2025);
    // adjustedResult = 300000 - 75000 - 15920 + 0 - 0 = 209080
    expect(r.adjustedResult).toBe(209080);
  });
});
