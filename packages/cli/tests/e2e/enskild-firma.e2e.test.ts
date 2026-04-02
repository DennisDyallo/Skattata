import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';

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

    // Balance sheet — SKV 269 expects positive amounts for all entries
    expect(entries.find(e => e.sruCode === '7280')?.totalAmount).toBeCloseTo(80000, 1);   // B9: asset
    expect(entries.find(e => e.sruCode === '7300')?.totalAmount).toBeCloseTo(30000, 1);   // B10: equity (negated from SIE credit)
    expect(entries.find(e => e.sruCode === '7382')?.totalAmount).toBeCloseTo(10000, 1);   // B15: AP (negated from SIE credit)

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

describe('sru-report --form ne --output file-write', () => {
  test('NE with no #SRU tags: --output writes .sru with #BLANKETT NE, info.sru companion, and 7714 computed', () => {
    const tmpSru = '/tmp/skattata-test-ne.sru';
    const tmpInfoSru = '/tmp/info.sru';
    // Clean up any leftover files from previous runs
    try { unlinkSync(tmpSru); } catch {}
    try { unlinkSync(tmpInfoSru); } catch {}

    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--output', tmpSru, `${SYNTHETIC}/skattata-test-ne-no-sru.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    expect(result.exitCode).toBe(0);

    // Verify .sru file written with correct content
    expect(existsSync(tmpSru)).toBe(true);
    const sruContent = readFileSync(tmpSru, 'utf-8');
    expect(sruContent).toContain('#BLANKETT NE');
    expect(sruContent).toContain('#BLANKETTSLUT');
    expect(sruContent).toContain('#FIL_SLUT');

    // Verify 7714 computed entry (egenavgifter schablonavdrag)
    // netIncome = 200000 + 1000 - 50000 - 30000 - 5000 - 15000 = 101000
    // schablonavdrag = Math.trunc(101000 * 0.25) = 25250
    expect(sruContent).toContain('#UPPGIFT 7714 25250');

    // Verify info.sru companion file created
    expect(existsSync(tmpInfoSru)).toBe(true);
    const infoContent = readFileSync(tmpInfoSru, 'utf-8');
    expect(infoContent).toContain('#DATABESKRIVNING_START');
    expect(infoContent).toContain('#MEDIELEV_START');
    expect(infoContent).toContain('#ORGNR 198505151234');

    // Clean up
    try { unlinkSync(tmpSru); } catch {}
    try { unlinkSync(tmpInfoSru); } catch {}
  });
});

describe('sru-report --form ne tax adjustment fields', () => {
  test('positive capitalBase: SRU includes R41/7713 egenavgifter and R30/7708 rantefordelning', () => {
    // skattata-test-rantefordelning.se: revenue=400000, costs=100000, netIncome=300000
    // capitalBase=200000 (IB 2081=-200000, negated)
    // egenavgifter = Math.trunc(300000 * 0.2897) = 86910
    // rantefordelningPositive = Math.trunc(200000 * 0.0796) = 15920
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'sru', `${SYNTHETIC}/skattata-test-rantefordelning.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout).toContain('#UPPGIFT 7713 86910');
    expect(stdout).toContain('#UPPGIFT 7708 15920');
    expect(stdout).toContain('#UPPGIFT 7714');  // schablonavdrag also present
  });

  test('negative capitalBase: SRU includes R31/7607 negative rantefordelning, no R30', () => {
    // skattata-test-rantefordelning-neg.se: capitalBase=-50000
    // rantefordelningNegative = Math.trunc(50000 * 0.0296) = 1480
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'sru', `${SYNTHETIC}/skattata-test-rantefordelning-neg.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout).toContain('#UPPGIFT 7607 1480');
    expect(stdout).not.toContain('#UPPGIFT 7708');
  });

  test('expansionsfond: SRU includes R36/7710 increase', () => {
    // skattata-test-expansionsfond.se: 2081 IB=-100000, UB=-300000
    // equityChange = 300000 - 100000 = 200000
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'sru', '--org-number', '198501011234', `${SYNTHETIC}/skattata-test-expansionsfond.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    expect(stdout).toContain('#UPPGIFT 7710 200000');
  });

  test('existing SRU tags are not overwritten by computed entries', () => {
    // skattata-test-sru-report.se has explicit #SRU tags — computed entries should not duplicate
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'sru', `${SYNTHETIC}/skattata-test-sru-report.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stdout = result.stdout.toString();
    // Count occurrences of #UPPGIFT 7714 — should appear exactly once
    const matches7714 = stdout.match(/#UPPGIFT 7714/g);
    expect(matches7714?.length ?? 0).toBe(1);
  });
});

describe('sru-report --form ne blocker: 3700-3969 R1 default', () => {
  test('NE default mapping warns about 3700-3969 defaulting to R1', () => {
    const result = Bun.spawnSync(['bun', 'run', CLI, 'sru-report', '--form', 'ne', '--format', 'json', `${SYNTHETIC}/skattata-test-ne-no-sru.se`], {
      cwd: resolve(import.meta.dir, '../../../..'),
    });
    const stderr = result.stderr.toString();
    expect(stderr).toContain('3700-3969');
    expect(stderr).toContain('R1');
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
