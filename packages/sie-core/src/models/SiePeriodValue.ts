import type { SieBookingYear } from './SieBookingYear.js';

export class SiePeriodValue {
  bookingYear: SieBookingYear | null = null;
  period: string = '';
  value: number = 0;
  quantity: number = 0;
  objects: Array<{ dimensionNumber: string; number: string }> = [];
}
