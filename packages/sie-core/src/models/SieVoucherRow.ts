import { SieObject } from './SieObject.js';

export class SieVoucherRow {
  accountNumber: string = '';
  objects: SieObject[] = [];
  amount: number = 0;
  transactionDate: Date = new Date(0);
  rowText: string = '';
  quantity: number = 0;
  registrationSign: string = '';
}
