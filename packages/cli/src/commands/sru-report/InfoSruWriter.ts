import type { SruReportResult } from './SruReportCalculator.js';

/**
 * Writes the info.sru companion file required for a full Skatteverket SRU submission.
 * The blanketter.sru file (form data) is written by SruFileWriter.
 * info.sru identifies the submitting company (§3 SKV 269).
 */
export function writeInfoSru(result: SruReportResult, options?: { orgNumber?: string; companyName?: string }): string {
  const org = (options?.orgNumber ?? result.organizationNumber ?? '').replace(/-/g, '');
  const name = options?.companyName ?? result.companyName ?? '';

  if (!org) {
    throw new Error('Organization number is required for info.sru. Add #ORGNR to the SIE file or use --org-number option.');
  }
  if (!/^\d{10}$|^\d{12}$/.test(org)) {
    throw new Error(`Invalid organization number format: "${org}". Expected 10 digits (corporate) or 12 digits (personnummer).`);
  }

  const now = new Date();
  const date = formatDate(now);
  const time = formatTime(now);

  const lines: string[] = [];
  lines.push('#DATABESKRIVNING_START');
  lines.push('#PRODUKT SRU');
  lines.push('#FILNAMN BLANKETTER.SRU');
  lines.push(`#SKAPAD ${date} ${time}`);
  lines.push('#DATABESKRIVNING_SLUT');
  lines.push('#MEDIELEV_START');
  if (org) lines.push(`#ORGNR ${org}`);
  if (name) lines.push(`#NAMN ${name}`);
  lines.push('#MEDIELEV_SLUT');
  lines.push('');

  return lines.join('\r\n') + '\r\n';
}

function formatDate(d: Date): string {
  const y = d.getFullYear().toString();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return `${h}${m}${s}`;
}
