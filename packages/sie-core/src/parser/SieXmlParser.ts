import { SieDocument } from '../models/SieDocument.js';
import { SieAccount } from '../models/SieAccount.js';
import { SieVoucher } from '../models/SieVoucher.js';
import { SieVoucherRow } from '../models/SieVoucherRow.js';
import { SieDimension } from '../models/SieDimension.js';
import { SieObject } from '../models/SieObject.js';
import { SieBookingYear } from '../models/SieBookingYear.js';
import { XMLParser } from 'fast-xml-parser';

/**
 * Parses SIE 5 XML format files.
 *
 * Handles two root variants found in the wild:
 *   <Sie>          — full export format (FileInfo + Accounts + Journal)
 *   <SieEntry>     — import format, used by some software (Company + FinancialYear + Journal)
 */
export class SieXmlParser {
  private readonly parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      removeNSPrefix: true,
      isArray: (name) =>
        [
          'Account',
          'FiscalYear',
          'Journal',
          'JournalEntry',
          'LedgerEntry',
          'FinancialYear',
          'Dimension',
          'Object',
          'OpeningBalance',
          'ClosingBalance',
        ].includes(name),
    });
  }

  parse(content: string): SieDocument {
    const doc = new SieDocument();
    doc.format = 'SIE5';

    let parsed: Record<string, unknown>;
    try {
      parsed = this.parser.parse(content) as Record<string, unknown>;
    } catch (err) {
      doc.errors.push(`XML parse error: ${(err as Error).message}`);
      return doc;
    }

    // Detect which root variant we have
    if (parsed['Sie']) {
      this.parseSieRoot(parsed['Sie'] as Record<string, unknown>, doc);
    } else if (parsed['SieEntry']) {
      this.parseSieEntryRoot(parsed['SieEntry'] as Record<string, unknown>, doc);
    } else {
      // Try to find SieEntry as a child of the root element
      const rootKey = Object.keys(parsed).find(k => k !== '?xml' && k !== '!doctype');
      if (rootKey) {
        const rootContent = parsed[rootKey] as Record<string, unknown>;
        if (rootContent?.['SieEntry']) {
          this.parseSieEntryRoot(rootContent['SieEntry'] as Record<string, unknown>, doc);
        } else {
          doc.errors.push('Could not find <Sie> or <SieEntry> root element in XML.');
        }
      } else {
        doc.errors.push('Could not find a root element in XML.');
      }
    }

    return doc;
  }

  // ── <Sie> variant ──────────────────────────────────────────────────────────

  private parseSieRoot(sie: Record<string, unknown>, doc: SieDocument): void {
    // Company info from FileInfo/Company
    const fileInfo = sie['FileInfo'] as Record<string, unknown> | undefined;
    if (fileInfo) {
      const company = fileInfo['Company'] as Record<string, unknown> | undefined;
      if (company) {
        doc.companyName = String(company['name'] ?? '');
        doc.organizationNumber = String(company['organizationId'] ?? '');
      }

      // Fiscal years
      const fiscalYears = fileInfo['FiscalYears'] as Record<string, unknown> | undefined;
      if (fiscalYears) {
        const fyList = this.asArray(fiscalYears['FiscalYear']);
        for (let idx = 0; idx < fyList.length; idx++) {
          const fy = fyList[idx] as Record<string, unknown>;
          const year = new SieBookingYear();
          year.id = idx;
          year.startDate = this.parseMonthDate(String(fy['start'] ?? ''));
          year.endDate = this.parseMonthDateEnd(String(fy['end'] ?? ''));
          doc.bookingYears.push(year);
        }
      }
    }

    // Accounts
    const accounts = sie['Accounts'] as Record<string, unknown> | undefined;
    if (accounts) {
      const accountList = this.asArray(accounts['Account']);
      for (const acct of accountList) {
        const a = acct as Record<string, unknown>;
        const acc = new SieAccount();
        acc.accountId = String(a['id'] ?? '');
        acc.name = String(a['name'] ?? '');
        // type: "asset" -> T, "liability"/"equity" -> S, "income" -> I, "cost"/"expense" -> K
        acc.type = this.mapAccountType(String(a['type'] ?? ''));

        // Opening / closing balances (may be arrays or single objects)
        const obList = this.asArray(a['OpeningBalance']);
        if (obList.length > 0) {
          const ob = obList[obList.length - 1] as Record<string, unknown>;
          acc.openingBalance = this.parseFloat(ob['amount']);
        }
        const cbList = this.asArray(a['ClosingBalance']);
        if (cbList.length > 0) {
          const cb = cbList[cbList.length - 1] as Record<string, unknown>;
          acc.closingBalance = this.parseFloat(cb['amount']);
        }

        if (acc.accountId) doc.accounts.set(acc.accountId, acc);
      }
    }

    // Journals (may be array or single)
    const journals = this.asArray(sie['Journal']);
    for (const journal of journals) {
      const j = journal as Record<string, unknown>;
      const journalId = String(j['id'] ?? '');
      const journalName = String(j['name'] ?? '');
      const entries = this.asArray(j['JournalEntry']);
      for (const entry of entries) {
        const e = entry as Record<string, unknown>;
        const voucher = new SieVoucher();
        voucher.series = journalId;
        voucher.number = String(e['id'] ?? '');
        voucher.date = this.parseDateStr(String(e['journalDate'] ?? '')) ?? new Date(0);
        voucher.text = String(e['text'] ?? '');

        const ledgerEntries = this.asArray(e['LedgerEntry']);
        for (const le of ledgerEntries) {
          const l = le as Record<string, unknown>;
          const row = new SieVoucherRow();
          row.accountNumber = String(l['accountId'] ?? '');
          row.amount = this.parseFloat(l['amount']);
          row.rowText = String(l['text'] ?? l['description'] ?? '');
          row.transactionDate = this.parseDateStr(String(l['entryDate'] ?? '')) ?? voucher.date;
          voucher.rows.push(row);
        }

        doc.vouchers.push(voucher);
      }
    }
  }

  // ── <SieEntry> variant ─────────────────────────────────────────────────────

  private parseSieEntryRoot(entry: Record<string, unknown>, doc: SieDocument): void {
    // Company
    const company = entry['Company'] as Record<string, unknown> | undefined;
    if (company) {
      doc.companyName = String(company['Name'] ?? '');
      doc.organizationNumber = String(company['CorporateIdentityNumber'] ?? '');
    }

    // Financial years contain accounts and dimensions
    const fyList = this.asArray(entry['FinancialYear']);
    for (let idx = 0; idx < fyList.length; idx++) {
      const fy = fyList[idx] as Record<string, unknown>;
      const year = new SieBookingYear();
      year.id = idx;
      year.startDate = this.parseDateStr(String(fy['StartDate'] ?? '')) ?? new Date(0);
      year.endDate = this.parseDateStr(String(fy['EndDate'] ?? '')) ?? new Date(0);
      doc.bookingYears.push(year);

      this.parseSieEntryAccounts(fy['Accounts'], doc);
      this.parseSieEntryDimensions(fy['Dimensions'], doc);
    }

    // Journal
    const journalEl = entry['Journal'] as Record<string, unknown> | undefined;
    if (journalEl) {
      const journalEntries = this.asArray(journalEl['JournalEntry']);
      for (const je of journalEntries) {
        const e = je as Record<string, unknown>;
        const voucher = new SieVoucher();
        voucher.series = String(e['journalId'] ?? '');
        voucher.number = String(e['entryNumber'] ?? '');
        voucher.date = this.parseDateStr(String(e['entryDate'] ?? '')) ?? new Date(0);
        voucher.text = String(e['description'] ?? '');

        const ledgerEntries = this.asArray(e['LedgerEntry']);
        for (const le of ledgerEntries) {
          const l = le as Record<string, unknown>;
          const row = new SieVoucherRow();
          row.accountNumber = String(l['accountId'] ?? '');
          row.amount = this.parseFloat(l['amount']);
          row.rowText = String(l['description'] ?? '');
          row.transactionDate = this.parseDateStr(String(l['entryDate'] ?? '')) ?? voucher.date;

          // Dimension references on ledger rows
          const dims = (l['Dimensions'] as Record<string, unknown> | undefined);
          if (dims) {
            const dimList = this.asArray(dims['Dimension']);
            for (const d of dimList) {
              const dim = d as Record<string, unknown>;
              const obj = new SieObject();
              obj.dimensionNumber = String(dim['dimensionId'] ?? '');
              obj.number = String(dim['objectId'] ?? '');
              row.objects.push(obj);
            }
          }

          voucher.rows.push(row);
        }

        doc.vouchers.push(voucher);
      }
    }
  }

  private parseSieEntryAccounts(accountsEl: unknown, doc: SieDocument): void {
    if (!accountsEl) return;
    const list = this.asArray((accountsEl as Record<string, unknown>)['Account']);
    for (const a of list) {
      const el = a as Record<string, unknown>;
      const acc = new SieAccount();
      acc.accountId = String(el['accountId'] ?? '');
      acc.name = String(el['description'] ?? '');
      acc.openingBalance = this.parseFloat((el['OpeningBalance'] as Record<string, unknown>)?.['amount']);
      acc.closingBalance = this.parseFloat((el['ClosingBalance'] as Record<string, unknown>)?.['amount']);
      if (acc.accountId) doc.accounts.set(acc.accountId, acc);
    }
  }

  private parseSieEntryDimensions(dimensionsEl: unknown, doc: SieDocument): void {
    if (!dimensionsEl) return;
    const list = this.asArray((dimensionsEl as Record<string, unknown>)['Dimension']);
    for (const d of list) {
      const el = d as Record<string, unknown>;
      const dim = new SieDimension();
      dim.number = String(el['dimensionId'] ?? '');
      dim.name = String(el['description'] ?? '');

      const objects = this.asArray(el['Object']);
      for (const o of objects) {
        const oel = o as Record<string, unknown>;
        const obj = new SieObject();
        obj.dimensionNumber = dim.number;
        obj.number = String(oel['objectId'] ?? '');
        obj.name = String(oel['description'] ?? '');
        dim.objects.set(obj.number, obj);
      }

      doc.dimensions.push(dim);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Ensure a value is always an array (fast-xml-parser may give object or array) */
  private asArray(val: unknown): unknown[] {
    if (val === undefined || val === null) return [];
    if (Array.isArray(val)) return val;
    return [val];
  }

  private parseFloat(val: unknown): number {
    if (val === undefined || val === null || val === '') return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
  }

  private parseDateStr(val: string | undefined): Date | null {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  /** Parse "YYYY-MM" month string → start of that month */
  private parseMonthDate(val: string): Date {
    if (!val) return new Date(0);
    // val may be "2013-01" or "2013-01-01"
    const parts = val.split('-');
    const y = parseInt(parts[0] ?? '0', 10);
    const m = parseInt(parts[1] ?? '1', 10) - 1;
    const d = parseInt(parts[2] ?? '1', 10);
    return new Date(y, m, d);
  }

  /** Parse "YYYY-MM" month string → end of that month (last day) */
  private parseMonthDateEnd(val: string): Date {
    if (!val) return new Date(0);
    const parts = val.split('-');
    const y = parseInt(parts[0] ?? '0', 10);
    const m = parseInt(parts[1] ?? '1', 10) - 1;
    // First day of next month, minus one day
    return new Date(y, m + 1, 0);
  }

  /** Map SIE 5 XML account type string to BAS type code */
  private mapAccountType(xmlType: string): SieAccount['type'] {
    switch (xmlType.toLowerCase()) {
      case 'asset': return 'T';
      case 'equity':
      case 'liability': return 'S';
      case 'income': return 'I';
      case 'cost':
      case 'expense': return 'K';
      default: return '';
    }
  }
}

export async function parseSie5File(filePath: string): Promise<SieDocument> {
  const text = await Bun.file(filePath).text();
  return new SieXmlParser().parse(text);
}
