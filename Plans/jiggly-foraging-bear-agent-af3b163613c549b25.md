# Review: NE Default SRU Mapping Plan

Reviewer: Engineer Agent
Plan: `jiggly-foraging-bear.md`
Research: `jiggly-foraging-bear-agent-a3e59863578567f26.md`
Calculator: `SruReportCalculator.ts`
Command: `sru-report/index.ts`

---

## Findings

### HIGH-1: B2/B3 range overlap makes first-match-wins produce wrong results for 1130-1149

The plan maps:
- 1100-1129 -> 7210 (B2)
- 1130-1149 -> 7211 (B3)
- 1150-1179 -> 7210 (B2)
- 1180-1199 -> 7211 (B3)

The research document (Section 7, "Simplified BAS Range Summary") lists:
- 1100-1149 -> 7210 (B2)
- 1130-1149 -> 7211 (B3)
- 1150-1199 -> 7210 (B2)
- 1180-1199 -> 7211 (B3)

The research itself has the same overlap problem (1130-1149 appears in both B2 and B3 rows). However, the official K1 mapping (Section 4) is clear: 1130 = Mark (B3), 1180 = Pagaende nyanlaggningar (B3). The plan's ordering is actually correct: 1100-1129 goes to B2, then 1130-1149 catches B3 before 1150-1179 goes back to B2. **The first-match-wins ordering resolves this correctly.** Downgrading to informational: the plan is correct here, but should add a comment in code explaining why the ordering matters for this specific split.

**SEVERITY: LOW** -- The ordering is correct. Recommend adding a code comment explaining the B2/B3 interleaving depends on evaluation order.

---

### HIGH-2: Accounts 2100-2399 mapped but should NOT be for K1

The plan maps:
- 2100-2199 -> 7320 (B11, untaxed reserves)
- 2200-2299 -> 7330 (B12, provisions)
- 2300-2399 -> 7380 (B13, loan debt)

The research document (Section 6) explicitly states: **"K1 does NOT use B11 (7320) or B12 (7330) -- no untaxed reserves or provisions."** The plan even acknowledges this in comments ("non-K1, included for safety").

Including B11/B12 in a mapping explicitly labeled "K1" is contradictory. If a K1 sole proprietor somehow has accounts in 2100-2299 (which shouldn't happen under forenklat arsbokslut), silently mapping them to non-K1 fields creates incorrect SRU output that Skatteverket would reject or misinterpret.

For B13 (2300-2399 -> 7380), the K1 mapping (Section 4) only lists specific accounts: 2330, 2350, 2390. The plan maps the entire 2300-2399 range, which catches accounts like 2310-2329 that may not belong on B13 under K1.

**SEVERITY: HIGH** -- Either (a) remove B11/B12 mappings and emit a warning when K1 encounters 21xx/22xx accounts, or (b) rename this mapping from "K1" to "NE general" and document the K1 vs non-K1 behavior clearly. For B13, narrowing to the documented K1 accounts (2330-2399) would be safer, though the broader range is unlikely to cause real problems.

---

### HIGH-3: Accounts 2400-2599 liability classification is questionable

The plan maps:
- 2400-2449 -> 7382 (B15, accounts payable)
- 2450-2599 -> 7383 (B16, other liabilities)

The K1 mapping (Section 4) only lists:
- 2440 -> 7382 (B15, leverantorsskulder)
- 2900 -> 7383 (B16, ovriga skulder)

The plan maps the entire 2450-2599 range to B16. But accounts 2500-2599 are not mentioned in the K1 mapping at all. In the non-K1 mapping (Section 4), 26xx-29xx goes to 7383. The plan's 2450-2599 range is an interpolation that covers accounts (like 2500 personalens skatter) not explicitly in the K1 chart.

**SEVERITY: MEDIUM** -- The broader range is defensible as a pragmatic fallback, but it goes beyond what the K1 mapping documents. Add a comment noting this is an interpolation for non-K1 accounts that may appear in practice.

---

### HIGH-4: Account 2610 (output VAT) mapped to B14 (7381, tax liabilities) -- CORRECT

The reviewer instructions asked about this specifically. The research document (Section 4, K1 mapping) explicitly lists 2610 (Utg moms oreducerad) under B14/7381. VAT accounts are tax-related liabilities owed to Skatteverket, so B14 "Skatteskulder" (tax liabilities) is the correct classification. The plan's mapping of 2600-2739 to 7381 aligns with the K1 source listing accounts 2610, 2620, 2630, 2640, 2650, 2660, 2710, 2730 under B14.

**SEVERITY: NONE** -- Mapping is correct per official K1 tables.

---

### HIGH-5: 8000-8299 gap -- accounts will fall to missingCode silently

The plan maps 8300-8399 to R4 and 8400-8499 to R8, leaving 8000-8299 and 8500-8999 unmapped. The research document's non-K1 mapping shows these ranges have complex sign-dependent routing between R4 and R8.

For K1, the official mapping (Section 4) only lists 8310 and 8330 for R4, and 8410 and 8430 for R8. So the plan's ranges (8300-8399, 8400-8499) are already broader than K1 specifies.

The gap at 8000-8299 includes accounts like:
- 8000-8099: Resultat fran andelar (results from participations)
- 8100-8199: Resultat fran ovriga varaktiga vaerdepapper (results from other securities)
- 8200-8299: Resultat fran ovriga kortfristiga placeringar

These are financial items that a K1 sole proprietor is unlikely to have but could. They'll appear in `missingCode` which is the correct behavior for K1.

**SEVERITY: LOW** -- Acceptable for K1 scope. The warning about unmapped accounts is sufficient. Consider adding a stderr note when 8xxx accounts are found unmapped, specifically mentioning they may need manual classification.

---

### MEDIUM-1: Sign convention interaction with SruReportCalculator

The `SruReportCalculator` (line 34) negates revenue amounts:
```typescript
const isRevenue = acc.type === 'I' || (!acc.type && parseInt(id, 10) >= 3000 && parseInt(id, 10) <= 3999);
const amount = (isRevenue && field === 'result') ? -raw : raw;
```

The `balanceField` method (line 56) determines field by account type or number:
- Type T/S -> closingBalance
- Type I/K -> result
- No type, num <= 2999 -> closingBalance
- No type, num >= 3000 -> result

For equity (2xxx, type S), `closingBalance` is used, and no negation happens in the calculator. But the test expectations in the plan show:
- 7300 (B10, equity): 30000 (negated from -30000)

This negation must happen somewhere. Looking at the `SruFileWriter` or display logic... Actually, the test expects `totalAmount` of 30000 from JSON output. The `SruReportCalculator` returns raw `closingBalance` for type S accounts, which would be -30000 from the SIE file. The plan's test assertion expects 30000 (positive), which means it expects negation. **But `SruReportCalculator` does NOT negate equity/liability amounts** -- it only negates revenue.

This means the test assertion is wrong OR there's an assumption that equity negation happens elsewhere.

**SEVERITY: HIGH** -- The test expects `7300.totalAmount = 30000` but `SruReportCalculator` will return `-30000` (raw closingBalance from SIE). The plan's test assertions for balance sheet equity/liability items (7300, 7382) appear to have incorrect expected values. Either the calculator needs a change (which the plan says won't happen) or the test expectations need to flip signs. Same issue applies to 7382 (B15): SIE has -10000, calculator returns -10000, test expects 10000.

