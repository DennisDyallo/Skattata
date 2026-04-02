import { SiePeriodValue } from './SiePeriodValue.js';

export type SieAccountType = 'T' | 'S' | 'I' | 'K' | '';

export class SieAccount {
  accountId: string = '';
  name: string = '';
  unit: string = '';
  /** Account type from #KTYP tag: T=Tillgång, S=Skuld, I=Intäkt, K=Kostnad */
  type: SieAccountType = '';
  sruCode: string = '';
  periodValues: SiePeriodValue[] = [];
  objectValues: SiePeriodValue[] = [];
  openingBalance: number = 0;
  closingBalance: number = 0;
  balance: number = 0;
  quantity: number = 0;
  result: number = 0;
}
