import { SieVoucherRow } from './SieVoucherRow.js';

export class SieVoucher {
  series: string = '';
  number: string = '';
  date: Date = new Date(0);
  text: string = '';
  registrationDate: Date | null = null;
  registrationSign: string = '';
  rows: SieVoucherRow[] = [];

  get balance(): number {
    return this.rows.reduce((sum, r) => sum + r.amount, 0);
  }
}
