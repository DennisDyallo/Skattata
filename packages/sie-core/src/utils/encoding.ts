import iconv from 'iconv-lite';

/**
 * Decodes a Buffer of IBM Codepage 437 (CP437) bytes to a Unicode string.
 * SIE 4 files are CP437-encoded; Bun has no native support for this encoding.
 */
export function decodeSie4(buf: Buffer): string {
  return iconv.decode(buf, 'cp437');
}

/**
 * Encodes a Unicode string back to a CP437 Buffer.
 * Used by the writer to produce standards-compliant SIE 4 output.
 */
export function encodeSie4(str: string): Buffer {
  return iconv.encode(str, 'cp437') as Buffer;
}
