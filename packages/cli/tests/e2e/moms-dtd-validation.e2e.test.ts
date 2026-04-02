import { describe, test, expect, beforeAll } from 'bun:test';
import { resolve } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';

const CLI = resolve(import.meta.dir, '../../src/index.ts');
const SYNTHETIC = resolve(import.meta.dir, '../../../../sie_test_files/synthetic');
const DTD = resolve(import.meta.dir, '../fixtures/eSKDUpload_6p0.dtd');
const XMLLINT = '/usr/bin/xmllint';

function generateAndValidate(
  sieFile: string,
  period: string,
  orgNumber = '5566000006',
): { xmllintExitCode: number; xmllintStderr: string; xmlContent: string } {
  const tmpXml = `/tmp/skattata-dtd-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.xml`;

  // Generate XML
  const gen = Bun.spawnSync(
    ['bun', 'run', CLI, 'moms', sieFile, '--period', period, '--output-xml', tmpXml, '--org-number', orgNumber],
    { cwd: resolve(import.meta.dir, '../../../..') },
  );
  if (gen.exitCode !== 0) {
    throw new Error(`XML generation failed (exit ${gen.exitCode}): ${gen.stderr.toString()}`);
  }

  // Read generated XML for assertions
  const xmlContent = require('node:fs').readFileSync(tmpXml, 'latin1');

  // Validate with xmllint against local DTD
  const val = Bun.spawnSync([XMLLINT, '--nonet', '--noout', '--dtdvalid', DTD, tmpXml]);
  const result = {
    xmllintExitCode: val.exitCode,
    xmllintStderr: val.stderr.toString(),
    xmlContent,
  };

  // Cleanup
  try { unlinkSync(tmpXml); } catch {}
  return result;
}

beforeAll(() => {
  if (!existsSync(XMLLINT)) {
    throw new Error(`xmllint not found at ${XMLLINT}. Install libxml2 to run DTD validation tests.`);
  }
  if (!existsSync(DTD)) {
    throw new Error(`DTD file not found at ${DTD}. Ensure eSKDUpload_6p0.dtd is in tests/fixtures/.`);
  }
});

describe('moms XML DTD validation (eSKDUpload 6.0)', () => {
  test('domestic-only: validates against DTD', () => {
    const r = generateAndValidate(`${SYNTHETIC}/skattata-test-moms-period.se`, '202301');
    expect(r.xmllintExitCode).toBe(0);
    expect(r.xmlContent).toContain('<MomsBetala>');
  });

  test('EU fields: validates against DTD', () => {
    const r = generateAndValidate(`${SYNTHETIC}/skattata-test-moms-eu.se`, '202301');
    expect(r.xmllintExitCode).toBe(0);
    expect(r.xmlContent).toContain('<InkopVaruAnnatEg>');
    expect(r.xmlContent).toContain('<ForsVaruAnnatEg>');
    expect(r.xmlContent).toContain('<ForsTjSkskAnnatEg>');
  });

  test('refund scenario (negative MomsBetala): validates against DTD', () => {
    const r = generateAndValidate(`${SYNTHETIC}/skattata-test-moms-refund.se`, '202301');
    expect(r.xmllintExitCode).toBe(0);
    expect(r.xmlContent).toContain('<MomsBetala>');
  });

  test('12-digit personnummer org number: validates against DTD', () => {
    const r = generateAndValidate(`${SYNTHETIC}/skattata-test-moms-period.se`, '202301', '198501011234');
    expect(r.xmllintExitCode).toBe(0);
    expect(r.xmlContent).toContain('<OrgNr>198501011234</OrgNr>');
  });

  test('10-digit corporate org number: prefixed with 16 to 12 digits', () => {
    const r = generateAndValidate(`${SYNTHETIC}/skattata-test-moms-period.se`, '202301', '5566000006');
    expect(r.xmllintExitCode).toBe(0);
    expect(r.xmlContent).toContain('<OrgNr>165566000006</OrgNr>');
  });
});
