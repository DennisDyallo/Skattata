import { resolve } from 'node:path';
import { writeSie4, type SieDocument } from '@skattata/sie-core';

export interface WriteOptions {
  /** Write to a different path instead of the source file. */
  outputPath?: string;
  /** Copy source file to <path>.bak before overwriting. */
  backup?: boolean;
}

/**
 * Encodes doc as SIE 4 CP437 and writes it to disk.
 * Returns the path that was written.
 */
export async function writeSieFile(
  doc: SieDocument,
  sourcePath: string,
  opts?: WriteOptions
): Promise<string> {
  const absSource = resolve(sourcePath);
  const destPath = opts?.outputPath ? resolve(opts.outputPath) : absSource;

  if (opts?.backup) {
    const originalBytes = await Bun.file(absSource).arrayBuffer();
    await Bun.write(absSource + '.bak', originalBytes);
  }

  const buffer = writeSie4(doc);
  await Bun.write(destPath, buffer);

  return destPath;
}
