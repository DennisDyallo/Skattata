import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolve } from 'node:path';
import { mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = resolve(import.meta.dir, '../../src/index.ts');
const SYNTHETIC = resolve(import.meta.dir, '../../../../sie_test_files/synthetic');

// The synthetic file has fiscal year 2023, so all dates must be within 2023-01-01..2023-12-31
const REVERSAL_DATE = '2023-06-15';

let tmpDir: string;
let testFile: string;

function run(...args: string[]) {
  return Bun.spawnSync(['bun', 'run', CLI, ...args], {
    cwd: resolve(import.meta.dir, '../../../..'),
    env: { ...process.env },
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'skattata-reverse-'));
  testFile = resolve(tmpDir, 'test.se');
  // Copy a synthetic file with known accounts (1930, 2081) and fiscal year 2023
  cpSync(resolve(SYNTHETIC, 'skattata-test-balanced-annual.se'), testFile);
  // Add a known voucher so we have something to reverse (synthetic files have 0 vouchers)
  const addResult = run(
    'voucher', 'add', testFile,
    '--date', '2023-06-01',
    '--text', 'Test sale',
    '--debit', '1930', '1000',
    '--credit', '2081', '1000',
    '--yes',
  );
  if (addResult.exitCode !== 0) {
    throw new Error(`Setup failed: voucher add exited ${addResult.exitCode}: ${addResult.stderr.toString()}`);
  }
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('voucher reverse', () => {
  test('happy path: reverse creates a counter-entry voucher', () => {
    const result = run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--date', REVERSAL_DATE, '--yes');
    const stdout = result.stdout.toString();
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('Korrigering: Test sale');
    expect(stdout).toContain('Added verifikation A-2');
  });

  test('voucher not found exits nonzero', () => {
    const result = run('voucher', 'reverse', testFile, '--voucher', 'Z-999', '--date', REVERSAL_DATE, '--yes');
    expect(result.exitCode).not.toBe(0);
    const stderr = result.stderr.toString();
    expect(stderr).toContain('not found');
  });

  test('invalid voucher ID format exits nonzero', () => {
    const result = run('voucher', 'reverse', testFile, '--voucher', 'bad', '--date', REVERSAL_DATE, '--yes');
    expect(result.exitCode).not.toBe(0);
    const stderr = result.stderr.toString();
    expect(stderr).toContain('expected format S-N');
  });

  test('double-reversal blocked without --force', () => {
    // First reverse A-1 -> creates A-2 with text "Korrigering: Test sale"
    const first = run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--date', REVERSAL_DATE, '--yes');
    expect(first.exitCode).toBe(0);

    // Try to reverse the reversal A-2 -> should be blocked
    const second = run('voucher', 'reverse', testFile, '--voucher', 'A-2', '--date', REVERSAL_DATE, '--yes');
    expect(second.exitCode).not.toBe(0);
    const stderr = second.stderr.toString();
    expect(stderr).toContain('appears to be a reversal');
  });

  test('double-reversal allowed with --force', () => {
    // First reverse
    run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--date', REVERSAL_DATE, '--yes');

    // Reverse the reversal with --force
    const result = run('voucher', 'reverse', testFile, '--voucher', 'A-2', '--date', REVERSAL_DATE, '--yes', '--force');
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    expect(stdout).toContain('Added verifikation A-3');
  });

  test('custom --series puts reversal in different series', () => {
    const result = run(
      'voucher', 'reverse', testFile,
      '--voucher', 'A-1',
      '--series', 'B',
      '--date', REVERSAL_DATE,
      '--yes',
    );
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    expect(stdout).toContain('B-1');
  });

  test('--backup creates .bak file', () => {
    const result = run(
      'voucher', 'reverse', testFile,
      '--voucher', 'A-1',
      '--backup',
      '--date', REVERSAL_DATE,
      '--yes',
    );
    expect(result.exitCode).toBe(0);
    expect(existsSync(testFile + '.bak')).toBe(true);
  });

  test('reversal voucher shows original and negated amounts in preview', () => {
    const result = run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--date', REVERSAL_DATE, '--yes');
    const stdout = result.stdout.toString();
    expect(result.exitCode).toBe(0);
    // Preview should show both the original and reversal vouchers
    expect(stdout).toContain('Original voucher:');
    expect(stdout).toContain('Reversal voucher:');
  });
});
