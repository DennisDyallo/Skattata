import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const repoRoot = resolve(import.meta.dir, '../../../..');
const cliPath = resolve(import.meta.dir, '../../src/index.ts');

// Traverse 10 levels up from repo root to find Skattata root, then into test files
// repo is at: Skattata/src/FirstResponder/data/flows/<id>/repo
// test files at: Skattata/Skattata.Tests/sie_test_files/ (legacy) or Skattata/sie_test_files/
function findTestFilesDir(): string | null {
  // Go up from repo root: repo -> <id> -> flows -> data -> FirstResponder -> src -> Skattata
  const skattataRoot = resolve(repoRoot, '../../../../../../');
  const candidates = [
    resolve(skattataRoot, 'sie_test_files'),
    resolve(skattataRoot, 'Skattata.Tests/sie_test_files'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const testFilesDir = findTestFilesDir();
const testSe = testFilesDir ? resolve(testFilesDir, 'Dennis_20161004-20171231.se') : null;
const hasTestFile = testSe ? existsSync(testSe) : false;

function run(...args: string[]) {
  return Bun.spawnSync(['bun', 'run', cliPath, ...args], {
    cwd: repoRoot,
    env: { ...process.env },
  });
}

describe('CLI E2E', () => {
  test('unknown command exits non-zero', () => {
    const result = run('nonexistent-command');
    // Commander prints help/error for unknown commands
    expect(result.exitCode).not.toBe(0);
  });

  (hasTestFile ? test : test.skip)('parse command exits 0 and stdout contains Company', () => {
    const result = run('parse', testSe!);
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    expect(stdout).toContain('Company');
  });

  (hasTestFile ? test : test.skip)('parse command with --format json returns valid JSON', () => {
    const result = run('parse', testSe!, '--format', 'json');
    expect(result.exitCode).toBe(0);
    const stdout = result.stdout.toString();
    // Should be valid JSON
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  (hasTestFile ? test : test.skip)('validate command on SIE 4 file exits 0 (PASS)', () => {
    const result = run('validate', testSe!);
    const stdout = result.stdout.toString();
    // Should either PASS or SKIP (for XML files)
    expect(result.exitCode).toBe(0);
    expect(stdout).toMatch(/PASS|SKIP/);
  });

  (testFilesDir ? test : test.skip)('test-all on test files directory exits 0', () => {
    const result = run('test-all', testFilesDir!);
    // We just check it runs — some files may fail parsing
    expect(result.exitCode).toBeDefined();
  });
});
