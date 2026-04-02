import { resolve } from 'node:path';
import { type SieDocument, SieTagParser, SieXmlParser } from '@skattata/sie-core';

/**
 * Parse a SIE file, auto-detecting SIE 4 vs SIE 5 format.
 */
export async function parseFile(filePath: string): Promise<SieDocument> {
  const absolutePath = resolve(filePath);
  const buf = Buffer.from(await Bun.file(absolutePath).arrayBuffer());

  // Check first bytes for XML declaration
  const header = buf.subarray(0, 10).toString('utf-8');
  if (header.includes('<?xml') || header.replace(/^\uFEFF/, '').includes('<?xml')) {
    const text = buf.toString('utf-8');
    return new SieXmlParser().parse(text);
  }

  return new SieTagParser().parse(buf);
}