**Recommendation:** Fix test expectations to match actual calculator behavior (-30000 for equity, -10000 for AP), OR acknowledge that the calculator needs a change for NE display conventions. This is a significant correctness issue that will cause test failures.

---

### MEDIUM-2: The `hasSruCodes` check was removed but the plan text is contradictory

The plan first proposes checking `hasSruCodes` (only apply defaults when NO SRU tags exist), then reverses itself ("on reflection, applying defaults even when some codes exist is more useful"). The final version always calls `applyDefaultNeSru(doc)` for NE form.

This is the correct decision -- `applyDefaultNeSru` already guards with `if (acc.sruCode) continue`. But the plan text is confusing because it shows both approaches without clearly striking out the first.

**SEVERITY: LOW** -- Clean up the plan text to only show the final decision. The implementation is correct.

---

### MEDIUM-3: Insertion point relative to existing validation

The plan says to insert the `applyDefaultNeSru` call between `parseFile()` and `SruReportCalculator().calculate()`. Looking at `index.ts`:

```
Line 65: const doc = await parseFile(file);
Line 67: const result = new SruReportCalculator().calculate(doc, yearId);
Line 70: if (options.form?.toLowerCase() === 'ne') {
Line 71:   if (result.entries.length === 0) { ... process.exit(1) }
```

The default mapping must run BEFORE line 67 (calculate). The plan correctly identifies this. After the mapping is applied, the calculator will pick up the new sruCodes and produce entries, so the `result.entries.length === 0` check on line 71 becomes a true edge case (only fires when the file has literally zero accounts in any mapped range).

**SEVERITY: NONE** -- Integration point is correct. The existing validation on line 70-78 becomes a safety net rather than the primary error path.

---

### MEDIUM-4: R1/R2 ambiguity for 3700-3999

The plan defaults 3700-3999 to R1 (7400, VAT-liable). The research document notes these ranges can go to either R1 or R2, with the comment "R1/R2 (accounting software decides)."

The plan says "A warning is emitted" but the warning text in the `console.warn` only mentions the 3700-3999 default in passing: `'Mapping follows BAS Forenklat arsbokslut (K1). Accounts 3700-3999 default to R1 (VAT-liable).'`

