import { describe, it, expect } from 'bun:test';
import { SieTagParser } from '../../src/parser/SieTagParser.js';
import { SieDocument } from '../../src/models/SieDocument.js';
import { splitLine } from '../../src/internal/lineParser.js';

function parse(input: string): SieDocument {
  return new SieTagParser().parse(input);
}

describe('Multi-year balance parsing (yearBalances Map)', () => {
  const input = [
    '#KONTO 1234 "Bank"',
    '#IB 0 1234 5000.00',
    '#IB -1 1234 3000.00',
    '#UB 0 1234 6000.00',
    '#RES 0 1234 -1000.00',
  ].join('\n');

  it('sets year-0 opening balance on the scalar field', () => {
    const doc = parse(input);
    expect(doc.accounts.get('1234')!.openingBalance).toBe(5000);
  });

  it('stores year 0 opening in yearBalances map', () => {
    const doc = parse(input);
    expect(doc.accounts.get('1234')!.yearBalances.get(0)!.opening).toBe(5000);
  });

  it('stores year -1 opening in yearBalances map', () => {
    const doc = parse(input);
    expect(doc.accounts.get('1234')!.yearBalances.get(-1)!.opening).toBe(3000);
  });

  it('stores year 0 closing in yearBalances map', () => {
    const doc = parse(input);
    expect(doc.accounts.get('1234')!.yearBalances.get(0)!.closing).toBe(6000);
  });

  it('stores year 0 result in yearBalances map', () => {
    const doc = parse(input);
    expect(doc.accounts.get('1234')!.yearBalances.get(0)!.result).toBe(-1000);
  });
});

describe('Metadata tags', () => {
  const input = [
    '#SIETYP 4',
    '#FLAGGA 0',
    '#VALUTA EUR',
    '#PROGRAM "MyApp"',
    '#GEN 20240101',
    '#FNAMN "Test AB"',
  ].join('\n');

  it('parses sieType', () => {
    const doc = parse(input);
    expect(doc.sieType).toBe(4);
  });

  it('parses flagga', () => {
    const doc = parse(input);
    expect(doc.flagga).toBe(0);
  });

  it('parses currency', () => {
    const doc = parse(input);
    expect(doc.currency).toBe('EUR');
  });

  it('parses program', () => {
    const doc = parse(input);
    expect(doc.program).toBe('MyApp');
  });

  it('parses companyName', () => {
    const doc = parse(input);
    expect(doc.companyName).toBe('Test AB');
  });
});

describe('#PSALDO with object refs', () => {
  const input = [
    '#KONTO 3000 "Revenue"',
    '#DIM 1 "Project"',
    '#RAR 0 20230101 20231231',
    '#PSALDO 0 202301 3000 {1 "P100"} 5000.00',
  ].join('\n');

  it('creates one period value', () => {
    const doc = parse(input);
    expect(doc.accounts.get('3000')!.periodValues.length).toBe(1);
  });

  it('stores the correct value', () => {
    const doc = parse(input);
    expect(doc.accounts.get('3000')!.periodValues[0].value).toBe(5000);
  });

  it('parses one object reference', () => {
    const doc = parse(input);
    expect(doc.accounts.get('3000')!.periodValues[0].objects.length).toBe(1);
  });

  it('stores the dimension number', () => {
    const doc = parse(input);
    expect(doc.accounts.get('3000')!.periodValues[0].objects[0].dimensionNumber).toBe('1');
  });

  it('stores the object number', () => {
    const doc = parse(input);
    expect(doc.accounts.get('3000')!.periodValues[0].objects[0].number).toBe('P100');
  });
});

describe('#DIM with parentNumber', () => {
  const input = [
    '#DIM 1 "Project"',
    '#DIM 12 "SubProject" 1',
  ].join('\n');

  it('first dimension has empty parentNumber', () => {
    const doc = parse(input);
    expect(doc.dimensions[0].parentNumber).toBe('');
  });

  it('second dimension has parentNumber "1"', () => {
    const doc = parse(input);
    expect(doc.dimensions[1].parentNumber).toBe('1');
  });
});

