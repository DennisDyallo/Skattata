import type { Command } from 'commander';
import { BalanceRecalculator } from '@skattata/sie-core';
import { parseFile } from '../../shared/parseFile.js';
import { writeSieFile } from '../../shared/writeFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';

export function register(program: Command): void {
  program
    .command('recalculate <file>')
    .description('Recalculate account balances from voucher transactions and update the SIE file')
    .option('--output <file>', 'Write to a different file instead of overwriting')
    .option('--backup', 'Create a .bak backup before overwriting')
    .option('-y, --yes', 'Skip confirmation prompt')
    .addHelpText('after', `
Recomputes closing balances (#UB) and results (#RES) from voucher rows (#TRANS).
Useful after manual edits or imports that left balances out of sync.

Examples:
  $ skattata recalculate annual.se
  $ skattata recalculate annual.se --backup
  $ skattata recalculate annual.se --output fixed.se -y
`)
    .action(async (file: string, options: { output?: string; backup?: boolean; yes?: boolean }) => {
      try {
        const doc = await parseFile(file);
        const recalculator = new BalanceRecalculator();
        const result = recalculator.recalculate(doc);

        if (result.updatedAccounts.length === 0) {
          console.log('No changes \u2014 balances are already up to date.');
          return;
        }

        const headers = ['Account', 'Name', 'Previous', 'New', 'Diff'];
        const rows = result.updatedAccounts.map(a => {
          const acc = doc.accounts.get(a.accountId);
          const name = acc?.name ?? '';
          const diff = a.newClosing - a.previousClosing;
          return [
            a.accountId,
            name,
            a.previousClosing.toFixed(2),
            a.newClosing.toFixed(2),
            diff.toFixed(2),
          ];
        });
        console.log(formatRows(headers, rows, 'table'));

        const destPath = options.output ?? file;

        if (!options.yes) {
          process.stdout.write(`Write updated balances to ${destPath}? [Y/n] `);
          const answer = await new Promise<string>(resolve => {
            process.stdin.once('data', d => resolve(d.toString().trim()));
          });
          if (answer.toLowerCase() === 'n') {
            console.log('Aborted.');
            return;
          }
        }

        await writeSieFile(doc, file, {
          outputPath: options.output,
          backup: options.backup,
        });

        console.log(`\u2713 Balances updated: ${result.updatedAccounts.length} accounts changed.`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
