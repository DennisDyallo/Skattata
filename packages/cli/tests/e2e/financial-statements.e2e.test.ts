import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../src/index.ts');
const SYNTHETIC = resolve(import.meta.dir, '../../../../sie_test_files/synthetic');

function runCli(...args: string[]): Record<string, unknown> {
  const result = Bun.spawnSync(['bun', 'run', CLI, ...args], {
    cwd: resolve(import.meta.dir, '../../../..'),
  });
  if (result.exitCode !== 0) {
    throw new Error(`CLI exited ${result.exitCode}: ${result.stderr.toString()}`);
  }
  return JSON.parse(result.stdout.toString());
}

describe('balance-sheet', () => {
  test('skattata-test-balanced-annual.se: totalAssets = totalEquityAndLiabilities = 150000', () => {
    const data = runCli('balance-sheet', `${SYNTHETIC}/skattata-test-balanced-annual.se`, '--format', 'json');
    expect(data.totalAssets).toBeCloseTo(150000, 1);
    expect(data.totalEquityAndLiabilities).toBeCloseTo(150000, 1);
    expect(Math.abs(data.balanceDiff as number)).toBeLessThan(1);
    expect(data.netIncome).toBeCloseTo(0, 1);
  });

  test('skattata-test-income-statement.se: balance sheet closes via pre-booked 2099', () => {
    const data = runCli('balance-sheet', `${SYNTHETIC}/skattata-test-income-statement.se`, '--format', 'json');
    // Assets = 20000 (bank). Equity = 20000 (2099 negated). Diff should be 0.
    expect(data.totalAssets).toBeCloseTo(20000, 1);
    expect(data.totalEquityAndLiabilities).toBeCloseTo(20000, 1);
    expect(Math.abs(data.balanceDiff as number)).toBeLessThan(1);
  });
});

describe('income-statement', () => {
  test('skattata-test-income-statement.se: netIncome = 20000', () => {
    const data = runCli('income-statement', `${SYNTHETIC}/skattata-test-income-statement.se`, '--format', 'json');
    expect(data.netIncome).toBeCloseTo(20000, 1);
    expect(data.grossProfit).toBeCloseTo(100000, 1);
  });
});

describe('moms', () => {
  test('skattata-test-moms-annual.se: Field 49 = 15000 (net payable)', () => {
    const data = runCli('moms', `${SYNTHETIC}/skattata-test-moms-annual.se`, '--format', 'json');
    const fields = data.fields as Array<{ code: string; amount: number }>;
    const f49 = fields.find(f => f.code === '49');
    expect(f49?.amount).toBeCloseTo(15000, 1);
    expect(data.netVat).toBeCloseTo(15000, 1);
  });

  test('skattata-test-moms-period.se --period 202301: Field 49 = 7500', () => {
    const data = runCli('moms', `${SYNTHETIC}/skattata-test-moms-period.se`, '--period', '202301', '--format', 'json');
    const fields = data.fields as Array<{ code: string; amount: number }>;
    const f49 = fields.find(f => f.code === '49');
    expect(f49?.amount).toBeCloseTo(7500, 1);
    expect(data.netVat).toBeCloseTo(7500, 1);
  });

  test('skattata-test-moms-period.se --period 999999 (no data): netVat = 0', () => {
    const data = runCli('moms', `${SYNTHETIC}/skattata-test-moms-period.se`, '--period', '999999', '--format', 'json');
    expect(data.netVat).toBe(0);
  });

  test('skattata-test-moms-refund.se: netVat negative = refund due', () => {
    const data = runCli('moms', `${SYNTHETIC}/skattata-test-moms-refund.se`, '--format', 'json');
    // Output VAT: 10000 owed. Input VAT: 30000 paid. Net: -20000 (refund)
    expect(data.netVat).toBeCloseTo(-20000, 1);
    const fields = data.fields as Array<{ code: string; amount: number }>;
    const f49 = fields.find(f => f.code === '49');
    expect(f49?.amount).toBeCloseTo(-20000, 1);
  });

  test('skattata-test-moms-annual.se: no EU fields when no EU accounts', () => {
    const data = runCli('moms', `${SYNTHETIC}/skattata-test-moms-annual.se`, '--format', 'json');
    const fields = data.fields as Array<{ code: string }>;
    expect(fields.find(f => f.code === '20')).toBeUndefined();
    expect(fields.find(f => f.code === '36')).toBeUndefined();
  });

  test('skattata-test-moms-eu.se: EU fields present with correct values', () => {
    const data = runCli('moms', `${SYNTHETIC}/skattata-test-moms-eu.se`, '--format', 'json');
    const fields = data.fields as Array<{ code: string; amount: number }>;
    // Domestic: out25 includes 2610 (-50000) + 2614 (-5000) = 55000 (negated)
    const f10 = fields.find(f => f.code === '10');
    expect(f10?.amount).toBeCloseTo(55000, 1);
    // Field 20: EU acquisitions (4515: 20000, positive debit — no negate)
    const f20 = fields.find(f => f.code === '20');
    expect(f20?.amount).toBeCloseTo(20000, 1);
    // Field 30: EU sales of goods (3105: -30000, negated = 30000)
    const f30 = fields.find(f => f.code === '30');
    expect(f30?.amount).toBeCloseTo(30000, 1);
    // Field 36: Reverse charge output VAT (2614: -5000, negated = 5000)
    const f36 = fields.find(f => f.code === '36');
    expect(f36?.amount).toBeCloseTo(5000, 1);
    // Field 37: Reverse charge input VAT (2645: 5000)
    const f37 = fields.find(f => f.code === '37');
    expect(f37?.amount).toBeCloseTo(5000, 1);
    // Warning about EU transactions
    const warnings = data.warnings as string[];
    expect(warnings.some(w => w.includes('EU'))).toBe(true);
  });
});

