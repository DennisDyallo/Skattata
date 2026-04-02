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
});

describe('sru-report', () => {
  test('skattata-test-sru-report.se: SRU 7410 ≈ -40000 (two revenue accounts, credit sign)', () => {
    const data = runCli('sru-report', `${SYNTHETIC}/skattata-test-sru-report.se`, '--format', 'json');
    const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;
    const e7410 = entries.find(e => e.sruCode === '7410');
    expect(e7410?.totalAmount).toBeCloseTo(-40000, 1);
  });

  test('skattata-test-sru-report.se: SRU 7281 = 50000 (bank asset)', () => {
    const data = runCli('sru-report', `${SYNTHETIC}/skattata-test-sru-report.se`, '--format', 'json');
    const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;
    const e7281 = entries.find(e => e.sruCode === '7281');
    expect(e7281?.totalAmount).toBeCloseTo(50000, 1);
  });
});
