import type { Command } from 'commander';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { BalanceSheetCalculator } from './BalanceSheetCalculator.js';

export function register(program: Command): void {
  program
    .command('balance-sheet <file>')
    .description('Balance sheet (balansräkning) using closing balances from BAS accounts 1000–2999')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .option('--year <n>', 'Booking year: 0=current (default), -1=prior year, -2=two years back')
    .option('--period <YYYYMM>', 'Filter to a single period using #PSALDO data (e.g. 202301)')
    .addHelpText('after', `
Groups accounts by BAS chart of accounts categories using closing balances (#UB):
  1000–1999  Assets (Tillgångar)
  2000–2099  Equity (Eget kapital)
  2100–2999  Liabilities (Skulder)

Examples:
  $ skattata balance-sheet annual.se
  $ skattata balance-sheet annual.se --year -1
  $ skattata balance-sheet annual.se --format json
  $ skattata balance-sheet annual.se --format csv > balance.csv
`)
    .action(async (file: string, options: { format: OutputFormat; year?: string; period?: string }) => {
      try {
        const doc = await parseFile(file);
        const calc = new BalanceSheetCalculator();
        const yearId = parseInt(options.year ?? '0', 10);

        if (options.period && !/^\d{6}$/.test(options.period)) {
          console.error('Error: --period must be exactly 6 digits (YYYYMM format, e.g. 202301)');
          process.exit(1);
        }

        if (options.period) {
          let hasPsaldo = false;
          for (const acc of doc.accounts.values()) {
            if (acc.periodValues.length > 0) { hasPsaldo = true; break; }
          }
          if (!hasPsaldo) {
            console.warn('Warning: This SIE file contains no #PSALDO data. Period filtering will show zero values.');
          }
        }

        const result = calc.calculate(doc, yearId, options.period);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        for (const section of result.sections) {
          console.log(`\n${section.title}`);
          const headers = ['Account', 'Name', 'Balance'];
          const rows = section.accounts.map(a => [a.id, a.name, a.balance.toFixed(2)]);
          rows.push(['', 'TOTAL', section.total.toFixed(2)]);
          console.log(formatRows(headers, rows, options.format));
        }

        console.log(`\nTotal Assets: ${result.totalAssets.toFixed(2)}`);
        console.log(`Total Equity & Liabilities: ${result.totalEquityAndLiabilities.toFixed(2)}`);

        // Show Årets resultat and balance check
        if (result.netIncome !== 0) {
          console.log(`\nÅrets resultat (from P&L): ${result.netIncome.toFixed(2)}`);
        }
        const isBalanced = Math.abs(result.balanceDiff) < 0.01;
        if (isBalanced) {
          console.log('BALANCE CHECK: ✓ BALANCED');
        } else {
          console.log(`BALANCE CHECK: ⚠ Difference: ${result.balanceDiff.toFixed(2)} SEK (may be unclosed P&L result)`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
