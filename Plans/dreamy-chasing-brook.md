# Plan: Variadic Flag Validation for `voucher add`

## Context

The `voucher add` command uses `--debit <account> <amount>` and `--credit <account> <amount>` flags.
Commander.js 12.1.0 variadic options (`<entries...>`) collect all positional tokens into a flat array.
Repeated `--debit` invocations accumulate into the same array, so:

```
--debit 1930 10000 --debit 2640 5000
```

produces `["1930", "10000", "2640", "5000"]` — pairs recovered by chunking by 2.

The failure mode: odd token count (e.g., `--debit 1930 10000 5000`) silently produces a pair with `amt:undefined`.
This plan specifies the validation that catches both failure modes before any data is processed.

---

## Decision: Variadic + Post-Parse Validation (not colon syntax)

**Rejected:** `--debit 1930:10000` (colon syntax with collect). Reason: less natural UX, deviates from the
planned API design in `drifting-crafting-bentley.md`.

**Chosen:** `--debit 1930 10000` variadic with post-parse `parseVoucherEntries()` validation.

---

## Commander.js Option Declaration

```typescript
program
  .command('add <file>')
  .option('--debit <entries...>', 'Debit entry: <account> <amount>. Repeatable.')
  .option('--credit <entries...>', 'Credit entry: <account> <amount>. Repeatable.')
  // ...
```

Commander collects all tokens after `--debit` (until the next flag) into `options.debit: string[]`.
Repeated use of `--debit` appends to the same array.

---

## Validation Helper: `parseVoucherEntries`

**Location:** Inline at the top of `packages/cli/src/commands/voucher/add.ts` (one-time use, per CLAUDE.md).

**Signature:**
```typescript
function parseVoucherEntries(
  flag: string,
  values: string[],
  errorFn: (msg: string) => never
): { accountId: string; amount: number }[]
```

`errorFn` is `(msg) => program.error(msg)` at the call site — passed as a parameter so the helper is
pure and unit-testable without a live Commander instance.

**Implementation:**
```typescript
function parseVoucherEntries(
  flag: string,
  values: string[],
  errorFn: (msg: string) => never
): { accountId: string; amount: number }[] {
  if (values.length % 2 !== 0) {
    errorFn(
      `option '--${flag}' requires pairs of <account> <amount> — got ${values.length} value(s). ` +
      `Example: --${flag} 1930 10000`
    );
  }
  const result: { accountId: string; amount: number }[] = [];
  for (let i = 0; i < values.length; i += 2) {
    const accountId = values[i];
    const amount = parseFloat(values[i + 1]);
    if (isNaN(amount)) {
      errorFn(
        `option '--${flag}': invalid amount '${values[i + 1]}' for account ${accountId} — ` +
        `must be a number. Example: --${flag} ${accountId} 10000`
      );
    }
    result.push({ accountId, amount });
  }
  return result;
}
```

### Error Cases Covered

| Input | Error message |
|---|---|
| `--debit 1930 10000 5000` (odd count) | `option '--debit' requires pairs of <account> <amount> — got 3 value(s). Example: --debit 1930 10000` |
| `--debit bank 10000` (non-numeric amount) | `option '--debit': invalid amount 'bank' for account 10000 — must be a number. Example: --debit bank 10000` |
| `--debit 1930` (single token) | `option '--debit' requires pairs of <account> <amount> — got 1 value(s). Example: --debit 1930 10000` |

### Call Site (in `add.ts` action handler)

```typescript
.action(async (file, options) => {
  const debits = parseVoucherEntries('debit', options.debit ?? [], (msg) => program.error(msg));
  const credits = parseVoucherEntries('credit', options.credit ?? [], (msg) => program.error(msg));
  // ... rest of command
});
```

`?? []` guards the case where the user doesn't pass `--debit` at all (Commander gives `undefined` for an
unprovided variadic option). VoucherValidator will then catch the "at least 2 rows required" constraint.

---

## Unit Testing `parseVoucherEntries`

Since `errorFn` is injectable, unit tests don't need a Commander instance:

```typescript
// voucherValidator.test.ts or a new voucher-add.test.ts
const throwErr = (msg: string): never => { throw new Error(msg); };

test('valid pairs', () => {
  const result = parseVoucherEntries('debit', ['1930', '10000', '2640', '5000'], throwErr);
  expect(result).toEqual([{ accountId: '1930', amount: 10000 }, { accountId: '2640', amount: 5000 }]);
});

test('odd count throws', () => {
  expect(() => parseVoucherEntries('debit', ['1930', '10000', '5000'], throwErr)).toThrow('got 3 value');
});

test('non-numeric amount throws', () => {
  expect(() => parseVoucherEntries('debit', ['bank', '10000'], throwErr)).toThrow("invalid amount '10000'");
});

test('empty values returns empty array', () => {
  expect(parseVoucherEntries('debit', [], throwErr)).toEqual([]);
});
```

---

## Changes to `Plans/drifting-crafting-bentley.md`

Two targeted edits required:

### 1. Blockers section — remove colon syntax mention

**Old:**
```
- **Commander.js variadic flags** — The `--debit <acct> <amount>` syntax needs a custom argument parser. May need `--debit 1930:10000` colon syntax as fallback. To be resolved during implementation.
```

**New:**
```
- **Commander.js variadic flags** — Resolved. Use `<entries...>` variadic; post-parse chunking by 2 with `parseVoucherEntries()` validates odd count and non-numeric amounts. See `Plans/dreamy-chasing-brook.md`.
```

### 2. Flag table for `voucher add` — already correct

The existing flag table shows `--debit <acct> <amount>` — no change needed. The description column
should note "Repeatable — each `--debit` appends to the same list".

---

## Files to Create/Modify During Implementation

| File | Action | Notes |
|---|---|---|
| `packages/cli/src/commands/voucher/add.ts` | CREATE | Inline `parseVoucherEntries` at top of file |
| `Plans/drifting-crafting-bentley.md` | MODIFY | Update blocker note (see above) |

---

## Verification

1. Unit test `parseVoucherEntries` with the 4 cases above — all pass
2. `bun run packages/cli/src/index.ts voucher add annual.se --debit 1930 10000 --credit 3010 10000` — works
3. `bun run packages/cli/src/index.ts voucher add annual.se --debit 1930 10000 5000` — exits 1 with clear error
4. `bun run packages/cli/src/index.ts voucher add annual.se --debit bank 10000` — exits 1 with clear error
5. `bun test packages/cli` — all tests pass
