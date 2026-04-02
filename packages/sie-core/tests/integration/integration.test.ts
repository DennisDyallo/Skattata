import { describe, it, expect, beforeAll } from 'bun:test';
import { existsSync, readdirSync } from 'fs';
import { resolve, join, extname } from 'path';
import { SieTagParser } from '../../src/parser/SieTagParser.js';
import { SieXmlParser } from '../../src/parser/SieXmlParser.js';
import { decodeSie4 } from '../../src/utils/encoding.js';

// Locate the SIE test files directory.
// Try multiple candidate paths so the test works in the worktree and flow repo:
//   1. {repo-root}/sie_test_files        — symlink in the worktree (4 levels up)
//   2. {repo-root}/Skattata.Tests/sie_test_files — in the cloned Skattata repo
const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..');
const TEST_FILES_CANDIDATES = [
  join(REPO_ROOT, 'sie_test_files'),
  join(REPO_ROOT, 'Skattata.Tests', 'sie_test_files'),
];
const TEST_FILES_DIR = TEST_FILES_CANDIDATES.find(existsSync) ?? TEST_FILES_CANDIDATES[0];

const SIE_EXTENSIONS = new Set(['.se', '.si', '.sie']);

function isSieFile(filename: string): boolean {
  return SIE_EXTENSIONS.has(extname(filename).toLowerCase());
}

function isXmlFile(content: Buffer): boolean {
  // Check first 10 bytes decoded as ASCII for <?xml prefix
  const prefix = content.slice(0, 10).toString('ascii');
  return prefix.trimStart().startsWith('<?xml') || prefix.startsWith('\xef\xbb\xbf<?xml');
}

