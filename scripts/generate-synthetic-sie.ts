#!/usr/bin/env bun
/**
 * Generate synthetic SIE test files with CP437 encoding.
 * These files have known expected outputs for verifying CLI financial statement commands.
 */
import iconv from "iconv-lite";
import { join } from "path";

const outDir = join(import.meta.dir, "../sie_test_files/synthetic");

const files: Record<string, string> = {};

// File 1: Balanced balance sheet
files["skattata-test-balanced-annual.se"] = [
  "; skattata-test-balanced-annual.se | origin: synthetic | created: 2026-04-02 | purpose: verify balance sheet balances (totalAssets = totalEquityAndLiabilities = 150000)",
  "#FLAGGA 0",
  "#FORMAT PC8",
  "#GEN 20240101",
  "#SIETYP 1",
  '#FNAMN "Test Balanced AB"',
  "#ORGNR 556600-0001",
  "#RAR 0 20230101 20231231",
  '#KONTO 1930 "Bankkonto"',
  "#KTYP 1930 T",
  "#IB 0 1930 0.00",
  "#UB 0 1930 150000.00",
  '#KONTO 2081 "Aktiekapital"',
  "#KTYP 2081 S",
  "#IB 0 2081 0.00",
  "#UB 0 2081 -100000.00",
  '#KONTO 2099 "\u00C5rets resultat"',
  "#KTYP 2099 S",
  "#IB 0 2099 0.00",
  "#UB 0 2099 -30000.00",
  '#KONTO 2400 "Leverant\u00F6rsskulder"',
  "#KTYP 2400 S",
  "#IB 0 2400 0.00",
  "#UB 0 2400 -20000.00",
  "",
].join("\r\n");

// File 2: Income statement / P&L
files["skattata-test-income-statement.se"] = [
  "; skattata-test-income-statement.se | origin: synthetic | created: 2026-04-02 | purpose: verify P&L: revenue 100000, wages 60000, depreciation 20000, net income 20000",
  "#FLAGGA 0",
  "#FORMAT PC8",
  "#GEN 20240101",
  "#SIETYP 4",
  '#FNAMN "Test Income AB"',
  "#ORGNR 556600-0002",
  "#RAR 0 20230101 20231231",
  '#KONTO 3010 "F\u00F6rs\u00E4ljning"',
  "#KTYP 3010 I",
  "#RES 0 3010 -100000.00",
  '#KONTO 6010 "L\u00F6nekostnader"',
  "#KTYP 6010 K",
  "#RES 0 6010 60000.00",
  '#KONTO 7010 "Avskrivningar"',
  "#KTYP 7010 K",
  "#RES 0 7010 20000.00",
  '#KONTO 1930 "Bankkonto"',
  "#KTYP 1930 T",
  "#UB 0 1930 20000.00",
  '#KONTO 2099 "\u00C5rets resultat"',
  "#KTYP 2099 S",
  "#UB 0 2099 -20000.00",
  "",
].join("\r\n");

// File 3: VAT / Moms annual
files["skattata-test-moms-annual.se"] = [
  "; skattata-test-moms-annual.se | origin: synthetic | created: 2026-04-02 | purpose: verify moms: output 25000, input 10000, net payable 15000 (Field 49 = 15000)",
  "#FLAGGA 0",
  "#FORMAT PC8",
  "#GEN 20240101",
  "#SIETYP 1",
  '#FNAMN "Test Moms AB"',
  "#ORGNR 556600-0003",
  "#RAR 0 20230101 20231231",
  '#KONTO 3010 "F\u00F6rs\u00E4ljning 25% moms"',
  "#KTYP 3010 I",
  "#UB 0 3010 -100000.00",
  '#KONTO 2610 "Utg\u00E5ende moms 25%"',
  "#KTYP 2610 S",
  "#UB 0 2610 -25000.00",
  '#KONTO 2640 "Ing\u00E5ende moms"',
  "#KTYP 2640 T",
  "#UB 0 2640 10000.00",
  "",
].join("\r\n");

