import type { SieDocument } from '../models/SieDocument.js';
import { SieAccount } from '../models/SieAccount.js';

export interface RecalculatedAccount {
  accountId: string;
  previousClosing: number;
  newClosing: number;
}

export interface RecalculationResult {
  updatedAccounts: RecalculatedAccount[];
}

export class BalanceRecalculator {
  recalculate(doc: SieDocument): RecalculationResult {
    // Build movements map from all voucher rows
    const movements = new Map<string, number>();
    for (const voucher of doc.vouchers) {
      for (const row of voucher.rows) {
        if (!row.accountNumber) continue;
        movements.set(row.accountNumber, (movements.get(row.accountNumber) ?? 0) + row.amount);
      }
    }

    // Ensure all accounts referenced in vouchers exist in doc.accounts
    for (const accountId of movements.keys()) {
      if (!doc.accounts.has(accountId)) {
        const acc = new SieAccount();
        acc.accountId = accountId;
        acc.yearBalances = new Map();
        doc.accounts.set(accountId, acc);
      }
    }

    const updatedAccounts: RecalculatedAccount[] = [];

    for (const [accountId, acc] of doc.accounts) {
      const numId = parseInt(accountId, 10);
      const movement = movements.get(accountId) ?? 0;
      const isBalanceSheet = numId >= 1000 && numId <= 2999;

      let previousClosing: number;
      let newClosing: number;

      if (isBalanceSheet) {
        const opening = acc.yearBalances.get(0)?.opening ?? acc.openingBalance;
        previousClosing = acc.closingBalance;
        newClosing = opening + movement;
        acc.closingBalance = newClosing;
        const yearEntry = acc.yearBalances.get(0);
        if (yearEntry) {
          yearEntry.closing = newClosing;
        }
      } else {
        // Income/cost accounts (3000-8999): result = movements only
        previousClosing = acc.result;
        newClosing = movement;
        acc.result = newClosing;
        const yearEntry = acc.yearBalances.get(0);
        if (yearEntry) {
          yearEntry.result = newClosing;
        }
      }

      if (previousClosing !== newClosing) {
        updatedAccounts.push({ accountId, previousClosing, newClosing });
      }
    }

    return { updatedAccounts };
  }
}
