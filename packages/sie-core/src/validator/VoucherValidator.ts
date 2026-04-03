import type { SieDocument } from '../models/SieDocument.js';
import type { SieVoucher } from '../models/SieVoucher.js';

export interface ValidationError {
  message: string;
  /** true = blocks save; false = warning only */
  fatal: boolean;
}

export interface ValidationResult {
  /** false if any fatal errors are present */
  valid: boolean;
  errors: ValidationError[];
}

export class VoucherValidator {
  validate(voucher: SieVoucher, doc?: SieDocument): ValidationResult {
    const errors: ValidationError[] = [];

    // Hard errors (fatal)

    if (voucher.rows.length < 2) {
      errors.push({ message: 'Voucher must have at least 2 rows', fatal: true });
    }

    const balance = voucher.balance;
    if (Math.abs(balance) >= 0.005) {
      errors.push({ message: `Voucher is not balanced: sum is ${balance}`, fatal: true });
    }

    for (let i = 0; i < voucher.rows.length; i++) {
      const row = voucher.rows[i];
      if (!row.accountNumber) {
        errors.push({ message: `Row ${i + 1} has no account number`, fatal: true });
      }
      if (row.amount === 0) {
        errors.push({ message: `Row ${i + 1} has zero amount`, fatal: true });
      }
    }

    if (voucher.date.getTime() === 0 || isNaN(voucher.date.getTime())) {
      errors.push({ message: 'Voucher has no valid date', fatal: true });
    }

    if (doc) {
      // Fiscal year check
      if (voucher.date.getTime() !== 0 && !isNaN(voucher.date.getTime())) {
        const currentYear = doc.bookingYears.find((y) => y.id === 0);
        if (currentYear) {
          const vDate = voucher.date.getTime();
          if (vDate < currentYear.startDate.getTime() || vDate > currentYear.endDate.getTime()) {
            const dateStr = voucher.date.toISOString().slice(0, 10);
            const startStr = currentYear.startDate.toISOString().slice(0, 10);
            const endStr = currentYear.endDate.toISOString().slice(0, 10);
            errors.push({
              message: `Date ${dateStr} is outside fiscal year ${startStr} to ${endStr}`,
              fatal: true,
            });
          }
        }
      }

      // Duplicate voucher number
      if (voucher.series && voucher.number) {
        const duplicate = doc.vouchers.find(
          (v) => v !== voucher && v.series === voucher.series && v.number === voucher.number,
        );
        if (duplicate) {
          errors.push({
            message: `Voucher ${voucher.series}-${voucher.number} already exists`,
            fatal: true,
          });
        }
      }
    }

    // Warnings (non-fatal)

    if (doc) {
      for (let i = 0; i < voucher.rows.length; i++) {
        const row = voucher.rows[i];
        if (row.accountNumber && !doc.accounts.has(row.accountNumber)) {
          errors.push({
            message: `Account ${row.accountNumber} not found in chart of accounts`,
            fatal: false,
          });
        }
      }
    }

    if (!voucher.text) {
      errors.push({ message: 'Voucher has no description', fatal: false });
    }

    for (let i = 0; i < voucher.rows.length; i++) {
      const row = voucher.rows[i];
      if (row.amount > 1_000_000 || row.amount < -1_000_000) {
        errors.push({
          message: `Row ${i + 1}: large amount ${row.amount} — verify decimal point`,
          fatal: false,
        });
      }
    }

    return {
      valid: errors.filter((e) => e.fatal).length === 0,
      errors,
    };
  }
}
