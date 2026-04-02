import type { SruReportResult } from './SruReportCalculator.js';

export interface SruFileOptions {
  form: 'INK2R' | 'INK2S' | 'NE';
  taxYear?: number;
  orgNumber?: string;
  companyName?: string;
  softwareName?: string;
}

export function writeSruFile(result: SruReportResult, options: SruFileOptions): string {
  const lines: string[] = [];
  const org = (options.orgNumber ?? result.organizationNumber ?? '').replace(/-/g, '');
  const now = new Date();
  const date = formatSruDate(now);
  const time = formatSruTime(now);
  const name = options.companyName ?? result.companyName;

  if (!org) {
    throw new Error('Organization number is required for SRU output. Add #ORGNR to the SIE file or use --org-number option.');
  }
  // Validate format: 10-digit corporate or 12-digit personnummer (digits only after stripping hyphens)
  if (!/^\d{10}$|^\d{12}$/.test(org)) {
    throw new Error(`Invalid organization number format: "${org}". Expected 10 digits (corporate) or 12 digits (personnummer, YYYYMMDDNNNN).`);
  }
  lines.push(`#BLANKETT ${options.form}`);
  const taxYear = options.taxYear ?? (new Date().getFullYear() - 1);
  lines.push(`#TAXAR ${taxYear}`);
  lines.push(`#IDENTITET ${org} ${date} ${time}`);
  if (name) lines.push(`#NAMN ${name}`);
  lines.push(`#SYSTEMINFO ${options.softwareName ?? 'skattata'} 0.1.0`);

  for (const entry of result.entries) {
    const val = formatSruValue(entry.totalAmount);
    lines.push(`#UPPGIFT ${entry.sruCode} ${val}`);
  }

  lines.push('#BLANKETTSLUT');
  lines.push('#FIL_SLUT');
  lines.push('');

  return lines.join('\r\n') + '\r\n';
}

function formatSruDate(d: Date): string {
  const y = d.getFullYear().toString();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatSruTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}${m}${s}`;
}

function formatSruValue(n: number): string {
  const t = Math.trunc(n);
  return t === 0 ? '0' : `${t}`;
}
