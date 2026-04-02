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

describe('f-skatt', () => {
  test('profit=400000 at 32% municipal rate: monthly instalment = 7104', () => {
    const data = runCli('f-skatt', `${SYNTHETIC}/skattata-test-f-skatt.se`, '--municipality-rate', '0.32', '--format', 'json');
    expect(data.businessProfit).toBe(400000);
    expect(data.egenavgifterDeduction).toBe(100000);
    expect(data.grundavdrag).toBe(33600);
    expect(data.taxableIncome).toBe(266400);
    expect(data.municipalTax).toBe(85248);
    expect(data.stateTax).toBe(0);
    expect(data.monthlyInstalment).toBe(7104);
  });

  test('grundavdrag override replaces PBB-calculated value', () => {
    const data = runCli('f-skatt', `${SYNTHETIC}/skattata-test-f-skatt.se`, '--municipality-rate', '0.32', '--grundavdrag', '42000', '--format', 'json');
    expect(data.grundavdrag).toBe(42000);
    // taxableIncome = 300000 - 42000 = 258000
    expect(data.taxableIncome).toBe(258000);
  });

  test('missing --municipality-rate exits with error', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'f-skatt', `${SYNTHETIC}/skattata-test-f-skatt.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('municipality-rate');
  });

  test('zero profit produces zero tax', () => {
    // skattata-test-sru-no-income.se has no revenue/cost accounts → profit=0
    const data = runCli('f-skatt', `${SYNTHETIC}/skattata-test-sru-no-income.se`, '--municipality-rate', '0.32', '--format', 'json');
    expect(data.businessProfit).toBe(0);
    expect(data.totalAnnualTax).toBe(0);
    expect(data.monthlyInstalment).toBe(0);
  });
});