For a K1 sole proprietor, 3700 (lamnade rabatter) and 3900 (ovriga rorelseintakter) are uncommon. Defaulting to R1 is pragmatic. But accounts like 3970 (vinst vid avyttring) and 3980 (erhallna bidrag) are specifically listed as R2 in the K1 mapping.

**SEVERITY: MEDIUM** -- Consider splitting: 3700-3899 -> R1 (default), 3900-3999 -> R2 (more conservative, since 3970/3980 are explicitly R2 in K1). Alternatively, keep the current approach but strengthen the warning.

---

### MEDIUM-5: Missing 3300-3499 range justification

The plan maps 3300-3499 -> 7401 (R2, VAT-exempt). The K1 mapping (Section 4) doesn't list any accounts in 3300-3499. The non-K1 mapping includes 30xx-37xx as shared R1/R2. Mapping 3300-3499 to R2 is an assumption without K1 source backing.

**SEVERITY: MEDIUM** -- Document the rationale. If no K1 accounts exist in this range, leaving it unmapped (falling to missingCode) would be safer than guessing.

---

### MEDIUM-6: 7000-7699 range includes non-employee accounts

The plan maps 7000-7699 -> 7502 (R7, employee expenses). The K1 mapping lists 7000, 7300, 7400, 7500, 7600.

However, BAS 7300 in the income statement context is "kostnadsersattningar och formaner" (expense reimbursements), not the equity range (which is also 7300 in the balance sheet but covered by the SRU code 7300). There's no collision because 7000-7699 are income statement accounts (field = result) and 2000-2099 are balance sheet (field = closingBalance). The SRU code 7502 is fine.

But accounts 7010-7099 include "Kontant bruttoloner" while 7100-7299 includes things like "Loner till foretagsledare" and "Tantiem." These all go to R7 correctly.

**SEVERITY: NONE** -- The mapping is correct for the full 7000-7699 range.

---

### HIGH-6: Missing scope item -- README section

The user explicitly requested a README section on "what this repo WILL NOT DO" and "WHO IT IS INTENDED FOR." The plan does not mention this at all. The plan's "Files to Create/Modify" table lists CLAUDE.md updates but no README changes.

**SEVERITY: HIGH** -- The plan is incomplete. Add a section for creating/updating README.md with the requested scope and audience documentation.

---

### LOW-1: Test file encoding

The synthetic test file `skattata-test-ne-no-sru.se` uses Swedish characters without encoding markers. The `SieTagParser` expects CP437 encoding. The test file content shown in the plan uses ASCII-safe Swedish (e.g., "Forsaljning" not "Forsaljning"). This is fine -- existing synthetic test files follow the same pattern.

**SEVERITY: NONE** -- No issue.

---

### LOW-2: Test math error in the plan

The plan calculates expected schablonavdrag as:
- "Net income = 200000 - 50000 - 50000 + 1000 = 101000"
- "Schablonavdrag: Math.trunc(101000 * 0.25) = 25250"

But the cost breakdown is: 50000 (varuinkop) + 30000 (lokalhyra) + 5000 (tele) + 15000 (ovriga) = 100000 (not 50000). So costs = 100000, net = 200000 + 1000 - 100000 = 101000. The math is actually correct despite the confusing intermediate step.

However, the test file header comment says "R43: 25000 (100000 net x 0.25)" which contradicts the corrected calculation of 25250.

**SEVERITY: LOW** -- Fix the comment to match the actual calculation. The E2E test doesn't assert on 7714 value anyway (it just checks presence).

---

### LOW-3: No unit test for `applyDefaultNeSru` function itself

The plan only proposes E2E tests. There's no unit test for the `applyDefaultNeSru` function in isolation -- e.g., testing that:
- Existing sruCode is preserved
- Non-numeric account IDs are skipped
- Accounts outside all ranges get no code
- The return count is accurate

**SEVERITY: MEDIUM** -- Add unit tests for `applyDefaultNeSru` directly. E2E tests are good for integration but won't pinpoint failures in the mapping logic. A unit test with a mock SieDocument would catch mapping errors faster.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| HIGH | 3 | H2 (K1 includes non-K1 B11/B12), H5 (sign convention in tests), H6 (missing README section) |
| MEDIUM | 4 | M1 (sign convention), M4 (R1/R2 for 3700-3999), M5 (3300-3499 unjustified), L3 (no unit tests) |
| LOW | 3 | H1 (B2/B3 comment), M2 (plan text contradiction), L2 (math comment) |

### Top 3 actions before implementation:

1. **Fix test expectations for equity/liability sign conventions** (HIGH-5/MEDIUM-1). The calculator does not negate equity. Either adjust test expectations to negative values, or add equity negation to the calculator (which contradicts the "no calculator changes" design).

2. **Remove or clearly isolate B11/B12 mappings** (HIGH-2). A K1 mapping should not silently produce non-K1 fields. Either omit them and warn, or make K1/non-K1 a parameter.

3. **Add the README section** (HIGH-6). The user explicitly requested this and it's not in the plan.
