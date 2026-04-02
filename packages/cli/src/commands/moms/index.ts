import type { Command } from 'commander';
import { resolve } from 'node:path';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { MomsCalculator } from './MomsCalculator.js';
import { writeMomsXml } from './MomsXmlWriter.js';
import { validateSniCode } from '../../shared/sniCodes.js';

export function register(program: Command): void {
  program
    .command('moms <file>')
    .description('VAT return (momsdeklaration) with SKV 4700 field codes from BAS VAT accounts')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .option('--period <YYYYMM>', 'Filter to a single period using #PSALDO data (e.g. 202403 = March 2024)')
    .option('--output-xml <file>', 'Write momsdeklaration XML to file (draft format — requires --period)')
    .option('--org-number <value>', 'Organisation number (falls back to #ORGNR from SIE file)')
    .option('--sni <code>', 'SNI industry code (5 digits, e.g. 62010) — only included in XML output')
    .addHelpText('after', `
Maps Swedish BAS VAT accounts to SKV 4700 declaration fields:
  Field 05  Taxable sales base       (accounts 3000-3999)
  Field 10  Output VAT 25%           (accounts 2610-2619)
  Field 11  Output VAT 12%           (accounts 2620-2629)
  Field 12  Output VAT 6%            (accounts 2630-2639)
  Field 48  Deductible input VAT     (accounts 2640-2669)
  Field 49  Net VAT payable/refund   (sum output − input)

EU fields (shown only when EU accounts have non-zero balances):
  Field 20  EU acquisitions           (accounts 4500-4599)
  Field 30  EU sales of goods         (accounts 3100-3199)
  Field 31  EU sales of services      (accounts 3300-3399)
  Field 35  Reverse charge purchases  (accounts 4530-4599)
  Field 36  Reverse charge output VAT (accounts 2614-2615)
  Field 37  Reverse charge input VAT  (accounts 2645-2647)

Without --period: uses closing balances (#UB) for the full year.
With --period YYYYMM: uses period balance records (#PSALDO) for that month.

Examples:
  $ skattata moms annual.se
  $ skattata moms annual.se --period 202403
  $ skattata moms annual.se --format json
`)
    .action(async (file: string, options: { format: OutputFormat; period?: string; outputXml?: string; orgNumber?: string; sni?: string }) => {
      try {
        if (options.sni && !validateSniCode(options.sni)) {
          console.error('Error: --sni must be exactly 5 digits (e.g. 62010)');
          process.exit(1);
        }

        const doc = await parseFile(file);
        const calc = new MomsCalculator();
        const result = calc.calculate(doc, options.period);

        if (options.outputXml) {
          if (!options.period) {
            console.error('Error: --output-xml requires --period (e.g. --period 202301)');
            process.exit(1);
          }
          const orgNumber = options.orgNumber ?? doc.organizationNumber;
          if (!orgNumber || !/^\d{10}$|^\d{12}$/.test(orgNumber)) {
            console.error('Error: Valid organisation number required (10 or 12 digits). Use --org-number or ensure SIE file has #ORGNR.');
            process.exit(1);
          }
          const xml = writeMomsXml(result, {
            orgNumber,
            period: options.period,
            companyName: doc.companyName || undefined,
            sniCode: options.sni,
          });
          const absPath = resolve(options.outputXml);
          await Bun.write(absPath, xml);
          console.log(`Written to ${absPath}`);
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.period) {
          console.log(`Period: ${result.period}`);
        }

        const headers = ['Code', 'Label', 'Amount'];
        const rows = result.fields.map(f => [f.code, f.label, f.amount.toFixed(2)]);
        console.log(formatRows(headers, rows, options.format));

        if (result.warnings.length > 0) {
          for (const w of result.warnings) console.warn(w);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
