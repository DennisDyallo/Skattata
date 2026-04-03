import type { SieDocument, SieVoucher } from '@skattata/sie-core';

/**
 * Renders a human-readable preview of a voucher before writing.
 * Shows account names (from doc.accounts), formatted amounts (Swedish locale),
 * and a balance check line.
 *
 * Example output:
 *   Verifikation A-47  2024-03-15  "Faktura 1001"
 *   ──────────────────────────────────────────────
 *   1930  Bankkonto              Debit   10 000,00
 *   3010  Försäljning            Credit  10 000,00
 *   ──────────────────────────────────────────────
 *   Balance: 0,00 SEK  ✓
 */
function formatSwedishAmount(amount: number): string {
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  // Add thousands separator (space)
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSep},${decPart}`;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function renderVoucherPreview(voucher: SieVoucher, doc: SieDocument): string {
  const lines: string[] = [];
  const sep = '\u2500'.repeat(62);

  const numberPart = voucher.number
    ? `${voucher.series}-${voucher.number}`
    : voucher.series;
  const datePart = formatDate(voucher.date);
  const textPart = voucher.text ? `  "${voucher.text}"` : '';

  lines.push(`  Verifikation ${numberPart}  ${datePart}${textPart}`);
  lines.push(`  ${sep}`);

  for (const row of voucher.rows) {
    const accName = doc.accounts.get(row.accountNumber)?.name ?? '';
    const direction = row.amount >= 0 ? 'Debit' : 'Credit';
    const formatted = formatSwedishAmount(row.amount);

    const accCol = row.accountNumber.padEnd(4);
    const nameCol = accName.padEnd(28);
    const dirCol = direction.padEnd(10);

    lines.push(`  ${accCol}  ${nameCol}${dirCol}${formatted.padStart(14)} SEK`);
  }

  lines.push(`  ${sep}`);

  const balance = voucher.balance;
  const balanceFormatted = formatSwedishAmount(balance);
  const balanceOk = Math.abs(balance) < 0.005;
  const checkMark = balanceOk
    ? '\u2713'
    : `\u2717 (diff: ${balanceFormatted} SEK)`;

  lines.push(`  Balance: ${balanceFormatted} SEK  ${checkMark}`);

  return lines.join('\n');
}
