import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';

const CLI = resolve(import.meta.dir, '../../src/index.ts');
const SYNTHETIC = resolve(import.meta.dir, '../../../../sie_test_files/synthetic');

describe('income-statement --enskild-firma', () => {
  test('netIncome=20000 produces egenavgifter=5794 and estimate text in output', () => {
    // skattata-test-income-statement.se: revenue 100000, costs 80000, net 20000
    // egenavgifter = Math.trunc(20000 * 0.2897) = 5794
    const result = Bun.spawnSync(['bun', 'run', CLI, 'income-statement', '--enskild-firma', `${SYNTHETIC}/skattata-test-income-statement.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout.toLowerCase()).toContain('egenavgifter');
    expect(stdout.toLowerCase()).toContain('estimate');
    expect(stdout).toContain('5794');
  });

  test('without --enskild-firma flag, no egenavgifter output', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'income-statement', `${SYNTHETIC}/skattata-test-income-statement.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout.toLowerCase()).not.toContain('egenavgifter');
  });
});

describe('income-statement --rantefordelning', () => {
  test('positive capital base shows allocation and adjusted egenavgifter', () => {
    // skattata-test-rantefordelning.se: capital base=200000 (IB 2081=-200000, negated=200000)
    // profit=300000, allocation = 200000 * 0.0796 = 15920
    const result = Bun.spawnSync(['bun', 'run', CLI, 'income-statement', '--enskild-firma', '--rantefordelning', `${SYNTHETIC}/skattata-test-rantefordelning.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout).toContain('200000');  // capital base
    expect(stdout).toContain('15920');   // allocation amount
    expect(stdout.toLowerCase()).toContain('capital income');
    expect(stdout.toLowerCase()).toContain('saving');
  });

  test('without --enskild-firma, rantefordelning produces warning', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'income-statement', '--rantefordelning', `${SYNTHETIC}/skattata-test-rantefordelning.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stderr = result.stderr.toString();
    expect(stderr.toLowerCase()).toContain('requires');
  });

  test('negative capital base shows mandatory allocation', () => {
    // skattata-test-rantefordelning-neg.se: IB 2081=50000 (positive = negative equity)
    // capital base = -(-50000) negated... wait: IB is 50000 (positive debit on equity = negative equity)
    // capitalBase = -50000 (negated from positive 50000), so negative
    // addition = 50000 * 0.0296 = 1480
    const result = Bun.spawnSync(['bun', 'run', CLI, 'income-statement', '--enskild-firma', '--rantefordelning', `${SYNTHETIC}/skattata-test-rantefordelning-neg.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout.toLowerCase()).toContain('mandatory');
    expect(stdout).toContain('1480');  // addition amount
  });

  test('zero capital base shows no allocation', () => {
    // skattata-test-income-statement.se has no IB on 2xxx accounts → capital base = 0
    const result = Bun.spawnSync(['bun', 'run', CLI, 'income-statement', '--enskild-firma', '--rantefordelning', `${SYNTHETIC}/skattata-test-income-statement.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout.toLowerCase()).toContain('zero');
  });
});

describe('sru-report --form ne default K1 mapping', () => {
  test('NE with no #SRU tags: default K1 mapping applied', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'json', `${SYNTHETIC}/skattata-test-ne-no-sru.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    const data = JSON.parse(stdout);
    const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;

    // Balance sheet (equity/liabilities are raw SIE credit balances -- negative)
    expect(entries.find(e => e.sruCode === '7280')?.totalAmount).toBeCloseTo(80000, 1);   // B9: asset
    expect(entries.find(e => e.sruCode === '7300')?.totalAmount).toBeCloseTo(-30000, 1);  // B10: equity (credit)
    expect(entries.find(e => e.sruCode === '7382')?.totalAmount).toBeCloseTo(-10000, 1);  // B15: AP (credit)

    // Income statement
    expect(entries.find(e => e.sruCode === '7400')?.totalAmount).toBeCloseTo(200000, 1); // R1 (revenue negated)
    expect(entries.find(e => e.sruCode === '7500')?.totalAmount).toBeCloseTo(50000, 1);  // R5
    expect(entries.find(e => e.sruCode === '7501')?.totalAmount).toBeCloseTo(50000, 1);  // R6 (30000+5000+15000)
    expect(entries.find(e => e.sruCode === '7403')?.totalAmount).toBeCloseTo(1000, 1);   // R4 (interest, revenue negated)
  });

  test('NE with no #SRU tags: 7714 still computed', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'sru', `${SYNTHETIC}/skattata-test-ne-no-sru.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    // netIncome = 200000 + 1000 - 50000 - 30000 - 5000 - 15000 = 101000
    // schablonavdrag = Math.trunc(101000 * 0.25) = 25250
    expect(stdout).toContain('#UPPGIFT 7714 25250');
  });

  test('NE with existing #SRU tags: defaults do not override', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'json', `${SYNTHETIC}/skattata-test-sru-report.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    const data = JSON.parse(stdout);
    const entries = data.entries as Array<{ sruCode: string; totalAmount: number }>;
    expect(entries.find(e => e.sruCode === '7281')?.totalAmount).toBeCloseTo(50000, 1);
    expect(entries.find(e => e.sruCode === '7410')?.totalAmount).toBeCloseTo(40000, 1);
  });
});

describe('sru-report --form ne egenavgifter', () => {
  test('NE SRU output includes egenavgifter schablonavdrag (R43/7714)', () => {
    // skattata-test-sru-report.se: revenue 40000 (3010+3011), no costs → netIncome=40000
    // Schablonavdrag = Math.trunc(40000 * 0.25) = 10000
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'sru', `${SYNTHETIC}/skattata-test-sru-report.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout).toContain('#UPPGIFT 7714 10000');
  });

  test('NE SRU output omits egenavgifter when netIncome <= 0', () => {
    // skattata-test-sru-no-income.se has SRU tags (balance sheet only), netIncome=0
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'sru', `${SYNTHETIC}/skattata-test-sru-no-income.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout).toContain('#BLANKETT NE');
    expect(stdout).not.toContain('#UPPGIFT 7714');
  });

  test('non-NE form does not include egenavgifter codes', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ink2r', '--format', 'sru', `${SYNTHETIC}/skattata-test-sru-report.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout).not.toContain('#UPPGIFT 7714');
  });
});
