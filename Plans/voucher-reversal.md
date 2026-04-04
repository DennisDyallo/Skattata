# Plan: `voucher reverse` Command

**Status:** Approved for implementation
**Author:** Architect Agent
**Date:** 2026-04-04

---

## 1. Command Design

### Usage

```bash
skattata voucher reverse <file> --voucher <series-number> [options]
```

### Options

| Flag | Required | Default | Description |
|---|---|---|---|
| `--voucher <S-N>` | Yes | -- | Original voucher ID, e.g. `A-47` |
| `--date <YYYY-MM-DD>` | No | Today (`new Date()`) | Date for the reversal voucher |
| `--series <S>` | No | Same as original | Series for the reversal voucher |
| `--text <text>` | No | `Korrigering: <original text>` | Override reversal description |
| `--output <file>` | No | Overwrite source | Write to a different file |
| `--backup` | No | false | Create `.bak` before overwriting |
| `--no-recalculate` | No | false | Skip automatic balance recalculation |
| `--force` | No | false | Allow reversing an already-reversed voucher (one that starts with "Korrigering:") |
| `-y, --yes` | No | false | Skip confirmation prompt |

### Help Text

```
Examples:
  $ skattata voucher reverse annual.se --voucher A-47
  $ skattata voucher reverse annual.se --voucher A-47 --date 2024-04-01
  $ skattata voucher reverse annual.se --voucher A-47 --series B --yes
```

---

## 2. Lookup Logic

Parse `--voucher` value by splitting on `-` to extract series and number:

```typescript
function parseVoucherId(
  id: string,
  errorFn: (msg: string) => never
): { series: string; number: string } {
  const dashIdx = id.indexOf('-');
  if (dashIdx < 1) {
    errorFn(
      `Invalid voucher ID '${id}' -- expected format S-N (e.g. A-47)`
    );
  }
  return {
    series: id.substring(0, dashIdx),
    number: id.substring(dashIdx + 1),
  };
}
```

Find the voucher in `doc.vouchers`:

```typescript
const original = doc.vouchers.find(
  v => v.series === targetSeries && v.number === targetNumber
);
if (!original) {
  errorFn(`Voucher ${targetSeries}-${targetNumber} not found`);
}
```

Use `indexOf('-')` (not `split('-')`) because voucher numbers could theoretically contain dashes, though in practice they are numeric. The series is always the part before the first dash.

---

## 3. Counter-Voucher Construction

The reversal voucher is a new voucher with every row amount negated:

```typescript
const reversalSeries = options.series ?? original.series;
const reversalNumber = nextVoucherNumber(doc, reversalSeries);

const reversal = new SieVoucher();
reversal.series = reversalSeries;
reversal.number = reversalNumber;
reversal.date = reversalDate; // parsed from --date or new Date()
reversal.text = options.text ?? `Korrigering: ${original.text}`;

for (const originalRow of original.rows) {
  const row = new SieVoucherRow();
  row.accountNumber = originalRow.accountNumber;
  row.amount = -originalRow.amount;    // negate
  row.objects = [...originalRow.objects]; // preserve dimension objects
  row.rowText = originalRow.rowText;     // preserve row text
  // quantity is NOT negated (it's informational, not financial)
  // transactionDate is NOT copied (reversal gets its own date context)
  reversal.rows.push(row);
}
```

Key decisions:
- **Amount negation:** Multiply by -1. Debit becomes credit, credit becomes debit.
- **Objects (dimensions):** Copied as-is so the reversal hits the same cost centers/projects.
- **Row text:** Preserved from original so the reversal rows are traceable.
- **Quantity:** Not negated -- quantity is informational metadata, not a financial amount.
- **Row order:** Same as original.

---

## 4. Date Handling

```typescript
let reversalDate: Date;
if (options.date) {
  // Reuse the same parseDate pattern from add.ts
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
    errorFn(`Invalid date format '${options.date}' -- must be YYYY-MM-DD`);
  }
  reversalDate = new Date(options.date + 'T00:00:00');
  if (isNaN(reversalDate.getTime())) {
    errorFn(`Invalid date: '${options.date}'`);
  }
} else {
  reversalDate = new Date(); // today
}
```

