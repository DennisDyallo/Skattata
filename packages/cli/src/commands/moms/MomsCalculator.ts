import type { SieDocument } from '@skattata/sie-core';

export interface MomsField {
  code: string;           // SKV 4700 ruta number ('05', '10', etc.)
  xmlElementName: string; // eSKDUpload DTD element name
  label: string;
  amount: number;
}

export interface MomsResult {
  period?: string;
  fields: MomsField[];
  netVat: number;
  warnings: string[];
}

/**
 * Ruta-to-XML-element mapping in the exact order defined by the
 * Skatteverket eSKDUpload_6p0.dtd. This ordering MUST be respected
 * when emitting XML elements.
 *
 * Source: https://skatteverket.se/download/18.3f4496fd14864cc5ac99cb1/1415022101213/eSKDUpload_6p0.dtd
 */
export const RUTA_DEFINITIONS: ReadonlyArray<{ code: string; xmlElement: string; label: string }> = [
  { code: '05', xmlElement: 'ForsMomsEjAnnan', label: 'Taxable sales' },
  { code: '06', xmlElement: 'UttagMoms', label: 'Self-supply' },
  { code: '07', xmlElement: 'UlagMargbesk', label: 'Margin scheme base' },
  { code: '08', xmlElement: 'HyrinkomstFriv', label: 'Rental income (voluntary)' },
  { code: '20', xmlElement: 'InkopVaruAnnatEg', label: 'Goods from EU' },
  { code: '21', xmlElement: 'InkopTjanstAnnatEg', label: 'Services from EU' },
  { code: '22', xmlElement: 'InkopTjanstUtomEg', label: 'Services from outside EU' },
  { code: '23', xmlElement: 'InkopVaruSverige', label: 'Goods in Sweden (reverse charge)' },
  { code: '24', xmlElement: 'InkopTjanstSverige', label: 'Services in Sweden (reverse charge)' },
  { code: '50', xmlElement: 'MomsUlagImport', label: 'Import tax base' },
  { code: '35', xmlElement: 'ForsVaruAnnatEg', label: 'Goods sold to EU' },
  { code: '36', xmlElement: 'ForsVaruUtomEg', label: 'Goods sold outside EU (export)' },
  { code: '37', xmlElement: 'InkopVaruMellan3p', label: 'Triangulation purchases' },
  { code: '38', xmlElement: 'ForsVaruMellan3p', label: 'Triangulation sales' },
  { code: '39', xmlElement: 'ForsTjSkskAnnatEg', label: 'Services sold to EU' },
  { code: '40', xmlElement: 'ForsTjOvrUtomEg', label: 'Other services outside Sweden' },
  { code: '41', xmlElement: 'ForsKopareSkskSverige', label: 'Sales buyer liable Sweden' },
  { code: '42', xmlElement: 'ForsOvrigt', label: 'Other VAT-exempt sales' },
  { code: '10', xmlElement: 'MomsUtgHog', label: 'Output VAT 25%' },
  { code: '11', xmlElement: 'MomsUtgMedel', label: 'Output VAT 12%' },
  { code: '12', xmlElement: 'MomsUtgLag', label: 'Output VAT 6%' },
  { code: '30', xmlElement: 'MomsInkopUtgHog', label: 'Output VAT 25% on purchases' },
  { code: '31', xmlElement: 'MomsInkopUtgMedel', label: 'Output VAT 12% on purchases' },
  { code: '32', xmlElement: 'MomsInkopUtgLag', label: 'Output VAT 6% on purchases' },
  { code: '60', xmlElement: 'MomsImportUtgHog', label: 'Import output VAT 25%' },
  { code: '61', xmlElement: 'MomsImportUtgMedel', label: 'Import output VAT 12%' },
  { code: '62', xmlElement: 'MomsImportUtgLag', label: 'Import output VAT 6%' },
  { code: '48', xmlElement: 'MomsIngAvdr', label: 'Input VAT deduction' },
  { code: '49', xmlElement: 'MomsBetala', label: 'VAT to pay/receive' },
];

// Helper: look up RUTA_DEFINITIONS entry by code
function rutaDef(code: string) {
  return RUTA_DEFINITIONS.find(r => r.code === code)!;
}

// Helper: create a MomsField from a ruta code and amount
function field(code: string, amount: number): MomsField {
  const def = rutaDef(code);
  return { code, xmlElementName: def.xmlElement, label: def.label, amount };
}

