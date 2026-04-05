import { describe, test, expect } from 'bun:test';
import { resolve } from 'node:path';
import { unlinkSync, readFileSync, existsSync } from 'node:fs';

const CLI = resolve(import.meta.dir, '../../src/index.ts');
const SYNTHETIC = resolve(import.meta.dir, '../../../../sie_test_files/synthetic');
const REPO_ROOT = resolve(import.meta.dir, '../../../..');

/**
 * SKV 269 format validation rules derived from the Skatteverket specification
 * (SKV260, 26th edition, version 4.0).
 *
 * Source: docs/SOURCES.md — "SRU File Format" section
 */

function generateSru(
  sieFile: string,
  form: string,
  orgNumber = '5566000006',
  extraArgs: string[] = [],
): { blanketter: string; info: string; exitCode: number; stderr: string } {
  const tmpDir = `/tmp/skattata-sru-test-${Date.now()}`;
  const tmpSru = `${tmpDir}/blanketter.sru`;

  // Create temp dir
  Bun.spawnSync(['mkdir', '-p', tmpDir]);

  const gen = Bun.spawnSync(
    ['bun', 'run', CLI, 'sru-report', sieFile, '--form', form, '--output', tmpSru, '--org-number', orgNumber, ...extraArgs],
    { cwd: REPO_ROOT },
  );

  let blanketter = '';
  let info = '';
  if (gen.exitCode === 0) {
    blanketter = readFileSync(tmpSru, 'utf-8');
    const infoPath = `${tmpDir}/info.sru`;
    if (existsSync(infoPath)) {
      info = readFileSync(infoPath, 'utf-8');
    }
  }

  // Cleanup
  try { unlinkSync(tmpSru); } catch {}
  try { unlinkSync(`${tmpDir}/info.sru`); } catch {}
  try { Bun.spawnSync(['rmdir', tmpDir]); } catch {}

  return {
    blanketter,
    info,
    exitCode: gen.exitCode,
    stderr: gen.stderr.toString(),
  };
}