The `VoucherValidator` will check if this date falls within the fiscal year. If it does not, the user gets a fatal error. This is correct -- reversals outside the fiscal year should not silently succeed.

---

## 5. Edge Cases

### 5.1 Voucher not found

```
Error: Voucher A-99 not found
```

Exit code 1. Use `voucherCmd.error()` for consistent Commander error handling.

### 5.2 Already a reversal (double-reversal guard)

Detect by checking if `original.text` starts with `"Korrigering:"`:

```typescript
if (original.text.startsWith('Korrigering:') && !options.force) {
  console.error(
    `Error: Voucher ${targetSeries}-${targetNumber} appears to be a reversal itself ` +
    `("${original.text}"). Use --force to reverse it anyway.`
  );
  process.exit(1);
}
```

This is a safety guard, not a hard constraint. `--force` overrides it. The text is the only reliable heuristic since SIE has no structured reversal metadata.

### 5.3 Unbalanced reversal

Should not happen if the original was balanced (negating preserves balance = 0). But the existing `VoucherValidator` will catch it regardless since it checks `Math.abs(balance) >= 0.005`. No special handling needed.

### 5.4 Invalid `--voucher` format

```
Error: Invalid voucher ID 'foo' -- expected format S-N (e.g. A-47)
```

### 5.5 Original voucher has zero-amount rows

The `VoucherValidator` will reject the reversal (it flags `row.amount === 0` as fatal). This is correct -- if the original had zero-amount rows, the reversal would too, and both are malformed.

### 5.6 SIE 5 (XML) files

`writeSieFile()` calls `writeSie4()` which only supports SIE 4 format. If the input is SIE 5, the write will fail. This is the same limitation as all other voucher commands -- no special handling needed for `reverse`.

---

## 6. Preview and Confirmation

Before writing, show both the original voucher and the reversal:

```typescript
console.log('Original voucher:');
console.log(renderVoucherPreview(original, doc));
console.log('');
console.log('Reversal voucher:');
console.log(renderVoucherPreview(reversal, doc));
```

Then confirm (unless `--yes`):

```typescript
if (!options.yes) {
  const dest = options.output ?? file;
  const ok = await confirm(`Write reversal to ${dest}? [Y/n] `);
  if (!ok) { console.log('Aborted.'); process.exit(0); }
}
```

---

## 7. Full Action Flow

This mirrors the pattern in `add.ts` and `sale.ts`:

1. `parseFile(file)` -- parse the SIE document
2. Parse and validate `--voucher` flag
3. Find original voucher in `doc.vouchers`
4. Check double-reversal guard
5. Construct reversal voucher (negate all rows)
6. `VoucherValidator().validate(reversal, doc)` -- validate
7. Print warnings (non-fatal), exit on fatal errors
8. Show preview (original + reversal)
9. Confirm (or `--yes`)
10. `doc.vouchers.push(reversal)`
11. `BalanceRecalculator().recalculate(doc)` (unless `--no-recalculate`)
12. `writeSieFile(doc, file, { outputPath, backup })`
13. Print success message: `"Added reversal verifikation B-5 to annual.se"`
14. `showRecalcResult(recalcResult, reversal, doc)`

---

## 8. File Structure

### New file: `packages/cli/src/commands/voucher/reverse.ts`

```typescript
import type { Command } from 'commander';
import { SieVoucher, SieVoucherRow, VoucherValidator, BalanceRecalculator } from '@skattata/sie-core';
import type { RecalculationResult } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { writeSieFile } from '../../shared/writeFile.js';
import { renderVoucherPreview } from '../../shared/voucherPreview.js';
import { nextVoucherNumber, confirm, showRecalcResult } from '../../shared/voucherHelpers.js';

export function register(voucherCmd: Command): void {
  voucherCmd
    .command('reverse <file>')
    .description('Create a reversal (counter-entry) for an existing voucher')
    .requiredOption('--voucher <S-N>', 'Voucher to reverse, e.g. A-47')
    .option('--date <YYYY-MM-DD>', 'Reversal date (default: today)')
    .option('--text <text>', 'Override reversal description')
    .option('--series <S>', 'Series for the reversal voucher (default: same as original)')
    .option('--output <file>', 'Write to a different file')
    .option('--backup', 'Create .bak before overwriting')
    .option('--no-recalculate', 'Skip automatic balance recalculation')
    .option('--force', 'Allow reversing an already-reversed voucher')
    .option('-y, --yes', 'Skip confirmation')
    .addHelpText('after', `
