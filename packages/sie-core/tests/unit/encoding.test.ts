import { describe, it, expect } from 'bun:test';
import { decodeSie4, encodeSie4 } from '../../src/utils/encoding.js';

describe('encoding', () => {
  describe('decodeSie4', () => {
    it('decodes CP437 byte 0x86 to å', () => {
      const buf = Buffer.from([0x86]);
      expect(decodeSie4(buf)).toBe('å');
    });

    it('decodes CP437 byte 0x84 to ä', () => {
      const buf = Buffer.from([0x84]);
      expect(decodeSie4(buf)).toBe('ä');
    });

    it('decodes CP437 byte 0x94 to ö', () => {
      const buf = Buffer.from([0x94]);
      expect(decodeSie4(buf)).toBe('ö');
    });

    it('decodes CP437 byte 0x8F to Å', () => {
      const buf = Buffer.from([0x8f]);
      expect(decodeSie4(buf)).toBe('Å');
    });

    it('decodes CP437 byte 0x8E to Ä', () => {
      const buf = Buffer.from([0x8e]);
      expect(decodeSie4(buf)).toBe('Ä');
    });

    it('decodes CP437 byte 0x99 to Ö', () => {
      const buf = Buffer.from([0x99]);
      expect(decodeSie4(buf)).toBe('Ö');
    });

    it('decodes ASCII bytes correctly', () => {
      const buf = Buffer.from([0x41, 0x42, 0x43]); // ABC
      expect(decodeSie4(buf)).toBe('ABC');
    });

    it('decodes a mixed Swedish company name', () => {
      // "Åke" in CP437: Å=0x8F, k=0x6B, e=0x65
      const buf = Buffer.from([0x8f, 0x6b, 0x65]);
      expect(decodeSie4(buf)).toBe('Åke');
    });
  });

  describe('encodeSie4', () => {
    it('encodes å to CP437 byte 0x86', () => {
      const buf = encodeSie4('å');
      expect(buf[0]).toBe(0x86);
    });

    it('encodes ä to CP437 byte 0x84', () => {
      const buf = encodeSie4('ä');
      expect(buf[0]).toBe(0x84);
    });

    it('encodes ö to CP437 byte 0x94', () => {
      const buf = encodeSie4('ö');
      expect(buf[0]).toBe(0x94);
    });

    it('encodes Å to CP437 byte 0x8F', () => {
      const buf = encodeSie4('Å');
      expect(buf[0]).toBe(0x8f);
    });

    it('round-trips Swedish characters', () => {
      const original = 'Åke Ölsson & Ärtan AB';
      const encoded = encodeSie4(original);
      const decoded = decodeSie4(encoded);
      expect(decoded).toBe(original);
    });

    it('round-trips ASCII text', () => {
      const original = '#FNAMN "Test Company"';
      const encoded = encodeSie4(original);
      const decoded = decodeSie4(encoded);
      expect(decoded).toBe(original);
    });

    it('encodes ASCII bytes correctly', () => {
      const buf = encodeSie4('ABC');
      expect(buf).toEqual(Buffer.from([0x41, 0x42, 0x43]));
    });
  });
});