describe('On-demand account creation from #IB before #KONTO', () => {
  const input = '#IB 0 9999 12345.00';

  it('creates the account', () => {
    const doc = parse(input);
    expect(doc.accounts.has('9999')).toBe(true);
  });

  it('sets the opening balance', () => {
    const doc = parse(input);
    expect(doc.accounts.get('9999')!.openingBalance).toBe(12345);
  });

  it('uses empty string for name', () => {
    const doc = parse(input);
    expect(doc.accounts.get('9999')!.name).toBe('');
  });
});

describe('On-demand dimension creation from #OBJEKT before #DIM', () => {
  const input = '#OBJEKT 5 "OBJ1" "Object One"';

  it('creates the dimension', () => {
    const doc = parse(input);
    expect(doc.dimensions.find(d => d.number === '5')).toBeDefined();
  });

  it('stores the object in the dimension', () => {
    const doc = parse(input);
    expect(doc.dimensions.find(d => d.number === '5')!.objects.has('OBJ1')).toBe(true);
  });
});

describe('#KONTO with no name', () => {
  const input = '#KONTO 7777';

  it('creates the account', () => {
    const doc = parse(input);
    expect(doc.accounts.has('7777')).toBe(true);
  });

  it('uses empty string for name', () => {
    const doc = parse(input);
    expect(doc.accounts.get('7777')!.name).toBe('');
  });
});

describe('Backslash escape sequences in splitLine', () => {
  it('handles escaped double quotes inside quoted strings', () => {
    const result = splitLine('#KONTO 1234 "Test \\"quoted\\""');
    expect(result).toEqual(['#KONTO', '1234', 'Test "quoted"']);
  });

  it('handles escaped backslashes inside quoted strings', () => {
    const result = splitLine('#KONTO 1234 "Back\\\\slash"');
    expect(result).toEqual(['#KONTO', '1234', 'Back\\slash']);
  });

  it('handles ending backslash in quoted strings', () => {
    const result = splitLine('#KONTO 1234 "Ending backslash\\\\"');
    expect(result).toEqual(['#KONTO', '1234', 'Ending backslash\\']);
  });
});

describe('safeParseFloat via balance parsing (indirect test)', () => {
  const input = [
    '#KONTO 1111 "Bad"',
    '#IB 0 1111 NOTANUMBER',
  ].join('\n');

  it('guards NaN to 0', () => {
    const doc = parse(input);
    expect(doc.accounts.get('1111')!.openingBalance).toBe(0);
  });
});

describe('Malformed #VER block still consumes body', () => {
  const input = [
    '#KONTO 1234 "Bank"',
    '#VER',
    '{',
    '#TRANS 1234 {} 500.00',
    '}',
    '#KONTO 5678 "Other"',
  ].join('\n');

  it('does not add the malformed voucher', () => {
    const doc = parse(input);
    expect(doc.vouchers.length).toBe(0);
  });

  it('still parses lines after the malformed VER block', () => {
    const doc = parse(input);
    expect(doc.accounts.has('5678')).toBe(true);
  });
});

describe('parseDate validation - invalid date inputs', () => {
  const input = [
    '#KONTO 1234 "Bank"',
    '#VER A 1 00000000 "Bad date"',
    '{',
    '#TRANS 1234 {} 100.00 00000000',
    '}',
    '#VER A 2 20230101 "Good"',
    '{',
    '#TRANS 1234 {} 200.00',
    '}',
  ].join('\n');

  it('parses both vouchers', () => {
    const doc = parse(input);
    expect(doc.vouchers.length).toBe(2);
  });

  it('good voucher has correct date', () => {
    const doc = parse(input);
    expect(doc.vouchers[1].date.getFullYear()).toBe(2023);
  });
});

describe('normalizePsaldoTokens - PSALDO with no brace block', () => {
  const input = [
    '#KONTO 3000 "Revenue"',
    '#PSALDO 0 202301 3000 500.00',
  ].join('\n');

  it('creates one period value', () => {
    const doc = parse(input);
    expect(doc.accounts.get('3000')!.periodValues.length).toBe(1);
  });

  it('stores the correct value', () => {
    const doc = parse(input);
    expect(doc.accounts.get('3000')!.periodValues[0].value).toBe(500);
  });
});
