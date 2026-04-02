import type { Command } from 'commander';
import { resolve } from 'node:path';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { MomsCalculator } from './MomsCalculator.js';
import { writeMomsXml } from './MomsXmlWriter.js';

export function register(program: Command): void {
  program
    .command('moms <file>')
    .description('VAT return (momsdeklaration) with SKV 4700 field codes from BAS VAT accounts')
    .option('-f, --format <format>', 'Output format: table|json|csv', 'table')
    .option('--period <YYYYMM>', 'Filter to a single period using #PSALDO data (e.g. 202403 = March 2024)')
    .option('--output-xml <file>', 'Write eSKDUpload v6.0 momsdeklaration XML (requires --period)')
    .option('--org-number <value>', 'Organisation number (falls back to #ORGNR from SIE file)')
    .addHelpText('after', `
Maps Swedish BAS VAT accounts to SKV 4700 declaration fields:

  Sales bases:
    Ruta 05  Taxable sales              (accounts 3000-3999)

  Output VAT on sales:
    Ruta 10  Output VAT 25%             (accounts 2610-2613, 2616-2619)
    Ruta 11  Output VAT 12%             (accounts 2620-2623, 2626-2629)
    Ruta 12  Output VAT 6%              (accounts 2630-2633, 2636-2639)

  EU purchase bases (shown when non-zero):
    Ruta 20  Goods from EU              (accounts 4500-4519)
    Ruta 21  Services from EU           (accounts 4520-4529)

  Output VAT on purchases / reverse charge (shown when non-zero):
    Ruta 30  Output VAT 25% purchases   (account 2614)
    Ruta 31  Output VAT 12% purchases   (account 2624)
    Ruta 32  Output VAT 6% purchases    (account 2634)

  VAT-exempt sales (shown when non-zero):
    Ruta 35  Goods sold to EU           (accounts 3100-3199)
    Ruta 39  Services sold to EU        (accounts 3300-3399)

  Import VAT (shown when non-zero):
    Ruta 50  Import tax base            (accounts 4545-4548)
    Ruta 60  Import output VAT 25%      (account 2615)
    Ruta 61  Import output VAT 12%      (account 2625)
    Ruta 62  Import output VAT 6%       (account 2635)

  Input VAT and net:
    Ruta 48  Deductible input VAT       (accounts 2640-2669)
    Ruta 49  Net VAT payable/refund     (all output - input)

Without --period: uses closing balances (#UB) for the full year.
With --period YYYYMM: uses period balance records (#PSALDO) for that month.

XML output follows Skatteverket eSKDUpload Version 6.0 format (ISO-8859-1,
DOCTYPE, named elements in DTD-defined order).

Examples:
  $ skattata moms annual.se
  $ skattata moms annual.se --period 202403
  $ skattata moms annual.se --period 202301 --output-xml moms.xml --org-number 5566000006
`)
    .action(async (file: string, options: { format: OutputFormat; period?: string; outputXml?: string; orgNumber?: string }) => {
      try {
        const doc = await parseFile(file);
        const calc = new MomsCalculator();
        const result = calc.calculate(doc, options.period);

        if (options.outputXml) {
          if (!options.period) {
            console.error('Error: --output-xml requires --period (e.g. --period 202301)');
            process.exit(1);
          }
          const rawOrg = options.orgNumber ?? doc.organizationNumber;
          const orgNumber = rawOrg?.replace(/-/g, '') ?? '';
          if (!orgNumber || !/^\d{10}$|^\d{12}$/.test(orgNumber)) {
            console.error('Error: Valid organisation number required (10 or 12 digits). Use --org-number or ensure SIE file has #ORGNR.');
            process.exit(1);
          }
          const xml = writeMomsXml(result, { orgNumber, period: options.period });
          const absPath = resolve(options.outputXml);
          // Write as ISO-8859-1 bytes (charCode 0-255 maps directly)
          const bytes = new Uint8Array(xml.length);
          for (let i = 0; i < xml.length; i++) bytes[i] = xml.charCodeAt(i);
          await Bun.write(absPath, bytes);
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