Examples:
  $ skattata voucher reverse annual.se --voucher A-47
  $ skattata voucher reverse annual.se --voucher A-47 --date 2024-04-01
  $ skattata voucher reverse annual.se --voucher A-47 --series B --yes
`)
    .action(async (file, options) => { /* see Section 7 */ });
}
```

### Registration: `packages/cli/src/commands/voucher/index.ts`

Add two lines:

```typescript
import { register as registerReverse } from './reverse.js';
// ... inside register():
registerReverse(voucher);
```

The updated file becomes:

```typescript
import type { Command } from 'commander';
import { register as registerAdd } from './add.js';
import { register as registerSale } from './sale.js';
import { register as registerExpense } from './expense.js';
import { register as registerTransfer } from './transfer.js';
import { register as registerOwner } from './owner.js';
import { register as registerList } from './list.js';
import { register as registerReverse } from './reverse.js';

export function register(program: Command): void {
  const voucher = program
    .command('voucher')
    .description('Add and list vouchers (transactions)');

  registerAdd(voucher);
  registerSale(voucher);
  registerExpense(voucher);
  registerTransfer(voucher);
  registerOwner(voucher);
  registerList(voucher);
  registerReverse(voucher);
}
```

---

## 9. Tests

### 9.1 New test file: `packages/cli/tests/e2e/voucher-reverse.e2e.test.ts`

Use the same pattern as `financial-statements.e2e.test.ts`: spawn CLI via `Bun.spawnSync`, assert on stdout/stderr/exitCode.

Tests need a writable SIE file. Strategy: copy a synthetic test file to a temp location before each test, operate on the copy.

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { resolve } from 'node:path';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = resolve(import.meta.dir, '../../src/index.ts');
const SYNTHETIC = resolve(import.meta.dir, '../../../../sie_test_files/synthetic');

let tmpDir: string;
let testFile: string;