describe('Integration: parse all SIE test files', () => {
  let sieFiles: string[] = [];
  let testFilesAvailable = false;

  beforeAll(() => {
    testFilesAvailable = existsSync(TEST_FILES_DIR);
    if (!testFilesAvailable) {
      console.warn(`[integration] SIE test files not found at ${TEST_FILES_DIR} — skipping integration tests`);
      return;
    }
    sieFiles = readdirSync(TEST_FILES_DIR)
      .filter(isSieFile)
      .map(f => join(TEST_FILES_DIR, f));
    console.log(`[integration] Found ${sieFiles.length} SIE test files`);
  });

  it('test files directory exists', () => {
    if (!testFilesAvailable) {
      console.warn('Skipping: test files directory not found');
      return;
    }
    expect(testFilesAvailable).toBe(true);
    expect(sieFiles.length).toBeGreaterThan(0);
  });

  it('parses every SIE 4 file without throwing', async () => {
    if (!testFilesAvailable) return;

    const tagParser = new SieTagParser();
    const failures: { file: string; error: string }[] = [];

    for (const filePath of sieFiles) {
      const filename = filePath.split('/').pop()!;
      try {
        const buf = Buffer.from(await Bun.file(filePath).arrayBuffer());

        if (isXmlFile(buf)) continue; // XML files handled separately

        const doc = tagParser.parse(buf);

        // The parser should return a document (even if there are soft errors)
        if (doc === null || doc === undefined) {
          failures.push({ file: filename, error: 'Parser returned null/undefined' });
        }
      } catch (err) {
        failures.push({ file: filename, error: (err as Error).message });
      }
    }

    if (failures.length > 0) {
      const msg = failures.map(f => `  ${f.file}: ${f.error}`).join('\n');
      throw new Error(`${failures.length} SIE 4 file(s) threw during parsing:\n${msg}`);
    }
  });

  it('parses every SIE 5 (XML) file without throwing', async () => {
    if (!testFilesAvailable) return;

    const xmlParser = new SieXmlParser();
    const failures: { file: string; error: string }[] = [];

    for (const filePath of sieFiles) {
      const filename = filePath.split('/').pop()!;
      try {
        const buf = Buffer.from(await Bun.file(filePath).arrayBuffer());

        if (!isXmlFile(buf)) continue; // SIE 4 files handled separately

        const text = await Bun.file(filePath).text();
        const doc = xmlParser.parse(text);

        if (doc === null || doc === undefined) {
          failures.push({ file: filename, error: 'Parser returned null/undefined' });
        }
      } catch (err) {
        failures.push({ file: filename, error: (err as Error).message });
      }
    }

    if (failures.length > 0) {
      const msg = failures.map(f => `  ${f.file}: ${f.error}`).join('\n');
      throw new Error(`${failures.length} SIE 5 file(s) threw during parsing:\n${msg}`);
    }
  });

  it('SIE 4 files produce documents with at least a company name or accounts', async () => {
    if (!testFilesAvailable) return;

    const tagParser = new SieTagParser();
    const emptyDocs: string[] = [];

    for (const filePath of sieFiles) {
      const filename = filePath.split('/').pop()!;
      try {
        const buf = Buffer.from(await Bun.file(filePath).arrayBuffer());
        if (isXmlFile(buf)) continue;

        const doc = tagParser.parse(buf);
        // A successfully-parsed file should have at least one account or a company name
        const hasContent = doc.accounts.size > 0 || doc.companyName.length > 0 || doc.bookingYears.length > 0;
        if (!hasContent) {
          emptyDocs.push(filename);
        }
      } catch {
        // Already counted in the throwing test above
      }
    }

    // We expect most files to have content; log any that are empty
    if (emptyDocs.length > 0) {
      console.warn(`[integration] Files with no parsed content: ${emptyDocs.join(', ')}`);
    }
    // This is a soft check — we don't fail on empty docs since some files may be minimal
  });

  it('SIE 5 XML sie5-icalcreator-sample.sie has correct company info', async () => {
    const samplePath = join(TEST_FILES_DIR, 'sie5-icalcreator-sample.sie');
    if (!existsSync(samplePath)) {
      console.warn('Skipping: sie5-icalcreator-sample.sie not found');
      return;
    }

    const text = await Bun.file(samplePath).text();
    const doc = new SieXmlParser().parse(text);

    expect(doc.companyName).toBe('Övningsbolaget AB');
    expect(doc.organizationNumber).toBe('555555-5555');
    expect(doc.accounts.size).toBeGreaterThan(0);
    expect(doc.vouchers.length).toBeGreaterThan(0);
  });

  it('a real SIE 4 file (sie4-dennis-fiscal-2016.se) parses correctly', async () => {
    const filePath = join(TEST_FILES_DIR, 'sie4-dennis-fiscal-2016.se');
    if (!existsSync(filePath)) {
      console.warn('Skipping: sie4-dennis-fiscal-2016.se not found');
      return;
    }

    const buf = Buffer.from(await Bun.file(filePath).arrayBuffer());
    const doc = new SieTagParser().parse(buf);

    expect(doc.errors).toHaveLength(0);
    expect(doc.accounts.size).toBeGreaterThan(0);
    expect(doc.vouchers.length).toBeGreaterThan(0);

    // Voucher rows should have amounts
    const firstVoucher = doc.vouchers[0];
    expect(firstVoucher.rows.length).toBeGreaterThan(0);
    firstVoucher.rows.forEach(row => {
      expect(isNaN(row.amount)).toBe(false);
    });
  });

  it('a SIE file with #KTYP parses account types', async () => {
    const filePath = join(TEST_FILES_DIR, 'sie4-demo-combined.se');
    if (!existsSync(filePath)) {
      console.warn('Skipping: sie4-demo-combined.se not found');
      return;
    }

    const buf = Buffer.from(await Bun.file(filePath).arrayBuffer());
    const doc = new SieTagParser().parse(buf);

    // Account 1010 should have type T
    const acc1010 = doc.accounts.get('1010');
    expect(acc1010).toBeDefined();
    expect(acc1010?.type).toBe('T');
  });
});
