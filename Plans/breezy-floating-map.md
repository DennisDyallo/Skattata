# Plan: Vertical feature slicing for CLI + sie-core internals rename

## Context

The CLI's `statements/` directory mixes calculators and writers under a single taxonomic label
that doesn't match the mental model of a developer looking for "how does sru-report work?".
`BalanceSheetCalculator.ts` and `SruFileWriter.ts` are peers in the directory, but they belong
to completely different commands. A new developer can't navigate to a feature without scanning
all files.

`index.ts` is also monolithic (~500 lines) — all 7 command action handlers inline. This makes
it hard to reason about any one command in isolation.

`sie-core`'s taxonomy is sound for a publishable library, but `utils/` is vague — it contains
both a CP437 codec and a SIE line tokeniser, which are unrelated. Renaming to `internal/`
signals they are private infrastructure, not part of the public contract.

---

## Critical files

| File | Change |
|---|---|
| `packages/cli/src/index.ts` | Slim to wiring: imports + `register()` calls only |
| `packages/cli/src/statements/*.ts` | Moved into `commands/<feature>/` dirs |
| `packages/cli/src/formatters/index.ts` | Move to `src/shared/formatters/index.ts` |
| `packages/cli/src/commands/*/index.ts` | New: one per feature, exports `register(program)` |
| `packages/sie-core/src/utils/` | Rename directory to `internal/` |
| `packages/sie-core/src/index.ts` | Update import paths after rename |
| `packages/sie-core/src/parser/SieTagParser.ts` | Update import of `internal/` utils |
| `packages/sie-core/src/writer/SieDocumentWriter.ts` | Update import of `internal/` utils |
| `CLAUDE.md` | Update paths in Project Structure section |

---

## CLI target structure

```
packages/cli/src/
├── index.ts                          # ~40 lines: program setup + register() calls
├── shared/
│   ├── parseFile.ts                  # extracted from index.ts (currently inline)
│   └── formatters/
│       └── index.ts                  # moved from src/formatters/index.ts
└── commands/
    ├── parse/
    │   └── index.ts                  # register(program) for `parse` command
    ├── validate/
    │   └── index.ts                  # register(program) for `validate` command
    ├── balance-sheet/
    │   ├── BalanceSheetCalculator.ts # moved from statements/
    │   └── index.ts                  # register(program) for `balance-sheet`
    ├── income-statement/
    │   ├── IncomeStatementCalculator.ts
    │   └── index.ts
    ├── moms/
    │   ├── MomsCalculator.ts
    │   └── index.ts
    ├── sru-report/
    │   ├── SruReportCalculator.ts
    │   ├── SruFileWriter.ts
    │   ├── InfoSruWriter.ts
    │   └── index.ts
    └── test-all/
        └── index.ts
```

### Pattern for each command's `index.ts`

```typescript
// commands/balance-sheet/index.ts
import type { Command } from 'commander';
import { BalanceSheetCalculator } from './BalanceSheetCalculator.js';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows } from '../../shared/formatters/index.js';
import type { OutputFormat } from '../../shared/formatters/index.js';

export function register(program: Command): void {
  program
    .command('balance-sheet <file>')
    .description('...')
    .option(...)
    .action(async (file, options) => { ... });
}
```

### Slim `index.ts`

```typescript
#!/usr/bin/env bun
import { Command } from 'commander';
import { register as registerParse }          from './commands/parse/index.js';
import { register as registerValidate }       from './commands/validate/index.js';
import { register as registerBalanceSheet }   from './commands/balance-sheet/index.js';
import { register as registerIncomeStatement} from './commands/income-statement/index.js';
import { register as registerMoms }           from './commands/moms/index.js';
import { register as registerSruReport }      from './commands/sru-report/index.js';
import { register as registerTestAll }        from './commands/test-all/index.js';

const program = new Command();
program.name('skattata').description('...').version('0.1.0').addHelpText(...);

registerParse(program);
registerValidate(program);
registerBalanceSheet(program);
registerIncomeStatement(program);
registerMoms(program);
registerSruReport(program);
registerTestAll(program);

program.parse();
```

