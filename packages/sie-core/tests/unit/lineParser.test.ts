import { describe, it, expect } from 'bun:test';
import { splitLine } from '../../src/utils/lineParser.js';

describe('splitLine', () => {
  describe('basic tag splitting', () => {
    it('splits a simple tag with a quoted company name', () => {
      expect(splitLine('#FNAMN "Test Company"')).toEqual(['#FNAMN', 'Test Company']);
    });

    it('splits a tag with account number and quoted description', () => {
      expect(splitLine('#KONTO 6110 "Phone and internet"')).toEqual([
        '#KONTO', '6110', 'Phone and internet',
      ]);
    });

    it('splits a tag with number and quoted Swedish name', () => {
      expect(splitLine('#KONTO 1510 "Kundfordringar"')).toEqual([
        '#KONTO', '1510', 'Kundfordringar',
      ]);
    });

    it('splits a plain tag with no quoted parts', () => {
      expect(splitLine('#ORGNR 556123-4567')).toEqual(['#ORGNR', '556123-4567']);
    });
  });

  describe('object reference preservation', () => {
    it('does not split inside curly braces containing quoted strings', () => {
      expect(splitLine('#TRANS 1910 {1 "100"} 500.00')).toEqual([
        '#TRANS', '1910', '{1 "100"}', '500.00',
      ]);
    });

    it('handles multiple object dimensions in braces', () => {
      expect(splitLine('#TRANS 4010 {1 "100" 2 "200"} -1000.00')).toEqual([
        '#TRANS', '4010', '{1 "100" 2 "200"}', '-1000.00',
      ]);
    });

    it('handles empty braces', () => {
      expect(splitLine('#TRANS 1910 {} 500.00')).toEqual([
        '#TRANS', '1910', '{}', '500.00',
      ]);
    });

    it('handles OIB/OUB object notation', () => {
      expect(splitLine('#OUB 0 1500 {1 "100"} 5000.00')).toEqual([
        '#OUB', '0', '1500', '{1 "100"}', '5000.00',
      ]);
    });
  });

  describe('empty quoted strings', () => {
    it('preserves empty quoted string as empty string token', () => {
      expect(splitLine('#VER A 1 20240101 ""')).toEqual([
        '#VER', 'A', '1', '20240101', '',
      ]);
    });

    it('handles empty string in the middle', () => {
      expect(splitLine('#VER A 1 20240101 "" 20240101')).toEqual([
        '#VER', 'A', '1', '20240101', '', '20240101',
      ]);
    });
  });

  describe('voucher lines', () => {
    it('splits a full #VER line', () => {
      expect(splitLine('#VER A 1 20230115 "Invoice payment"')).toEqual([
        '#VER', 'A', '1', '20230115', 'Invoice payment',
      ]);
    });

    it('splits a #TRANS line with date and text', () => {
      expect(splitLine('#TRANS 1910 {} 500.00 20230115 "Bank deposit"')).toEqual([
        '#TRANS', '1910', '{}', '500.00', '20230115', 'Bank deposit',
      ]);
    });

    it('splits a #TRANS line with negative amount', () => {
      expect(splitLine('#TRANS 3000 {} -500.00')).toEqual([
        '#TRANS', '3000', '{}', '-500.00',
      ]);
    });
  });

  describe('dimension and object tags', () => {
    it('splits #DIM tag', () => {
      expect(splitLine('#DIM 1 "Kostnadss\u00e4lle"')).toEqual([
        '#DIM', '1', 'Kostnadss\u00e4lle',
      ]);
    });

    it('splits #OBJEKT tag', () => {
      expect(splitLine('#OBJEKT 1 100 "Stockholm"')).toEqual([
        '#OBJEKT', '1', '100', 'Stockholm',
      ]);
    });
  });

  describe('balance tags', () => {
    it('splits #IB tag', () => {
      expect(splitLine('#IB 0 1510 10000.00')).toEqual([
        '#IB', '0', '1510', '10000.00',
      ]);
    });

    it('splits #UB tag with negative balance', () => {
      expect(splitLine('#UB 0 2440 -3500.50')).toEqual([
        '#UB', '0', '2440', '-3500.50',
      ]);
    });

    it('splits #RAR booking year tag', () => {
      expect(splitLine('#RAR 0 20230101 20231231')).toEqual([
        '#RAR', '0', '20230101', '20231231',
      ]);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty string', () => {
      expect(splitLine('')).toEqual([]);
    });

    it('returns empty array for whitespace-only string', () => {
      expect(splitLine('   ')).toEqual([]);
    });

    it('handles leading and trailing whitespace', () => {
      expect(splitLine('  #FNAMN "Acme"  ')).toEqual(['#FNAMN', 'Acme']);
    });

    it('does not split quoted strings containing spaces', () => {
      expect(splitLine('"Hello World"')).toEqual(['Hello World']);
    });

    it('handles quoted string with multiple internal spaces', () => {
      expect(splitLine('#KONTO 1000 "Cash and bank accounts"')).toEqual([
        '#KONTO', '1000', 'Cash and bank accounts',
      ]);
    });

    it('handles a tag with only the tag name', () => {
      expect(splitLine('#FLAGGA')).toEqual(['#FLAGGA']);
    });

    it('splits #PSALDO tag with object reference', () => {
      expect(splitLine('#PSALDO 0 202301 3000 {} 15000.00')).toEqual([
        '#PSALDO', '0', '202301', '3000', '{}', '15000.00',
      ]);
    });
  });
});
