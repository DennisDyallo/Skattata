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
    .option('--enskild-firma', 'Show egenavgifter estimate for sole proprietors (enskild firma)')
    .addHelpText('after', `
Groups accounts by BAS chart of accounts categories using result values (#RES):
  3000–3999  Revenue (Intäkter)
  4000–4999  Cost of goods sold (Kostnad sålda varor)
  5000–6999, 7500–7699  Operating expenses (Övriga externa kostnader)
  7000–7399  Personnel costs (Personalkostnader)
  7400–7499, 7700–7899  Depreciation (Avskrivningar)
  8000–8999  Financial items (Finansiella poster)

Examples:
  $ skattata income-statement annual.se
  $ skattata income-statement annual.se --year -1
  $ skattata income-statement annual.se --format csv > pl.csv
`)
    .action(async (file: string, options: { format: OutputFormat; year?: string; enskildFirma?: boolean }) => {
      try {
        const doc = await parseFile(file);
        const calc = new IncomeStatementCalculator();
        const yearId = parseInt(options.year ?? '0', 10);
        const result = calc.calculate(doc, yearId);

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

        if (options.enskildFirma) {
          const egenavgifter = Math.trunc(result.netIncome * 0.2897);
          const taxBase = Math.trunc(result.netIncome * 0.75);
          console.log('\n--- Enskild firma estimates (Estimates only. Actual amounts depend on Skatteverket\'s iterative calculation.) ---');
          console.log(`Egenavgifter ~28.97% (2025 rate, estimate): ${egenavgifter.toFixed(0)} SEK`);
          console.log(`Taxable income approx. (after 25% schablonavdrag): ${taxBase.toFixed(0)} SEK`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
