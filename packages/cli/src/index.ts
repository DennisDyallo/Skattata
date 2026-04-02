#!/usr/bin/env bun
import { Command } from 'commander';
import { register as registerParse }           from './commands/parse/index.js';
import { register as registerValidate }        from './commands/validate/index.js';
import { register as registerBalanceSheet }    from './commands/balance-sheet/index.js';
import { register as registerIncomeStatement } from './commands/income-statement/index.js';
import { register as registerMoms }            from './commands/moms/index.js';
import { register as registerSruReport }       from './commands/sru-report/index.js';
import { register as registerFSkatt }          from './commands/f-skatt/index.js';
import { register as registerTestAll }         from './commands/test-all/index.js';

const program = new Command();

program
  .name('skattata')
  .description(
    'Parse, validate, and report on Swedish SIE accounting files.\n' +
    'Supports SIE 1–4 (tag-based, IBM Codepage 437) and SIE 5 (XML).\n' +
    'Data follows the Swedish BAS chart of accounts and Skatteverket standards.'
  )
  .version('1.0.0')
  .addHelpText('after', `
Commands at a glance:
  parse            Show what's in a SIE file (company, accounts, vouchers)
  validate         Confirm the parser and writer are lossless for a file
  balance-sheet    Assets / equity / liabilities from closing balances
  income-statement Revenue and costs from period result values
  moms             VAT return fields (SKV 4700) from VAT accounts
  sru-report       Tax declaration lines (INK2R/NE) from #SRU account codes
  f-skatt          Preliminary tax estimate for enskild firma
  test-all         Batch parse every SIE file in a directory

File formats accepted:  .se (SIE 1–4)  .si (SIE 4i import)  .sie (SIE 5 XML)

Example:
  $ skattata parse ./sie_test_files/sie4-demo-company.se
  $ skattata sru-report annual.se --output ink2r.sru
`);

registerParse(program);
registerValidate(program);
registerBalanceSheet(program);
registerIncomeStatement(program);
registerMoms(program);
registerSruReport(program);
registerFSkatt(program);
registerTestAll(program);

await program.parseAsync(process.argv);
