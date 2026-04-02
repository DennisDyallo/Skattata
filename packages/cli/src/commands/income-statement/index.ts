import type { Command } from 'commander';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { IncomeStatementCalculator } from './IncomeStatementCalculator.js';
import { getTaxRates, getDefaultTaxYear } from '../../shared/taxRates.js';

export function register(program: Command): void {
  program
    .command('income-statement <file>')
    .description('Income statement / P&L (resultaträkning) using period results from BAS accounts 3000–8999')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .option('--year <n>', 'Booking year: 0=current (default), -1=prior year, -2=two years back')
    .option('--enskild-firma', 'Show egenavgifter estimate for sole proprietors (enskild firma)')
    .option('--period <YYYYMM>', 'Filter to a single period using #PSALDO data (e.g. 202301)')
    .option('--rantefordelning', 'Show rantefordelning (interest allocation) — requires --enskild-firma')
    .option('--expansionsfond', 'Show expansion fund estimate — requires --enskild-firma')
    .option('--tax-year <YYYY>', 'Tax year for rate selection (default: current year)')
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
    .action(async (file: string, options: { format: OutputFormat; year?: string; period?: string; enskildFirma?: boolean; rantefordelning?: boolean; expansionsfond?: boolean; taxYear?: string }) => {
      try {
        const doc = await parseFile(file);
        const calc = new IncomeStatementCalculator();
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

        if (options.period) {
          console.log(`Period: ${options.period}`);
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
        if (options.expansionsfond && !options.enskildFirma) {
          console.warn('Warning: --expansionsfond requires --enskild-firma. Ignoring.');
        }

        if (options.enskildFirma) {
          const taxYear = options.taxYear ? parseInt(options.taxYear, 10) : getDefaultTaxYear();
          const rates = getTaxRates(taxYear);
          const egenavgifter = Math.trunc(result.netIncome * rates.egenavgifterRate);
          const taxBase = Math.trunc(result.netIncome * (1 - rates.schablonavdrag));
          console.log('\n--- Enskild firma estimates (Estimates only. Actual amounts depend on Skatteverket\'s iterative calculation.) ---');
          console.log(`Egenavgifter ~${(rates.egenavgifterRate * 100).toFixed(2)}% (${rates.year} rate, estimate): ${egenavgifter.toFixed(0)} SEK`);
          console.log(`Taxable income approx. (after ${(rates.schablonavdrag * 100).toFixed(0)}% schablonavdrag): ${taxBase.toFixed(0)} SEK`);

          if (options.rantefordelning) {

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

            console.log(`\n--- Rantefordelning (interest allocation, ${rates.year} rates) ---`);
            console.log(`Capital base (2xxx opening balances): ${Math.trunc(capitalBase)} SEK`);

            if (capitalBase > 0) {
              const allocation = Math.trunc(capitalBase * rates.rantefordelningPositive);
              const adjustedBase = result.netIncome - allocation;
              const adjustedEgenavgifter = Math.trunc(Math.max(0, adjustedBase) * rates.egenavgifterRate);
              const saving = egenavgifter - adjustedEgenavgifter;
              console.log(`Allocation rate (positive): ${(rates.rantefordelningPositive * 100).toFixed(2)}%`);
              console.log(`Amount reclassified to capital income: ${allocation} SEK`);
              console.log(`Adjusted egenavgifter base: ${Math.trunc(adjustedBase)} SEK`);
              console.log(`Adjusted egenavgifter ~${(rates.egenavgifterRate * 100).toFixed(2)}%: ${adjustedEgenavgifter} SEK`);
              console.log(`Estimated egenavgifter saving: ${saving} SEK`);
            } else if (capitalBase < 0) {
              const addition = Math.trunc(Math.abs(capitalBase) * rates.rantefordelningNegative);
              const adjustedBase = result.netIncome + addition;
              const adjustedEgenavgifter = Math.trunc(Math.max(0, adjustedBase) * rates.egenavgifterRate);
              console.log(`Negative capital base — mandatory allocation at ${(rates.rantefordelningNegative * 100).toFixed(2)}%`);
              console.log(`Amount added to active income: ${addition} SEK`);
              console.log(`Adjusted egenavgifter base: ${Math.trunc(adjustedBase)} SEK`);
              console.log(`Adjusted egenavgifter ~${(rates.egenavgifterRate * 100).toFixed(2)}%: ${adjustedEgenavgifter} SEK`);
            } else {
              console.log('Capital base is zero — no rantefordelning applicable.');
            }
          }

          if (options.expansionsfond) {
            // Expansion fund base = closing equity − opening equity (2000-2099 only, NOT liabilities)
            let closingEquity = 0, openingEquity = 0;
            for (const [id, acc] of doc.accounts) {
              const num = parseInt(id, 10);
              if (num >= 2000 && num <= 2099) {
                const yr = acc.yearBalances.get(yearId);
                closingEquity += -(yr ? yr.closing : acc.closingBalance);
                openingEquity += -(yr ? yr.opening : acc.openingBalance);
              }
            }
            const expansionBase = closingEquity - openingEquity;

            console.log(`\n--- Expansionsfond (expansion fund, ${rates.year} rates) ---`);
            console.log(`Opening equity (2000-2099): ${Math.trunc(openingEquity)} SEK`);
            console.log(`Closing equity (2000-2099): ${Math.trunc(closingEquity)} SEK`);
            console.log(`Expansion fund base: ${Math.trunc(expansionBase)} SEK`);

            if (expansionBase > 0) {
              const maxAllocation = Math.trunc(expansionBase);
              const tax = Math.trunc(maxAllocation * rates.expansionsfondRate);
              console.log(`Max allocation: ${maxAllocation} SEK`);
              console.log(`Tax on allocation (${(rates.expansionsfondRate * 100).toFixed(1)}%): ${tax} SEK`);
              console.log('(Simplified estimate. Actual base involves adjustments per SKV blankett N6.)');
            } else {
              console.log('Expansion fund base is zero or negative — no allocation possible.');
            }
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
