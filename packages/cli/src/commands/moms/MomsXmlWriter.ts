import type { MomsResult } from './MomsCalculator.js';

export interface MomsXmlOptions {
  orgNumber: string;
  period: string;
  companyName?: string;
  sniCode?: string;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function writeMomsXml(result: MomsResult, options: MomsXmlOptions): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!-- Draft format — verify against Skatteverket schema before submission -->',
    '<Momsdeklaration>',
    `  <Organisationsnummer>${escapeXml(options.orgNumber)}</Organisationsnummer>`,
    `  <Period>${escapeXml(options.period)}</Period>`,
  ];

  if (options.companyName) {
    lines.push(`  <Foretag>${escapeXml(options.companyName)}</Foretag>`);
  }

  if (options.sniCode) {
    lines.push(`  <SNI>${escapeXml(options.sniCode)}</SNI>`);
  }

  lines.push('  <Uppgifter>');
  for (const field of result.fields) {
    const amount = Math.trunc(field.amount);
    lines.push(`    <Uppgift kod="${escapeXml(field.code)}" belopp="${amount}" />`);
  }
  lines.push('  </Uppgifter>');
  lines.push('</Momsdeklaration>');

  return lines.join('\n') + '\n';
}
