import { describe, it, expect } from 'bun:test';
import { SieTagParser } from '../../src/parser/SieTagParser.js';
import { SieDocument } from '../../src/models/SieDocument.js';

// Helper: parse a SIE 4 string directly (avoids needing CP437 encoded files)
function parse(input: string): SieDocument {
  return new SieTagParser().parse(input);
}

// Minimal SIE 4 fixture with the most common tags
const MINIMAL_SIE = `
#FLAGGA 0
#FORMAT PC8
#FNAMN "Testbolaget AB"
#ORGNR 556789-1234
#RAR 0 20230101 20231231
#KONTO 1930 "Bankkonto"
#KONTO 3000 "Försäljning"
#KONTO 2611 "Utgående moms 25%"
#VER V 1 20230115 "Test transaktion"
{
#TRANS 1930 {} 5000.00
#TRANS 3000 {} -4000.00
#TRANS 2611 {} -1000.00
}
`.trim();

describe('SieTagParser', () => {
  describe('#FNAMN and #ORGNR', () => {
    it('parses company name', () => {
      const doc = parse('#FNAMN "Testbolaget AB"');
      expect(doc.companyName).toBe('Testbolaget AB');
    });

    it('parses organization number', () => {
      const doc = parse('#ORGNR 556789-1234');
      expect(doc.organizationNumber).toBe('556789-1234');
    });

    it('parses both together', () => {
      const doc = parse('#FNAMN "Acme AB"\n#ORGNR 123456-7890');
      expect(doc.companyName).toBe('Acme AB');
      expect(doc.organizationNumber).toBe('123456-7890');
    });
  });

  describe('#FORMAT', () => {
    it('parses format tag', () => {
      const doc = parse('#FORMAT PC8');
      expect(doc.format).toBe('PC8');
    });
  });

  describe('#RAR — booking years', () => {
    it('parses a single booking year', () => {
      const doc = parse('#RAR 0 20230101 20231231');
      expect(doc.bookingYears).toHaveLength(1);
      const year = doc.bookingYears[0];
      expect(year.id).toBe(0);
      expect(year.startDate.getFullYear()).toBe(2023);
      expect(year.startDate.getMonth()).toBe(0); // January
      expect(year.startDate.getDate()).toBe(1);
      expect(year.endDate.getFullYear()).toBe(2023);
      expect(year.endDate.getMonth()).toBe(11); // December
      expect(year.endDate.getDate()).toBe(31);
    });

    it('parses multiple booking years', () => {
      const doc = parse('#RAR 0 20230101 20231231\n#RAR -1 20220101 20221231');
      expect(doc.bookingYears).toHaveLength(2);
      expect(doc.bookingYears[0].id).toBe(0);
      expect(doc.bookingYears[1].id).toBe(-1);
    });
  });

  describe('#KONTO — accounts', () => {
    it('parses a simple account', () => {
      const doc = parse('#KONTO 1930 "Bankkonto"');
      expect(doc.accounts.size).toBe(1);
      const acc = doc.accounts.get('1930');
      expect(acc).toBeDefined();
      expect(acc!.accountId).toBe('1930');
      expect(acc!.name).toBe('Bankkonto');
    });

    it('parses multiple accounts', () => {
      const doc = parse('#KONTO 1930 "Bank"\n#KONTO 3000 "Försäljning"');
      expect(doc.accounts.size).toBe(2);
    });

    it('parses account with spaces in name', () => {
      const doc = parse('#KONTO 6110 "Phone and internet"');
      expect(doc.accounts.get('6110')?.name).toBe('Phone and internet');
    });
  });

  describe('#KTYP — account types', () => {
    it('assigns type T (Tillgång) to an account', () => {
      const doc = parse('#KONTO 1010 "Aktiverade egna utg"\n#KTYP 1010 T');
      expect(doc.accounts.get('1010')?.type).toBe('T');
    });

    it('assigns type S (Skuld)', () => {
      const doc = parse('#KONTO 2400 "Leverantörsskulder"\n#KTYP 2400 S');
      expect(doc.accounts.get('2400')?.type).toBe('S');
    });

    it('assigns type I (Intäkt)', () => {
      const doc = parse('#KONTO 3000 "Försäljning"\n#KTYP 3000 I');
      expect(doc.accounts.get('3000')?.type).toBe('I');
    });

    it('assigns type K (Kostnad)', () => {
      const doc = parse('#KONTO 5000 "Lokalkostnader"\n#KTYP 5000 K');
      expect(doc.accounts.get('5000')?.type).toBe('K');
    });

    it('ignores #KTYP for unknown account', () => {
      // Should not throw, should have no errors
      const doc = parse('#KTYP 9999 T');
      expect(doc.errors).toHaveLength(0);
    });
  });

  describe('#SRU — SRU codes', () => {
    it('assigns SRU code to an account', () => {
      const doc = parse('#KONTO 1010 "Balanserade utgifter"\n#SRU 1010 7201');
      expect(doc.accounts.get('1010')?.sruCode).toBe('7201');
    });
  });

  describe('#DIM and #OBJEKT — dimensions and objects', () => {
    it('parses a dimension', () => {
      const doc = parse('#DIM 1 "Kostnadsställe"');
      expect(doc.dimensions).toHaveLength(1);
      expect(doc.dimensions[0].number).toBe('1');
      expect(doc.dimensions[0].name).toBe('Kostnadsställe');
    });

    it('parses objects within a dimension', () => {
      const doc = parse('#DIM 1 "Kostnadsställe"\n#OBJEKT 1 100 "Stockholm"\n#OBJEKT 1 200 "Göteborg"');
      const dim = doc.dimensions[0];
      expect(dim.objects.size).toBe(2);
      expect(dim.objects.get('100')?.name).toBe('Stockholm');
      expect(dim.objects.get('200')?.name).toBe('Göteborg');
    });

    it('handles #OBJECT alias (some files use this)', () => {
      const doc = parse('#DIM 1 "Avdelning"\n#OBJECT 1 10 "Sälj"');
      expect(doc.dimensions[0].objects.get('10')?.name).toBe('Sälj');
    });

    it('ignores #OBJEKT for unknown dimension', () => {
      const doc = parse('#OBJEKT 99 100 "Unknown"');
      expect(doc.errors).toHaveLength(0);
    });
  });

  describe('#IB / #UB / #RES — balances', () => {
    const setup = `#KONTO 1510 "Kundfordringar"\n#RAR 0 20230101 20231231`;

    it('parses opening balance (#IB)', () => {
      const doc = parse(`${setup}\n#IB 0 1510 10000.00`);
      expect(doc.accounts.get('1510')?.openingBalance).toBe(10000);
    });

    it('parses closing balance (#UB)', () => {
      const doc = parse(`${setup}\n#UB 0 1510 12500.50`);
      expect(doc.accounts.get('1510')?.closingBalance).toBe(12500.5);
    });

    it('parses result (#RES)', () => {
      const doc = parse(`${setup}\n#RES 0 1510 -5000.00`);
      expect(doc.accounts.get('1510')?.result).toBe(-5000);
    });

    it('ignores balance for unknown account', () => {
      const doc = parse('#IB 0 9999 1000.00');
      expect(doc.errors).toHaveLength(0);
    });

    it('handles negative balances', () => {
      const doc = parse(`${setup}\n#UB 0 1510 -3500.50`);
      expect(doc.accounts.get('1510')?.closingBalance).toBe(-3500.5);
    });
  });

  describe('#OIB / #OUB — object balances', () => {
    const setup = `#KONTO 1510 "Kundfordringar"\n#DIM 1 "Kund"\n#OBJEKT 1 100 "Kund A"`;

    it('parses object opening balance (#OIB)', () => {
      const doc = parse(`${setup}\n#OIB 0 1510 {1 100} 5000.00`);
      const obj = doc.dimensions[0].objects.get('100');
      expect(obj?.openingBalance).toBe(5000);
    });

    it('parses object closing balance (#OUB)', () => {
      const doc = parse(`${setup}\n#OUB 0 1510 {1 100} 7500.00`);
      const obj = doc.dimensions[0].objects.get('100');
      expect(obj?.closingBalance).toBe(7500);
    });
  });

  describe('#PSALDO — period balances', () => {
    const setup = '#KONTO 3000 "Försäljning"\n#RAR 0 20230101 20231231';

    it('parses period balance with empty objects', () => {
      const doc = parse(`${setup}\n#PSALDO 0 202301 3000 {} 15000.00`);
      const acc = doc.accounts.get('3000');
      expect(acc?.periodValues).toHaveLength(1);
      expect(acc?.periodValues[0].period).toBe('202301');
      expect(acc?.periodValues[0].value).toBe(15000);
    });

    it('links period value to booking year', () => {
      const doc = parse(`${setup}\n#PSALDO 0 202301 3000 {} 15000.00`);
      const pv = doc.accounts.get('3000')?.periodValues[0];
      expect(pv?.bookingYear?.id).toBe(0);
    });

    it('parses multiple period values', () => {
      const doc = parse(`${setup}\n#PSALDO 0 202301 3000 {} 5000.00\n#PSALDO 0 202302 3000 {} 8000.00`);
      expect(doc.accounts.get('3000')?.periodValues).toHaveLength(2);
    });

    it('handles PSALDO quirk: element 4 contains "{} balance" joined', () => {
      // Simulate what happens when some parsers produce element 4 = "{} 6000"
      // This is handled by normalizePsaldoTokens
      const doc = parse(`${setup}\n#PSALDO 0 202301 3000 {} -6000.00`);
      expect(doc.accounts.get('3000')?.periodValues[0]?.value).toBe(-6000);
    });
  });

  describe('#VER — vouchers', () => {
    it('parses a basic voucher with transactions', () => {
      const doc = parse(MINIMAL_SIE);
      expect(doc.vouchers).toHaveLength(1);
      const v = doc.vouchers[0];
      expect(v.series).toBe('V');
      expect(v.number).toBe('1');
      expect(v.text).toBe('Test transaktion');
      expect(v.date.getFullYear()).toBe(2023);
      expect(v.date.getMonth()).toBe(0); // January
      expect(v.date.getDate()).toBe(15);
    });

    it('parses #TRANS rows inside a voucher', () => {
      const doc = parse(MINIMAL_SIE);
      const v = doc.vouchers[0];
      expect(v.rows).toHaveLength(3);
      expect(v.rows[0].accountNumber).toBe('1930');
      expect(v.rows[0].amount).toBe(5000);
      expect(v.rows[1].accountNumber).toBe('3000');
      expect(v.rows[1].amount).toBe(-4000);
    });

    it('transaction rows inherit voucher date when no explicit date', () => {
      const doc = parse(MINIMAL_SIE);
      const row = doc.vouchers[0].rows[0];
      expect(row.transactionDate.getTime()).toBe(doc.vouchers[0].date.getTime());
    });

    it('parses voucher with registration date and sign', () => {
      const input = '#KONTO 1930 "Bank"\n#VER V 1 20230115 "Text" 20230116 "SIGN"\n{\n#TRANS 1930 {} 100.00\n}';
      const doc = parse(input);
      expect(doc.vouchers[0].registrationDate?.getDate()).toBe(16);
      expect(doc.vouchers[0].registrationSign).toBe('SIGN');
    });

    it('parses voucher with empty text', () => {
      const input = '#VER A 5 20230301 ""\n{\n#TRANS 1930 {} 1000.00\n}';
      const doc = parse(input);
      expect(doc.vouchers[0].text).toBe('');
      expect(doc.vouchers[0].series).toBe('A');
    });

    it('parses multiple vouchers', () => {
      const input = `
#KONTO 1930 "Bank"
#VER V 1 20230101 "First"
{
#TRANS 1930 {} 100.00
}
#VER V 2 20230201 "Second"
{
#TRANS 1930 {} 200.00
}`.trim();
      const doc = parse(input);
      expect(doc.vouchers).toHaveLength(2);
      expect(doc.vouchers[0].number).toBe('1');
      expect(doc.vouchers[1].number).toBe('2');
    });

    it('parses #TRANS row with explicit transaction date and text', () => {
      const input = '#VER V 1 20230115 "V"\n{\n#TRANS 1930 {} 500.00 20230116 "Detalj"\n}';
      const doc = parse(input);
      const row = doc.vouchers[0].rows[0];
      expect(row.transactionDate.getDate()).toBe(16);
      expect(row.rowText).toBe('Detalj');
    });

    it('parses #TRANS with object references', () => {
      const input = '#DIM 1 "Projekt"\n#OBJEKT 1 100 "P1"\n#VER V 1 20230115 "T"\n{\n#TRANS 3000 {1 100} -5000.00\n}';
      const doc = parse(input);
      const row = doc.vouchers[0].rows[0];
      expect(row.objects).toHaveLength(1);
      expect(row.objects[0].dimensionNumber).toBe('1');
      expect(row.objects[0].number).toBe('100');
    });

    it('parses #TRANS with multiple object references', () => {
      const input = '#VER V 1 20230101 "T"\n{\n#TRANS 3000 {1 "100" 2 "200"} -1000.00\n}';
      const doc = parse(input);
      const row = doc.vouchers[0].rows[0];
      expect(row.objects).toHaveLength(2);
      expect(row.objects[0].dimensionNumber).toBe('1');
      expect(row.objects[0].number).toBe('100');
      expect(row.objects[1].dimensionNumber).toBe('2');
      expect(row.objects[1].number).toBe('200');
    });

    it('ignores #BTRANS and #RTRANS without crashing', () => {
      // These should be parsed like #TRANS
      const input = '#KONTO 1930 "Bank"\n#VER V 1 20230101 "T"\n{\n#BTRANS 1930 {} 100.00\n#RTRANS 1930 {} -100.00\n}';
      const doc = parse(input);
      expect(doc.vouchers[0].rows).toHaveLength(2);
    });
  });

  describe('SieCallbacks', () => {
    it('readVoucher callback receives each voucher', () => {
      const received: string[] = [];
      const input = `
#VER A 1 20230101 "First"
{
#TRANS 1930 {} 100.00
}
#VER A 2 20230201 "Second"
{
#TRANS 1930 {} 200.00
}`.trim();
      new SieTagParser().parse(input, {
        readVoucher: (v) => { received.push(v.text); return true; },
      });
      expect(received).toEqual(['First', 'Second']);
    });

    it('returning false from readVoucher stops processing', () => {
      const received: string[] = [];
      const input = `
#VER A 1 20230101 "First"
{
#TRANS 1930 {} 100.00
}
#VER A 2 20230201 "Second"
{
#TRANS 1930 {} 200.00
}`.trim();
      const doc = new SieTagParser().parse(input, {
        readVoucher: (v) => { received.push(v.text); return false; },
      });
      expect(received).toHaveLength(1);
      // readVoucher fires before the voucher is pushed, so returning false means zero vouchers stored
      expect(doc.vouchers).toHaveLength(0);
    });
  });

  describe('unknown tags', () => {
    it('silently drops unknown tags', () => {
      const doc = parse('#FLAGGA 0\n#PROGRAM "Acme" 1.0\n#SIETYP 4\n#GEN 20230101\n#KPTYP EUBAS97');
      expect(doc.errors).toHaveLength(0);
    });

    it('does not error on blank lines or comments', () => {
      const doc = parse('\n\n#FNAMN "Test"\n\n');
      expect(doc.errors).toHaveLength(0);
      expect(doc.companyName).toBe('Test');
    });
  });

  describe('full integration fixture', () => {
    it('parses MINIMAL_SIE without errors', () => {
      const doc = parse(MINIMAL_SIE);
      expect(doc.errors).toHaveLength(0);
    });

    it('has correct counts from MINIMAL_SIE', () => {
      const doc = parse(MINIMAL_SIE);
      expect(doc.accounts.size).toBe(3);
      expect(doc.bookingYears).toHaveLength(1);
      expect(doc.vouchers).toHaveLength(1);
      expect(doc.vouchers[0].rows).toHaveLength(3);
    });

    it('voucher balance sums to zero (double-entry)', () => {
      const doc = parse(MINIMAL_SIE);
      const balance = doc.vouchers[0].rows.reduce((s, r) => s + r.amount, 0);
      expect(Math.abs(balance)).toBeLessThan(0.001);
    });
  });

  describe('SIE 5 XML detection', () => {
    it('returns an error doc when content starts with <?xml (use SieXmlParser instead)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<Sie xmlns="http://www.sie.se/sie5">
  <FileInfo>
    <Company organizationId="123" name="XML Corp" />
  </FileInfo>
</Sie>`;
      const doc = new SieTagParser().parse(xml);
      expect(doc).toBeDefined();
      expect(doc.format).toBe('SIE5');
      expect(doc.errors.length).toBeGreaterThan(0);
    });
  });
});
