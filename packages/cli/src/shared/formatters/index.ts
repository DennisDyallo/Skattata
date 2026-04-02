import Table from 'cli-table3';

export type OutputFormat = 'table' | 'json' | 'csv';

function escapeCsv(v: string): string {
  return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Formats a list of rows where each row is an array of string values.
 */
export function formatRows(headers: string[], rows: string[][], fmt: OutputFormat): string {
  switch (fmt) {
    case 'json': {
      const data = rows.map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] ?? '';
        });
        return obj;
      });
      return JSON.stringify(data, null, 2);
    }

    case 'csv': {
      const lines = [headers.map(escapeCsv).join(',')];
      for (const row of rows) {
        lines.push(row.map(escapeCsv).join(','));
      }
      return lines.join('\n');
    }

    case 'table':
    default: {
      const table = new Table({ head: headers });
      for (const row of rows) {
        table.push(row);
      }
      return table.toString();
    }
  }
}

/**
 * Formats key-value pairs.
 */
export function formatKeyValue(pairs: [string, string][], fmt: OutputFormat): string {
  switch (fmt) {
    case 'json': {
      const obj: Record<string, string> = {};
      for (const [k, v] of pairs) {
        obj[k] = v;
      }
      return JSON.stringify(obj, null, 2);
    }

    case 'csv': {
      const lines = ['Key,Value'];
      for (const [k, v] of pairs) {
        lines.push(`${escapeCsv(k)},${escapeCsv(v)}`);
      }
      return lines.join('\n');
    }

    case 'table':
    default: {
      const table = new Table();
      for (const [k, v] of pairs) {
        table.push({ [k]: v });
      }
      return table.toString();
    }
  }
}
