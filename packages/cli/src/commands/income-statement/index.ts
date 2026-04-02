import type { Command } from 'commander';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { IncomeStatementCalculator } from './IncomeStatementCalculator.js';

export function register(program: Command): void {
  program
    .command('income-statement <file>')
    .description('Income statement / P&L (resultaträkning) using period results from BAS accounts 3000–8999')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .option('--year <n>', 'Booking year: 0=current (default), -1=prior year, -2=two years back')
    .addHelpText('after', `
Groups accounts by BAS chart of accounts categories using result values (#RES):
  3000–3999  Revenue (Intäkter)
  4000–4999  Cost of goods sold (Kostnad sålda varor)
  5000–6999  Operating expenses (Rörelsekostnader)
  7000–7999  Depreciation and other (Avskrivningar m.m.)
  8000–8999  Financial items (Finansiella poster)

Examples:
  $ skattata income-statement annual.se
  $ skattata income-statement annual.se --year -1
  $ skattata income-statement annual.se --format csv > pl.csv
`)
    .action(async (file: string, options: { format: OutputFormat; year?: string }) => {
      try {
        const doc = await parseFile(file);
        const calc = new IncomeStatementCalculator();
        const result = calc.calculate(doc);

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

        console.log(`\nGross Profit: ${result.grossProfit.toFixed(2)}`);
        console.log(`Net Income: ${result.netIncome.toFixed(2)}`);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
