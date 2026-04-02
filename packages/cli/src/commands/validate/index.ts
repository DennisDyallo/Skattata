import type { Command } from 'commander';
import { resolve } from 'node:path';
import { parseFile } from '../../shared/parseFile.js';
import { SieTagParser, writeSie4, compareSieDocuments } from '@skattata/sie-core';

export function register(program: Command): void {
  program
    .command('validate <file>')
    .description('Round-trip test: parse → write SIE 4 → re-parse → compare. Exits 0 on PASS.')
    .option('--verbose', 'Print each field that differs between the two parsed documents')
    .addHelpText('after', `
Confirms the parser and writer are lossless for a given file.
SIE 5 XML files are skipped (writer only outputs SIE 4 format).
Exit code: 0 = PASS, 1 = FAIL or error.

Examples:
  $ skattata validate annual.se
  $ skattata validate annual.se --verbose
  $ skattata validate annual.se && echo "Safe to round-trip"
`)
    .action(async (file: string, options: { verbose?: boolean }) => {
      try {
        const doc = await parseFile(file);

        // Skip validation for SIE 5 XML files (writer only supports SIE 4)
        if (doc.format === 'SIE5') {
          console.log('SKIP: SIE 5 XML files cannot be round-trip validated with SIE 4 writer');
          process.exit(0);
        }

        const buf = writeSie4(doc);
        const reparsed = new SieTagParser().parse(buf);
        const diffs = compareSieDocuments(doc, reparsed);

        if (diffs.length === 0) {
          console.log('PASS');
          process.exit(0);
        } else {
          console.log(`FAIL: ${diffs.length} difference(s)`);
          if (options.verbose) {
            for (const d of diffs) {
              console.log(`  - ${d}`);
            }
          }
          process.exit(1);
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
