import type { Command } from 'commander';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { FSkattCalculator } from './FSkattCalculator.js';
import { getTaxRates, getDefaultTaxYear } from '../../shared/taxRates.js';

export function register(program: Command): void {
  program
    .command('f-skatt <file>')
    .description('Preliminary tax estimate (F-skatt) for enskild firma — monthly instalments')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .option('--year <n>', 'Booking year: 0=current (default), -1=prior year', '0')
    .option('--municipality-rate <rate>', 'Municipal tax rate as decimal (e.g. 0.3274 for Stockholm)')
    .option('--grundavdrag <amount>', 'Override grundavdrag (basic deduction) amount')
    .addHelpText('after', `
Estimates monthly preliminary tax (F-skatt) instalments for sole proprietors.

Calculation:
  1. Business profit from income statement (#RES accounts 3000-8999)
  2. Egenavgifter deduction: 25% schablonavdrag (simplified)
  3. Grundavdrag: PBB-based basic deduction (2025: PBB=58800)
  4. Municipal tax: taxable income × municipality rate
  5. State tax: 20% on income above 613,900 SEK (2025 threshold)
  6. Monthly instalment: total annual tax ÷ 12

All values are estimates. Actual F-skatt is determined by Skatteverket.

Examples:
  $ skattata f-skatt annual.se --municipality-rate 0.3274
  $ skattata f-skatt annual.se --municipality-rate 0.32 --year -1
  $ skattata f-skatt annual.se --municipality-rate 0.32 --grundavdrag 42000
  $ skattata f-skatt annual.se --municipality-rate 0.32 --format json
`)
    .option('--tax-year <YYYY>', 'Tax year for rate selection (default: current year)')
    .action(async (file: string, options: { format: OutputFormat; year?: string; municipalityRate?: string; grundavdrag?: string; taxYear?: string }) => {
      try {
        if (!options.municipalityRate) {
          console.error('Error: --municipality-rate is required (e.g. 0.3274 for Stockholm kommun)');
          process.exit(1);
        }

        const municipalRate = parseFloat(options.municipalityRate);
        if (isNaN(municipalRate) || municipalRate <= 0 || municipalRate >= 1) {
          console.error('Error: --municipality-rate must be a decimal between 0 and 1 (e.g. 0.3274)');
          process.exit(1);
        }

        const doc = await parseFile(file);
        const yearId = parseInt(options.year ?? '0', 10);
        const taxYear = options.taxYear ? parseInt(options.taxYear, 10) : getDefaultTaxYear();
        const rates = getTaxRates(taxYear);
        let grundavdragOverride: number | undefined;
        if (options.grundavdrag) {
          grundavdragOverride = parseInt(options.grundavdrag, 10);
          if (isNaN(grundavdragOverride) || grundavdragOverride < 0) {
            console.error('Error: --grundavdrag must be a non-negative integer');
            process.exit(1);
          }
        }
        const calc = new FSkattCalculator();
        const result = calc.calculate(doc, municipalRate, rates, yearId, grundavdragOverride);

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log('\n--- F-skatt Estimate (Preliminary Tax) ---');
        console.log('(Estimates only. Actual F-skatt determined by Skatteverket.)\n');

        const headers = ['Item', 'Amount (SEK)'];
        const rows = [
          ['Business profit', String(result.businessProfit)],
          ['Egenavgifter deduction (25%)', result.egenavgifterDeduction === 0 ? '0' : `-${result.egenavgifterDeduction}`],
          ['Grundavdrag (basic deduction)', result.grundavdrag === 0 ? '0' : `-${result.grundavdrag}`],
          ['Taxable income', String(result.taxableIncome)],
          ['', ''],
          [`Municipal tax (${(result.municipalRate * 100).toFixed(2)}%)`, String(result.municipalTax)],
          [`State tax (20% above ${result.stateTaxThreshold.toLocaleString('sv-SE')})`, String(result.stateTax)],
          ['', ''],
          ['Total annual tax', String(result.totalAnnualTax)],
          ['Monthly instalment', String(result.monthlyInstalment)],
        ];
        console.log(formatRows(headers, rows, options.format));
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
