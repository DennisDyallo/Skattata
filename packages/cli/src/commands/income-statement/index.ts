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
    .option('--rantefordelning', 'Show rantefordelning (interest allocation) — requires --enskild-firma')
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
    .action(async (file: string, options: { format: OutputFormat; year?: string; enskildFirma?: boolean; rantefordelning?: boolean }) => {
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

        if (options.rantefordelning && !options.enskildFirma) {
          console.warn('Warning: --rantefordelning requires --enskild-firma. Ignoring.');
        }

        if (options.enskildFirma) {
          const egenavgifter = Math.trunc(result.netIncome * 0.2897);
          const taxBase = Math.trunc(result.netIncome * 0.75);
          console.log('\n--- Enskild firma estimates (Estimates only. Actual amounts depend on Skatteverket\'s iterative calculation.) ---');
          console.log(`Egenavgifter ~28.97% (2025 rate, estimate): ${egenavgifter.toFixed(0)} SEK`);
          console.log(`Taxable income approx. (after 25% schablonavdrag): ${taxBase.toFixed(0)} SEK`);

          if (options.rantefordelning) {
            // Räntefördelning: reclassify part of profit as capital income (taxed at 30% flat)
            // Rate 2025: statslåneräntan (1.96%) + 6% = 7.96% (positive), + 1% = 2.96% (negative)
            // Source: Skatteverket — statslåneräntan per 30 Nov prior year
            const POSITIVE_RATE = 0.0796;
            const NEGATIVE_RATE = 0.0296;

            // Capital base = sum of 2xxx opening balances, negated (credit → positive equity)
            let capitalBase = 0;
            for (const [id, acc] of doc.accounts) {
              const num = parseInt(id, 10);
              if (num >= 2000 && num <= 2999) {
                const yr = acc.yearBalances.get(yearId);
                const opening = yr ? yr.opening : acc.openingBalance;
                capitalBase += -opening; // negate: credit balance → positive equity
              }
            }

            console.log('\n--- Rantefordelning (interest allocation, 2025 rates) ---');
            console.log(`Capital base (2xxx opening balances): ${Math.trunc(capitalBase)} SEK`);

            if (capitalBase > 0) {
              const allocation = Math.trunc(capitalBase * POSITIVE_RATE);
              const adjustedBase = result.netIncome - allocation;
              const adjustedEgenavgifter = Math.trunc(Math.max(0, adjustedBase) * 0.2897);
              const saving = egenavgifter - adjustedEgenavgifter;
              console.log(`Allocation rate (positive): ${(POSITIVE_RATE * 100).toFixed(2)}%`);
              console.log(`Amount reclassified to capital income: ${allocation} SEK`);
              console.log(`Adjusted egenavgifter base: ${Math.trunc(adjustedBase)} SEK`);
              console.log(`Adjusted egenavgifter ~28.97%: ${adjustedEgenavgifter} SEK`);
              console.log(`Estimated egenavgifter saving: ${saving} SEK`);
            } else if (capitalBase < 0) {
              const addition = Math.trunc(Math.abs(capitalBase) * NEGATIVE_RATE);
              const adjustedBase = result.netIncome + addition;
              const adjustedEgenavgifter = Math.trunc(Math.max(0, adjustedBase) * 0.2897);
              console.log(`Negative capital base — mandatory allocation at ${(NEGATIVE_RATE * 100).toFixed(2)}%`);
              console.log(`Amount added to active income: ${addition} SEK`);
              console.log(`Adjusted egenavgifter base: ${Math.trunc(adjustedBase)} SEK`);
              console.log(`Adjusted egenavgifter ~28.97%: ${adjustedEgenavgifter} SEK`);
            } else {
              console.log('Capital base is zero — no rantefordelning applicable.');
            }
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