beforeEach(() => {
  tmpDir = mkdtempSync(resolve(tmpdir(), 'skattata-reverse-'));
  testFile = resolve(tmpDir, 'test.se');
  // Use balanced-annual which has vouchers we can reverse
  cpSync(resolve(SYNTHETIC, 'skattata-test-balanced-annual.se'), testFile);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function run(...args: string[]) {
  return Bun.spawnSync(['bun', 'run', CLI, ...args], {
    cwd: resolve(import.meta.dir, '../../../..'),
  });
}
```

### 9.2 Test Scenarios

**Test 1: Successful reversal with --yes**

```typescript
test('reverse creates a counter-entry voucher', () => {
  // First, find a voucher that exists in the test file
  // Then reverse it
  const result = run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--yes');
  expect(result.exitCode).toBe(0);
  const stdout = result.stdout.toString();
  expect(stdout).toContain('Korrigering:');
  expect(stdout).toContain('Added reversal verifikation');
});
```

**Test 2: Voucher not found exits with error**

```typescript
test('reverse of nonexistent voucher fails', () => {
  const result = run('voucher', 'reverse', testFile, '--voucher', 'Z-999', '--yes');
  expect(result.exitCode).not.toBe(0);
  const stderr = result.stderr.toString();
  expect(stderr).toContain('not found');
});
```

**Test 3: Invalid voucher ID format**

```typescript
test('invalid voucher ID format fails', () => {
  const result = run('voucher', 'reverse', testFile, '--voucher', 'bad', '--yes');
  expect(result.exitCode).not.toBe(0);
  const stderr = result.stderr.toString();
  expect(stderr).toContain('expected format S-N');
});
```

**Test 4: Double-reversal blocked without --force**

```typescript
test('reversing a reversal is blocked without --force', () => {
  // First reversal
  run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--yes');
  // Find the reversal number (next in series)
  // Second reversal of the reversal -- should fail
  const result = run('voucher', 'reverse', testFile, '--voucher', 'A-2', '--yes');
  expect(result.exitCode).not.toBe(0);
  const stderr = result.stderr.toString();
  expect(stderr).toContain('appears to be a reversal');
});
```

**Test 5: Double-reversal allowed with --force**

```typescript
test('reversing a reversal succeeds with --force', () => {
  run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--yes');
  const result = run('voucher', 'reverse', testFile, '--voucher', 'A-2', '--yes', '--force');
  expect(result.exitCode).toBe(0);
});
```

**Test 6: Custom date**

```typescript
test('--date sets reversal date', () => {
  const result = run('voucher', 'reverse', testFile, '--voucher', 'A-1',
    '--date', '2024-06-15', '--yes');
  expect(result.exitCode).toBe(0);
  const stdout = result.stdout.toString();
  expect(stdout).toContain('2024-06-15');
});
```

**Test 7: Custom series**

```typescript
test('--series puts reversal in different series', () => {
  const result = run('voucher', 'reverse', testFile, '--voucher', 'A-1',
    '--series', 'B', '--yes');
  expect(result.exitCode).toBe(0);
  const stdout = result.stdout.toString();
  expect(stdout).toContain('B-');
});
```

**Test 8: Amounts are negated correctly (verify via parse)**

```typescript
test('reversal amounts are negated from original', () => {
  // Reverse, then parse file and check the last voucher
  run('voucher', 'reverse', testFile, '--voucher', 'A-1', '--yes');
  const parseResult = run('parse', testFile, '--format', 'json');
  const data = JSON.parse(parseResult.stdout.toString());
  const vouchers = data.vouchers;
  const last = vouchers[vouchers.length - 1];
  expect(last.text).toMatch(/^Korrigering:/);
  // Each row amount should be the negative of the corresponding original row
  const original = vouchers.find((v: any) => v.series === 'A' && v.number === '1');
  for (let i = 0; i < original.rows.length; i++) {
    expect(last.rows[i].amount).toBeCloseTo(-original.rows[i].amount, 2);
  }
});
```

**Test 9: Backup flag creates .bak file**

```typescript
test('--backup creates .bak file', () => {
  const result = run('voucher', 'reverse', testFile, '--voucher', 'A-1',
    '--backup', '--yes');
  expect(result.exitCode).toBe(0);
  expect(existsSync(testFile + '.bak')).toBe(true);
});
```

### 9.3 Test file considerations

The synthetic file `skattata-test-balanced-annual.se` must contain at least one voucher with series `A` and number `1`. Verify this before implementing tests. If it does not, either:
- Use a different synthetic file that has vouchers, OR
- Create a new synthetic file `skattata-test-voucher-reverse.se` with known vouchers

To check, run:
```bash
bun run packages/cli/src/index.ts parse sie_test_files/synthetic/skattata-test-balanced-annual.se --format json | jq '.vouchers'
```

If no synthetic file has vouchers, the test setup should first `voucher add` a known voucher, then reverse it.

---

## 10. Implementation Checklist

- [ ] Create `packages/cli/src/commands/voucher/reverse.ts` with the full action handler
- [ ] Register in `packages/cli/src/commands/voucher/index.ts` (import + call)
- [ ] Create `packages/cli/tests/e2e/voucher-reverse.e2e.test.ts`
- [ ] Verify a synthetic test file has vouchers (or create the voucher in test setup)
- [ ] Run `bun test packages/cli` -- all tests pass
- [ ] Run `bun run packages/cli/src/index.ts voucher reverse --help` -- verify help output
- [ ] Manual smoke test: reverse a voucher in a real file, inspect output

---

## 11. Non-Goals (Explicitly Out of Scope)

- **Linking reversals to originals:** SIE 4 has no structured reversal reference field. The text convention `"Korrigering: ..."` is the only link. A future enhancement could add a comment or use `registrationSign`, but that is not standard.
- **Partial reversals:** Only full voucher reversal is supported. Partial reversal (reversing some rows) would be done via `voucher add` manually.
- **Reversal chains:** No tracking of "this voucher was reversed by X". The double-reversal guard is purely heuristic (text prefix check).
- **SIE 5 (XML) write support:** Same limitation as all voucher commands.