export class MomsCalculator {
  calculate(doc: SieDocument, period?: string): MomsResult {
    const warnings: string[] = [];

    const sumRange = (from: number, to: number): number => {
      let total = 0;
      for (const [id, acc] of doc.accounts) {
        const num = parseInt(id, 10);
        if (isNaN(num) || num < from || num > to) continue;
        if (period) {
          const pv = acc.periodValues.find(p => p.period === period && p.objects.length === 0);
          total += pv?.value ?? 0;
        } else {
          // Balance sheet accounts (1xxx-2xxx) use closingBalance from #UB
          // Income/expense accounts (3xxx+) use result from #RES
          total += num >= 3000 ? acc.result : acc.closingBalance;
        }
      }
      return total;
    };

    // --- Section A: Sales bases (ruta 05) ---
    const salesBase = -sumRange(3000, 3999);

    // --- Section B: Output VAT on sales (ruta 10-12) ---
    // Full ranges include reverse-charge (2614/2624/2634) and import (2615/2625/2635)
    // sub-accounts. Compute those separately and subtract for domestic-only.
    const out25_full = -sumRange(2610, 2619);
    const reverseCharge25 = -sumRange(2614, 2614);
    const import25 = -sumRange(2615, 2615);
    const out25 = out25_full - reverseCharge25 - import25;

    const out12_full = -sumRange(2620, 2629);
    const reverseCharge12 = -sumRange(2624, 2624);
    const import12 = -sumRange(2625, 2625);
    const out12 = out12_full - reverseCharge12 - import12;

    const out6_full = -sumRange(2630, 2639);
    const reverseCharge6 = -sumRange(2634, 2634);
    const import6 = -sumRange(2635, 2635);
    const out6 = out6_full - reverseCharge6 - import6;

    // --- Section F: Input VAT (ruta 48) ---
    // Includes all deductible VAT: domestic (2640), reverse charge (2645-2649), etc.
    const inputVat = sumRange(2640, 2669);

    // --- Section G: Net VAT (ruta 49) ---
    // Total output = full ranges (domestic + reverse charge + import recombined)
    const totalOutput = out25_full + out12_full + out6_full;
    const netVat = totalOutput - inputVat;

    // --- Build core domestic fields (always included) ---
    const fields: MomsField[] = [
      field('05', salesBase),
      field('10', out25),
      field('11', out12),
      field('12', out6),
      field('48', inputVat),
      field('49', netVat),
    ];

    // --- Section C: EU purchase bases (ruta 20-24) ---
    const inkopVaruEU = sumRange(4500, 4519);
    const inkopTjanstEU = sumRange(4520, 4529);
    const inkopTjanstUtomEU = sumRange(4530, 4539);
    const inkopVaruSverige = sumRange(4540, 4544);
    const inkopTjanstSverige = sumRange(4549, 4559);

    // --- Section D: Output VAT on purchases / reverse charge (ruta 30-32) ---
    // Already computed above as reverseCharge25/12/6

    // --- Section E: VAT-exempt sales (ruta 35-42) ---
    const forsVaruEU = -sumRange(3100, 3199);
    const forsVaruUtomEU = -sumRange(3200, 3299);
    const forsTjEU = -sumRange(3300, 3399);

    // --- Section H-I: Import VAT (ruta 50, 60-62) ---
    const importBase = sumRange(4545, 4548);

    // Determine which optional fields have values
    const optionalFields: Array<[string, number]> = [
      ['20', inkopVaruEU],
      ['21', inkopTjanstEU],
      ['22', inkopTjanstUtomEU],
      ['23', inkopVaruSverige],
      ['24', inkopTjanstSverige],
      ['50', importBase],
      ['35', forsVaruEU],
      ['36', forsVaruUtomEU],
      ['39', forsTjEU],
      ['30', reverseCharge25],
      ['31', reverseCharge12],
      ['32', reverseCharge6],
      ['60', import25],
      ['61', import12],
      ['62', import6],
    ];

    for (const [code, amount] of optionalFields) {
      if (amount !== 0) {
        fields.push(field(code, amount));
      }
    }

    // Warnings
    if (forsVaruEU !== 0 || forsTjEU !== 0 || inkopVaruEU !== 0 || inkopTjanstEU !== 0) {
      warnings.push('EU transactions detected. Verify ruta 20-21 (purchase bases) and 35/39 (exempt sales) against your bookkeeping.');
    }
    if (importBase !== 0 || import25 !== 0 || import12 !== 0 || import6 !== 0) {
      warnings.push('Import VAT detected. Ruta 60-62 output VAT on imports is included in the net VAT (ruta 49). Verify import base (ruta 50) matches customs declarations.');
    }

    // Warn if exempt sales accounts (3100-3399) exist — they overlap with ruta 05
    let hasExemptRange = false;
    for (const [id] of doc.accounts) {
      const num = parseInt(id, 10);
      if (num >= 3100 && num <= 3399) { hasExemptRange = true; break; }
    }
    if (hasExemptRange) {
      warnings.push('Note: ruta 05 includes all 3xxx accounts. VAT-exempt sales (3100-3399) also appear in ruta 35/39. This is correct per SKV 4700 — ruta 05 is the total sales base, exempt sales are reported separately in section E.');
    }

    return { period, fields, netVat, warnings };
  }
}