### Cross-feature coupling: balance-sheet → income-statement

`BalanceSheetCalculator` imports `IncomeStatementCalculator`. After the move:
```typescript
// commands/balance-sheet/BalanceSheetCalculator.ts
import { IncomeStatementCalculator } from '../income-statement/IncomeStatementCalculator.js';
```
This cross-command import is acceptable and already documented in CLAUDE.md.

---

## sie-core: rename `utils/` → `internal/`

```
packages/sie-core/src/
├── models/           (unchanged)
├── parser/           (unchanged)
├── writer/           (unchanged)
├── comparer/         (unchanged)
├── internal/         # renamed from utils/
│   ├── encoding.ts   # unchanged
│   └── lineParser.ts # unchanged
└── index.ts          # update 2 import paths
```

**Reasoning:** `utils/` is a generic drawer. `internal/` clearly signals that `encoding.ts` and
`lineParser.ts` are private implementation details — not part of the public API contract, even
though the barrel (`index.ts`) re-exports some functions from them. Consumers using the barrel
are unaffected.

**Files to update for the rename:**
1. `src/index.ts` — 2 import lines (`./utils/encoding.js` → `./internal/encoding.js`, etc.)
2. `src/parser/SieTagParser.ts` — 2 imports from `../utils/`
3. `src/writer/SieDocumentWriter.ts` — 1 import from `../utils/`

Tests import via `@skattata/sie-core` barrel — unaffected by internal restructure.

---

## Execution — parallelised

The only hard dependency is: `balance-sheet` must wait for `income-statement` to land (cross-import).
Everything else is independent.

```
Phase A (parallel — no dependencies):
  ├── Agent 1: sie-core utils/ → internal/ rename (4 import path updates)
  └── Agent 2: CLI shared/ extraction (parseFile.ts + move formatters/)

Phase B (parallel — after Phase A):
  ├── Agent 3: commands/income-statement/  (standalone calculator)
  ├── Agent 4: commands/moms/              (standalone calculator)
  ├── Agent 5: commands/sru-report/        (3 files: calculator + 2 writers)
  └── Agent 6: commands/parse/ + commands/validate/ + commands/test-all/
               (no calculators — pure action handlers, batch in one agent)

Phase C (after income-statement lands):
  └── Agent 7: commands/balance-sheet/ (imports ../income-statement/)

Phase D (after all features extracted):
  └── Slim index.ts + update CLAUDE.md (single pass)
```

**Verification after each phase:**
```bash
# Phase A: sie-core
bun test packages/sie-core          # 0 fail

# Phase B/C: each command agent runs after its files are written
bun test packages/cli               # 0 fail (E2E catches regressions)
skattata --help                     # all 7 commands listed

# Phase D: final gate
bun test                            # 156 pass, 0 fail
skattata test-all ./sie_test_files  # 127/127
```

**Estimated wall-clock reduction:** ~60% vs sequential — Phase B is the bulk of the work
and all 4 agents run simultaneously. The `balance-sheet` agent in Phase C is the only
serialised step (waits for income-statement path to be committed).

---

## Verification

```bash
# After sie-core rename
bun test packages/sie-core          # 0 fail

# After each CLI command extracted
bun test packages/cli               # 0 fail
skattata --help                     # all 7 commands listed

# Final gate
bun test                            # 156 pass, 0 fail
skattata test-all ./sie_test_files  # 127/127
```

E2E tests (cli.test.ts, financial-statements.e2e.test.ts) spawn the CLI binary — they need
zero changes and serve as the primary regression guard throughout the refactor.

---

## What does NOT change

- All public interfaces and type exports in sie-core (barrel stays identical)
- SIE file parsing behavior — no logic touched
- Test files — E2E tests are binary-level, immune to internal restructure
- The `register(program)` contract is internal to the CLI package
