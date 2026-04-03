import type { Command } from 'commander';
import { AccountLookup, type AccountInfo } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';

export function register(program: Command): void {
  program
    .command('accounts <file>')
    .description('List and search accounts in a SIE file')
    .option('--search <term>', 'Case-insensitive substring search on id or name')
    .option('--type <type>', 'Filter by account type: T/S/I/K')
    .option('--range <range>', 'Filter by account range, e.g. 2610-2650')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .addHelpText('after', `
Examples:
  $ skattata accounts annual.se
  $ skattata accounts annual.se --search bank
  $ skattata accounts annual.se --type K
  $ skattata accounts annual.se --range 2610-2650
`)
    .action(async (file: string, options: { search?: string; type?: string; range?: string; format: OutputFormat }) => {
      try {
        const doc = await parseFile(file);
        const lookup = new AccountLookup();

        let accounts: AccountInfo[];

        if (options.range) {
          const match = options.range.match(/^(\d+)-(\d+)$/);
          if (!match) {
            console.error('Error: --range must be in format FROM-TO (e.g. 2610-2650)');
            process.exit(1);
          }
          const from = parseInt(match[1], 10);
          const to = parseInt(match[2], 10);
          accounts = lookup.byRange(doc, from, to);
        } else {
          accounts = lookup.all(doc);
        }

        if (options.search) {
          const lower = options.search.toLowerCase();
          accounts = accounts.filter(
            a => a.id.toLowerCase().includes(lower) || a.name.toLowerCase().includes(lower)
          );
        }

        if (options.type) {
          const t = options.type.toUpperCase();
          accounts = accounts.filter(a => a.type === t);
        }

        const headers = ['Account', 'Name', 'Type'];
        const rows = accounts.map(a => [a.id, a.name, a.type]);
        console.log(formatRows(headers, rows, options.format));
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
