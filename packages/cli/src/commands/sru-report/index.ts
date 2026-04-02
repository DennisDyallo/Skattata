import type { Command } from 'commander';
import { resolve } from 'node:path';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows, type OutputFormat } from '../../shared/formatters/index.js';
import { SruReportCalculator } from './SruReportCalculator.js';
import { writeSruFile } from './SruFileWriter.js';
import { writeInfoSru } from './InfoSruWriter.js';

export function register(program: Command): void {
  program
    .command('sru-report <file>')
    .description('Tax declaration report (INK2R/NE) aggregating account balances by SRU code')
    .option('-f, --format <format>', 'Output format: table|json|csv|sru', 'table')
    .option('--year <n>', 'Booking year: 0=current (default), -1=prior year', '0')
    .option('--form <form>', 'Declaration form: ink2r=aktiebolag, ne=enskild firma (default: ink2r)', 'ink2r')
    .option('--output <file>', 'Write Skatteverket .sru flat-file to this path (implies --format sru)')
    .option('--org-number <value>', 'Override organisation number used in #IDENTITET line of .sru file')
    .addHelpText('after', `
SRU (Standardiserade Räkenskapsutdrag) codes are assigned by your accounting
software when it exports the SIE file (e.g. Fortnox, Visma). Each #SRU tag
maps an account to a line on the Swedish income tax declaration.

This command groups accounts by their SRU code and sums the relevant balance:
  T/S accounts (or 1000–2999)  → closing balance (#UB)
  I/K accounts (or 3000+)      → period result  (#RES)

Declaration forms (--form):
  ink2r   INK2R Räkenskapsschema — balance sheet + P&L for aktiebolag
  ink2s   INK2S Skattemässiga justeringar — tax adjustments for aktiebolag
  ne      NE-bilaga Räkenskapsschema — for enskild firma (sole trader)

The --format sru output follows Skatteverket's SKV 269 flat-file format:
  #BLANKETT INK2R
  #IDENTITET 5566547898 20240401 143022
  #NAMN Demoföretaget AB
  #SYSTEMINFO skattata 0.1.0
  #UPPGIFT 7201 1500000
  #BLANKETTSLUT
  #FIL_SLUT

When --output is used, an info.sru companion file is also written to the
same directory (required for a complete Skatteverket SRU submission).
The --output file is the blanketter.sru component; info.sru is the sender metadata.

Examples:
  $ skattata sru-report annual.se
  $ skattata sru-report annual.se --format json
  $ skattata sru-report annual.se --format sru
  $ skattata sru-report annual.se --output ink2r.sru
  $ skattata sru-report annual.se --form ne --output ne.sru
  $ skattata sru-report annual.se --org-number 5566547898 --output ink2r.sru
`)
    .action(async (file: string, options: { format: string; year: string; form: string; output?: string; orgNumber?: string }) => {
      try {
        const doc = await parseFile(file);
        const yearId = parseInt(options.year ?? '0', 10);
        const result = new SruReportCalculator().calculate(doc, yearId);

        if (options.output || options.format === 'sru') {
          const sruText = writeSruFile(result, {
            form: (options.form ?? 'ink2r').toUpperCase() as 'INK2R' | 'INK2S' | 'NE',
            orgNumber: options.orgNumber,
          });
          if (options.output) {
            // No directory restriction enforced — intentional for a tax filing tool
            const absOutput = resolve(options.output);
            await Bun.write(absOutput, sruText);
            console.log(`Written to ${absOutput}`);

            // Write info.sru companion file in the same directory (required for full SKV submission)
            const { dirname, join } = await import('node:path');
            const infoPath = join(dirname(absOutput), 'info.sru');
            const infoText = writeInfoSru(result, { orgNumber: options.orgNumber });
            await Bun.write(infoPath, infoText);
            console.log(`Written to ${infoPath}`);
          } else {
            console.log(sruText);
          }
          return;
        }

        if (options.format === 'json') {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // table/csv output
        const headers = ['SRU Code', 'Total (SEK)', 'Accounts'];
        const rows = result.entries.map(e => [
          e.sruCode,
          e.totalAmount.toFixed(2),
          e.accounts.map(a => a.id).join(', '),
        ]);
        console.log(formatRows(headers, rows, (options.format ?? 'table') as OutputFormat));

        if (result.missingCode.length > 0) {
          console.log(`\n${result.missingCode.length} account(s) have no SRU code.`);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
