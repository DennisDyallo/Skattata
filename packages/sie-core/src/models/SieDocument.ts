import { SieBookingYear } from './SieBookingYear.js';
import { SieAccount } from './SieAccount.js';
import { SieVoucher } from './SieVoucher.js';
import { SieDimension } from './SieDimension.js';

export class SieDocument {
  errors: string[] = [];
  companyName: string = '';
  organizationNumber: string = '';
  /** Format identifier, typically "PC8" for SIE 4 or "SIE5" for XML */
  format: string = 'PC8';
  bookingYears: SieBookingYear[] = [];
  vouchers: SieVoucher[] = [];
  accounts: Map<string, SieAccount> = new Map();
  dimensions: SieDimension[] = [];

  get registrationNumber(): string {
    return this.organizationNumber;
  }
}