describe('SRU format validation (SKV 269)', () => {
  // --- blanketter.sru structure ---

  test('blanketter.sru: starts with #BLANKETT and ends with #FIL_SLUT', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    const lines = r.blanketter.split('\r\n').filter(l => l.length > 0);
    expect(lines[0]).toMatch(/^#BLANKETT /);
    expect(lines[lines.length - 1]).toBe('#FIL_SLUT');
  });

  test('blanketter.sru: uses CRLF line endings', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    // Every line ending should be \r\n
    expect(r.blanketter).toContain('\r\n');
    // No bare \n without preceding \r (except the \n in \r\n)
    const withoutCrlf = r.blanketter.replace(/\r\n/g, '');
    expect(withoutCrlf).not.toContain('\n');
  });

  test('blanketter.sru: mandatory tags present in correct order', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);

    // Required order: #BLANKETT → #TAXAR → #IDENTITET → [#NAMN] → #SYSTEMINFO/#UPPGIFT → #BLANKETTSLUT → #FIL_SLUT
    const tagOrder = r.blanketter
      .split('\r\n')
      .filter(l => l.startsWith('#'))
      .map(l => l.split(' ')[0]);

    const blankettIdx = tagOrder.indexOf('#BLANKETT');
    const taxarIdx = tagOrder.indexOf('#TAXAR');
    const identitetIdx = tagOrder.indexOf('#IDENTITET');
    const blankettslutIdx = tagOrder.indexOf('#BLANKETTSLUT');
    const filSlutIdx = tagOrder.indexOf('#FIL_SLUT');

    expect(blankettIdx).toBeGreaterThanOrEqual(0);
    expect(taxarIdx).toBeGreaterThan(blankettIdx);
    expect(identitetIdx).toBeGreaterThan(taxarIdx);
    expect(blankettslutIdx).toBeGreaterThan(identitetIdx);
    expect(filSlutIdx).toBeGreaterThan(blankettslutIdx);
  });

  test('blanketter.sru: #BLANKETT has valid form type', () => {
    for (const form of ['ink2r', 'ne']) {
      const testFile = form === 'ne'
        ? `${SYNTHETIC}/skattata-test-ne-no-sru.se`
        : `${SYNTHETIC}/skattata-test-sru-report.se`;
      const r = generateSru(testFile, form);
      expect(r.exitCode).toBe(0);
      const blankettLine = r.blanketter.split('\r\n').find(l => l.startsWith('#BLANKETT'))!;
      expect(blankettLine).toMatch(/^#BLANKETT (INK2R|INK2S|NE)$/);
    }
  });

  test('blanketter.sru: #IDENTITET has 10/12-digit orgNr + date + time', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r', '5566000006');
    expect(r.exitCode).toBe(0);
    const identLine = r.blanketter.split('\r\n').find(l => l.startsWith('#IDENTITET'))!;
    // Format: #IDENTITET <orgNr> <YYYYMMDD> <HHMMSS>
    expect(identLine).toMatch(/^#IDENTITET \d{10} \d{8} \d{6}$/);
  });

  test('blanketter.sru: #IDENTITET accepts 12-digit personnummer', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r', '198501011234');
    expect(r.exitCode).toBe(0);
    const identLine = r.blanketter.split('\r\n').find(l => l.startsWith('#IDENTITET'))!;
    expect(identLine).toMatch(/^#IDENTITET 198501011234 \d{8} \d{6}$/);
  });

  test('blanketter.sru: #UPPGIFT values are truncated integers', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    const uppgiftLines = r.blanketter.split('\r\n').filter(l => l.startsWith('#UPPGIFT'));
    expect(uppgiftLines.length).toBeGreaterThan(0);
    for (const line of uppgiftLines) {
      // Format: #UPPGIFT <sruCode> <integer>
      expect(line).toMatch(/^#UPPGIFT \d+ -?\d+$/);
    }
  });

  test('blanketter.sru: #TAXAR is a valid 4-digit year', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    const taxarLine = r.blanketter.split('\r\n').find(l => l.startsWith('#TAXAR'))!;
    expect(taxarLine).toMatch(/^#TAXAR \d{4}$/);
    const year = parseInt(taxarLine.split(' ')[1], 10);
    expect(year).toBeGreaterThan(2000);
    expect(year).toBeLessThan(2100);
  });

  // --- info.sru structure ---

  test('info.sru: has DATABESKRIVNING and MEDIELEV sections', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    expect(r.info).toContain('#DATABESKRIVNING_START');
    expect(r.info).toContain('#DATABESKRIVNING_SLUT');
    expect(r.info).toContain('#MEDIELEV_START');
    expect(r.info).toContain('#MEDIELEV_SLUT');
  });

  test('info.sru: DATABESKRIVNING before MEDIELEV', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    const dataStart = r.info.indexOf('#DATABESKRIVNING_START');
    const dataEnd = r.info.indexOf('#DATABESKRIVNING_SLUT');
    const medStart = r.info.indexOf('#MEDIELEV_START');
    const medEnd = r.info.indexOf('#MEDIELEV_SLUT');
    expect(dataStart).toBeLessThan(dataEnd);
    expect(dataEnd).toBeLessThan(medStart);
    expect(medStart).toBeLessThan(medEnd);
  });

  test('info.sru: contains #PRODUKT SRU', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    expect(r.info).toContain('#PRODUKT SRU');
  });

  test('info.sru: contains #FILNAMN BLANKETTER.SRU', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    expect(r.info).toContain('#FILNAMN BLANKETTER.SRU');
  });

  test('info.sru: contains #SKAPAD with date and time', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    const skapadLine = r.info.split('\r\n').find(l => l.startsWith('#SKAPAD'))!;
    expect(skapadLine).toMatch(/^#SKAPAD \d{8} \d{6}$/);
  });

  test('info.sru: contains #ORGNR with valid format', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r', '5566000006');
    expect(r.exitCode).toBe(0);
    const orgnrLine = r.info.split('\r\n').find(l => l.startsWith('#ORGNR'))!;
    expect(orgnrLine).toMatch(/^#ORGNR \d{10}$/);
  });

  test('info.sru: uses CRLF line endings', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r');
    expect(r.exitCode).toBe(0);
    expect(r.info).toContain('\r\n');
    const withoutCrlf = r.info.replace(/\r\n/g, '');
    expect(withoutCrlf).not.toContain('\n');
  });

  // --- NE form specific ---

  test('NE form: generates valid SRU with default mappings', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-ne-no-sru.se`, 'ne');
    expect(r.exitCode).toBe(0);
    const blankettLine = r.blanketter.split('\r\n').find(l => l.startsWith('#BLANKETT'))!;
    expect(blankettLine).toBe('#BLANKETT NE');
    // Should have UPPGIFT entries from default mapping
    const uppgiftLines = r.blanketter.split('\r\n').filter(l => l.startsWith('#UPPGIFT'));
    expect(uppgiftLines.length).toBeGreaterThan(0);
  });

  test('info.sru: includes SNI code when provided', () => {
    const r = generateSru(`${SYNTHETIC}/skattata-test-sru-report.se`, 'ink2r', '5566000006', ['--sni', '62010']);
    expect(r.exitCode).toBe(0);
    expect(r.info).toContain('* SNI: 62010');
  });
});
