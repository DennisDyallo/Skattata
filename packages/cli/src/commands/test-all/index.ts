import type { Command } from 'commander';
import { readdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { parseFile } from '../../shared/parseFile.js';
import { formatRows } from '../../shared/formatters/index.js';

export function register(program: Command): void {
  program
    .command('test-all <dir>')
    .description('Batch-parse every .se/.si/.sie file in a directory and report PASS/FAIL')
    .option('--stop-on-error', 'Stop immediately on the first file that fails to parse')
    .option('--report <file>', 'Write a JSON report to file: { total, passed, failed, results[] }')
    .addHelpText('after', `
Discovers all files with extensions .se .si .sie (case-insensitive) in the
given directory (non-recursive). For each file: parses it and checks that
doc.errors is empty. A file FAILS if it crashes the parser or produces errors.

Exit code: 0 if all files pass, 1 if any fail.

Examples:
  $ skattata test-all ./sie_test_files
  $ skattata test-all ./sie_test_files --report results.json
  $ skattata test-all ./sie_test_files --stop-on-error
  $ skattata test-all . --report out.json && echo "All clean"
`)
    .action(async (dir: string, options: { stopOnError?: boolean; report?: string }) => {
      try {
        const absDir = resolve(dir);
        const entries = await readdir(absDir);
        const sieExts = new Set(['.se', '.si', '.sie']);
        const sieFiles = entries.filter(f => sieExts.has(extname(f).toLowerCase()));

        if (sieFiles.length === 0) {
          console.log('No SIE files found in directory.');
          process.exit(0);
        }

        let passed = 0;
        let failed = 0;
        const results: { file: string; status: 'pass' | 'fail'; error?: string }[] = [];

        for (const fileName of sieFiles) {
          const filePath = resolve(absDir, fileName);
          try {
            const doc = await parseFile(filePath);
            if (doc.errors.length > 0) {
              throw new Error(`Parse errors: ${doc.errors.join('; ')}`);
            }
            passed++;
            results.push({ file: fileName, status: 'pass' });
          } catch (err) {
            failed++;
            const msg = (err as Error).message;
            results.push({ file: fileName, status: 'fail', error: msg });
            if (options.stopOnError) {
              console.error(`FAIL: ${fileName} — ${msg}`);
              break;
            }
          }
        }

        // Summary
        const headers = ['File', 'Status'];
        const rows = results.map(r => [r.file, r.status === 'pass' ? 'PASS' : `FAIL: ${r.error ?? ''}`]);
        console.log(formatRows(headers, rows, 'table'));
        console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

        if (options.report) {
          const reportPath = resolve(options.report);
          await writeFile(reportPath, JSON.stringify({ total: results.length, passed, failed, results }, null, 2));
          console.log(`Report written to ${reportPath}`);
        }

        process.exit(failed > 0 ? 1 : 0);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
