import { describe, it, expect } from 'bun:test';
import { AccountLookup } from '../../src/lookup/AccountLookup.js';
import { SieDocument } from '../../src/models/SieDocument.js';
import { SieAccount } from '../../src/models/SieAccount.js';
import type { SieAccountType } from '../../src/models/SieAccount.js';

function makeAccount(id: string, name: string, type: SieAccountType = ''): SieAccount {
  const acc = new SieAccount();
  acc.accountId = id;
  acc.name = name;
  acc.type = type;
  return acc;
}

function makeDoc(accounts: Array<{ id: string; name: string; type?: SieAccountType }>): SieDocument {
  const doc = new SieDocument();
  for (const a of accounts) {
    doc.accounts.set(a.id, makeAccount(a.id, a.name, a.type ?? ''));
  }
  return doc;
}

const lookup = new AccountLookup();

const testDoc = makeDoc([
  { id: '1930', name: 'Bankkonto', type: 'T' },
  { id: '2610', name: 'Utgaende moms', type: 'S' },
  { id: '3000', name: 'Forsaljning', type: 'I' },
  { id: '4000', name: 'Inkop varor', type: 'K' },
  { id: '1510', name: 'Kundfordringar', type: 'T' },
]);

describe('AccountLookup', () => {
  describe('all()', () => {
    it('returns all accounts sorted by numeric id', () => {
      const result = lookup.all(testDoc);
      expect(result).toHaveLength(5);
      expect(result[0].id).toBe('1510');
      expect(result[1].id).toBe('1930');
      expect(result[2].id).toBe('2610');
      expect(result[3].id).toBe('3000');
      expect(result[4].id).toBe('4000');
    });

    it('returns empty array for empty doc', () => {
      const doc = makeDoc([]);
      expect(lookup.all(doc)).toHaveLength(0);
    });
  });

  describe('search()', () => {
    it('matches case-insensitively on name', () => {
      const result = lookup.search(testDoc, 'bank');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1930');
    });

    it('matches on id substring', () => {
      const result = lookup.search(testDoc, '193');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1930');
    });

    it('returns multiple matches', () => {
      const result = lookup.search(testDoc, 'moms');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2610');
    });

    it('returns empty for no matches', () => {
      const result = lookup.search(testDoc, 'nonexistent');
      expect(result).toHaveLength(0);
    });

    it('returns empty for empty doc', () => {
      const doc = makeDoc([]);
      expect(lookup.search(doc, 'bank')).toHaveLength(0);
    });
  });

  describe('byRange()', () => {
    it('filters by numeric range inclusive', () => {
      const result = lookup.byRange(testDoc, 1000, 1999);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1510');
      expect(result[1].id).toBe('1930');
    });

    it('returns empty when no accounts in range', () => {
      const result = lookup.byRange(testDoc, 5000, 5999);
      expect(result).toHaveLength(0);
    });

    it('single account range', () => {
      const result = lookup.byRange(testDoc, 3000, 3000);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3000');
    });
  });

  describe('byType()', () => {
    it('filters by type T (tillgang)', () => {
      const result = lookup.byType(testDoc, 'T');
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1510');
      expect(result[1].id).toBe('1930');
    });

    it('filters by type I (intakt)', () => {
      const result = lookup.byType(testDoc, 'I');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3000');
    });

    it('returns empty for unmatched type', () => {
      const result = lookup.byType(testDoc, 'X');
      expect(result).toHaveLength(0);
    });

    it('returns empty for empty doc', () => {
      const doc = makeDoc([]);
      expect(lookup.byType(doc, 'T')).toHaveLength(0);
    });
  });
});
