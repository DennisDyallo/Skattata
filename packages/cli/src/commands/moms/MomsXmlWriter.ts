import type { MomsResult } from './MomsCalculator.js';
import { RUTA_DEFINITIONS } from './MomsCalculator.js';

export interface MomsXmlOptions {
  orgNumber: string;  // 10 or 12 digits (hyphens already stripped by caller)
  period: string;     // YYYYMM
}

/**
 * Format organisation number for eSKDUpload OrgNr element.
 * 10-digit corporate (NNNNNNNNNN) → prefix with "16" to make 12 digits.
 * 12-digit personnummer (YYYYMMDDNNNN) → use as-is.
 */
function formatOrgNr(orgNumber: string): string {
  const digits = orgNumber.replace(/-/g, '');
  if (digits.length === 10) return `16${digits}`;
  return digits;
}

/**
 * Generate Skatteverket eSKDUpload Version 6.0 XML for momsdeklaration.
 *
 * Format verified against the official DTD:
 * https://skatteverket.se/download/18.3f4496fd14864cc5ac99cb1/1415022101213/eSKDUpload_6p0.dtd
 *
 * Returns an ISO-8859-1 compatible string. The caller must write it as
 * Latin-1 bytes (charCode 0-255 maps directly to ISO-8859-1).
 */
export function writeMomsXml(result: MomsResult, options: MomsXmlOptions): string {
  const orgNr = formatOrgNr(options.orgNumber);

  const lines: string[] = [
    '<?xml version="1.0" encoding="iso-8859-1"?>',
    '<!DOCTYPE eSKDUpload PUBLIC "-//Skatteverket, Sweden//DTD Skatteverket eSKDUpload-DTD Version 6.0//SV" "https://www1.skatteverket.se/demoeskd/eSKDUpload_6p0.dtd">',
    '<eSKDUpload Version="6.0">',
    `<OrgNr>${orgNr}</OrgNr>`,
    '<Moms>',
    `<Period>${options.period}</Period>`,
  ];

  // Build a lookup from xmlElementName → truncated amount
  const fieldMap = new Map<string, number>();
  for (const f of result.fields) {
    fieldMap.set(f.xmlElementName, Math.trunc(f.amount));
  }

  // Emit elements in DTD-defined order, skipping zeros (except MomsBetala)
  for (const def of RUTA_DEFINITIONS) {
    const amount = fieldMap.get(def.xmlElement);
    if (amount === undefined) continue;
    // Always include MomsBetala (ruta 49) even if zero
    if (amount === 0 && def.code !== '49') continue;
    lines.push(`<${def.xmlElement}>${amount}</${def.xmlElement}>`);
  }

  lines.push('</Moms>');
  lines.push('</eSKDUpload>');

  return lines.join('\n') + '\n';
}
