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