// File 4: SRU report
files["skattata-test-sru-report.se"] = [
  "; skattata-test-sru-report.se | origin: synthetic | created: 2026-04-02 | purpose: verify SRU aggregation: 7281=50000 (bank), 7301=50000 (equity negated), 7410=40000 (two revenue accounts)",
  "#FLAGGA 0",
  "#FORMAT PC8",
  "#GEN 20240101",
  "#SIETYP 1",
  '#FNAMN "Test SRU AB"',
  "#ORGNR 556600-0004",
  "#RAR 0 20230101 20231231",
  '#KONTO 1930 "Bankkonto"',
  "#KTYP 1930 T",
  "#SRU 1930 7281",
  "#UB 0 1930 50000.00",
  '#KONTO 2081 "Aktiekapital"',
  "#KTYP 2081 S",
  "#SRU 2081 7301",
  "#UB 0 2081 -50000.00",
  '#KONTO 3010 "F\u00F6rs\u00E4ljning"',
  "#KTYP 3010 I",
  "#SRU 3010 7410",
  "#RES 0 3010 -30000.00",
  '#KONTO 3011 "F\u00F6rs\u00E4ljning tj\u00E4nster"',
  "#KTYP 3011 I",
  "#SRU 3011 7410",
  "#RES 0 3011 -10000.00",
  "",
].join("\r\n");

// File 5: Moms period
files["skattata-test-moms-period.se"] = [
  "; skattata-test-moms-period.se | origin: synthetic | created: 2026-04-02 | purpose: verify period moms: 202301 output 12500 input 5000 net 7500, 202304 output 15000 input 6000 net 9000",
  "#FLAGGA 0",
  "#FORMAT PC8",
  "#GEN 20240101",
  "#SIETYP 2",
  '#FNAMN "Test Moms Period AB"',
  "#ORGNR 556600-0005",
  "#RAR 0 20230101 20231231",
  '#KONTO 2610 "Utg\u00E5ende moms 25%"',
  "#KTYP 2610 S",
  "#PSALDO 0 202301 2610 {} -12500.00",
  "#PSALDO 0 202304 2610 {} -15000.00",
  '#KONTO 2640 "Ing\u00E5ende moms"',
  "#KTYP 2640 T",
  "#PSALDO 0 202301 2640 {} 5000.00",
  "#PSALDO 0 202304 2640 {} 6000.00",
  "",
].join("\r\n");

// File 6: Moms refund (input VAT > output VAT)
files["skattata-test-moms-refund.se"] = [
  "; skattata-test-moms-refund.se | origin: synthetic | created: 2026-04-02 | purpose: verify moms refund scenario where input VAT (30000) exceeds output VAT (10000), Field 49 = -20000 (Skatteverket owes you)",
  "#FLAGGA 0",
  "#FORMAT PC8",
  "#GEN 20240101",
  "#SIETYP 1",
  '#FNAMN "Test Moms Refund AB"',
  "#ORGNR 556600-0006",
  "#RAR 0 20230101 20231231",
  '#KONTO 2610 "Utg\u00E5ende moms 25%"',
  "#KTYP 2610 S",
  "#UB 0 2610 -10000.00",
  '#KONTO 2640 "Ing\u00E5ende moms"',
  "#KTYP 2640 T",
  "#UB 0 2640 30000.00",
  "",
].join("\r\n");

// Write all files with CP437 encoding
for (const [filename, content] of Object.entries(files)) {
  const filePath = join(outDir, filename);
  const encoded = iconv.encode(content, "cp437");
  await Bun.write(filePath, encoded);
  const stat = await Bun.file(filePath).stat();
  console.log(`Created: ${filename} (${stat?.size ?? "?"} bytes)`);
}

console.log("\nAll 6 synthetic SIE test files created.");