describe('income-statement --year flag', () => {
  test('multiyear: --year 0 netIncome = 50000', () => {
    const data = runCli('income-statement', `${SYNTHETIC}/skattata-test-income-multiyear.se`, '--year', '0', '--format', 'json');
    expect(data.netIncome).toBeCloseTo(50000, 1);
  });

  test('multiyear: --year -1 netIncome = 40000', () => {
    const data = runCli('income-statement', `${SYNTHETIC}/skattata-test-income-multiyear.se`, '--year', '-1', '--format', 'json');
    expect(data.netIncome).toBeCloseTo(40000, 1);
  });

  test('multiyear: 7410 lands in Depreciation section', () => {
    const data = runCli('income-statement', `${SYNTHETIC}/skattata-test-income-multiyear.se`, '--format', 'json');
    const sections = data.sections as Array<{ title: string; accounts: Array<{ id: string }> }>;
    const depSection = sections.find(s => s.title.includes('Depreciation'));
    expect(depSection?.accounts.some(a => a.id === '7410')).toBe(true);
  });

  test('multiyear: 7210 lands in Personnel section', () => {
    const data = runCli('income-statement', `${SYNTHETIC}/skattata-test-income-multiyear.se`, '--format', 'json');
    const sections = data.sections as Array<{ title: string; accounts: Array<{ id: string }> }>;
    const personSection = sections.find(s => s.title.includes('Personnel'));
    expect(personSection?.accounts.some(a => a.id === '7210')).toBe(true);
  });
});

describe('balance-sheet --year flag', () => {
  test('multiyear: --year 0 totalAssets = 50000', () => {
    const data = runCli('balance-sheet', `${SYNTHETIC}/skattata-test-income-multiyear.se`, '--year', '0', '--format', 'json');
    expect(data.totalAssets).toBeCloseTo(50000, 1);
  });

  test('multiyear: --year -1 totalAssets = 40000', () => {
    const data = runCli('balance-sheet', `${SYNTHETIC}/skattata-test-income-multiyear.se`, '--year', '-1', '--format', 'json');
    expect(data.totalAssets).toBeCloseTo(40000, 1);
  });
});

describe('sru-report', () => {
  test('skattata-test-sru-report.se: SRU 7410 ≈ 40000 (two revenue accounts, negated for display)', () => {
    const data = runCli('sru-report', `${SYNTHETIC}/skattata-test-sru-report.se`, '--format', 'json');
    const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;
    const e7410 = entries.find(e => e.sruCode === '7410');
    expect(e7410?.totalAmount).toBeCloseTo(40000, 1);
  });

  test('skattata-test-sru-report.se: SRU 7281 = 50000 (bank asset)', () => {
    const data = runCli('sru-report', `${SYNTHETIC}/skattata-test-sru-report.se`, '--format', 'json');
    const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;
    const e7281 = entries.find(e => e.sruCode === '7281');
    expect(e7281?.totalAmount).toBeCloseTo(50000, 1);
  });
});

describe('sru-report INK2R/INK2S validation', () => {
  test('INK2R with no SRU codes exits with error', () => {
    // skattata-test-balanced-annual.se has no SRU tags
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ink2r', '--format', 'json', `${SYNTHETIC}/skattata-test-balanced-annual.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    expect(result.exitCode).not.toBe(0);
    const stderr = result.stderr.toString();
    expect(stderr.toLowerCase()).toContain('ink2r');
  });

  test('INK2R with SRU codes passes (no error exit)', () => {
    // skattata-test-sru-report.se has SRU tags
    const data = runCli('sru-report', '--form', 'ink2r', `${SYNTHETIC}/skattata-test-sru-report.se`, '--format', 'json');
    const entries = data.entries as Array<{ sruCode: string }>;
    expect(entries.length).toBeGreaterThan(0);
  });

  test('INK2S with no adjustment codes exits 0 with note on stderr', () => {
    // skattata-test-balanced-annual.se has no SRU tags — but INK2S empty is OK
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ink2s', '--format', 'json', `${SYNTHETIC}/skattata-test-balanced-annual.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    // INK2S empty is valid — should NOT exit 1
    expect(result.exitCode).toBe(0);
    const stderr = result.stderr.toString();
    expect(stderr.toLowerCase()).toContain('no ink2s');
  });
});
