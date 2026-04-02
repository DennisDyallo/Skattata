/**
 * Splits a SIE tag line into its constituent tokens using a state machine.
 *
 * Rules:
 * - Spaces inside double-quoted strings do NOT split
 * - Spaces inside `{...}` object references do NOT split
 * - All other spaces ARE split points
 * - Surrounding double-quotes are stripped from quoted tokens
 * - Empty strings produced from consecutive delimiters are dropped
 *   (but a quoted empty string `""` becomes an empty string token)
 *
 * Examples:
 *   '#FNAMN "Test Company"'              → ['#FNAMN', 'Test Company']
 *   '#KONTO 6110 "Phone and internet"'   → ['#KONTO', '6110', 'Phone and internet']
 *   '#TRANS 1910 {1 "100"} 500.00'       → ['#TRANS', '1910', '{1 "100"}', '500.00']
 *   '#VER A 1 20240101 ""'               → ['#VER', 'A', '1', '20240101', '']
 */
export function splitLine(line: string): string[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];

  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let braceDepth = 0;
  let prevCh = '';

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (ch === '"' && braceDepth === 0) {
      if (inQuote && prevCh === '\\') {
        // Escaped quote inside a quoted string — replace the preceding backslash with literal "
        current = current.slice(0, -1) + '"';
      } else {
        // Toggle quote state; keep the quote char so we can detect quoted tokens later
        inQuote = !inQuote;
        current += ch;
      }
    } else if (ch === '\\' && inQuote && i + 1 < trimmed.length && trimmed[i + 1] === '\\') {
      // Escaped backslash inside a quoted string — consume both, emit one
      current += '\\';
      i++; // skip next backslash
      prevCh = '';
      continue;
    } else if (ch === '{' && !inQuote) {
      braceDepth++;
      current += ch;
    } else if (ch === '}' && !inQuote && braceDepth > 0) {
      braceDepth--;
      current += ch;
    } else if (ch === ' ' && !inQuote && braceDepth === 0) {
      // Split point — flush current token if non-empty
      if (current.length > 0) {
        tokens.push(stripQuotes(current));
        current = '';
      }
    } else {
      current += ch;
    }
    prevCh = ch;
  }

  if (current.length > 0) {
    tokens.push(stripQuotes(current));
  }

  return tokens;
}

function stripQuotes(token: string): string {
  if (token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return token;
}
