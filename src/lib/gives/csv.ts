/**
 * Small RFC 4180 CSV reader/writer (no dependencies).
 * Handles a UTF-8 BOM, quoted fields, escaped quotes (""), commas and line
 * breaks inside quotes, and LF / CRLF / CR line endings.
 */

export class CsvError extends Error {}

export function parseCsv(input: string, opts: { maxRows?: number } = {}): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let quotedField = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(quotedField ? field : field.trim());
    field = "";
    quotedField = false;
  };
  const endRow = () => {
    endField();
    // skip completely blank lines
    if (!(row.length === 1 && row[0] === "")) {
      rows.push(row);
      if (opts.maxRows && rows.length > opts.maxRows) throw new CsvError(`The file has more than ${opts.maxRows - 1} data rows.`);
    }
    row = [];
  };

  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      if (field.trim() === "") { field = ""; inQuotes = true; quotedField = true; i++; continue; }
      field += c; // stray quote inside an unquoted field: keep literally
      i++;
      continue;
    }
    if (c === ",") { endField(); i++; continue; }
    if (c === "\r") { endRow(); i += text[i + 1] === "\n" ? 2 : 1; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    if (quotedField) { i++; continue; } // characters after a closing quote are ignored (lenient)
    field += c;
    i++;
  }
  if (inQuotes) throw new CsvError("A quoted field is never closed (check for a missing \").");
  if (field !== "" || quotedField || row.length) endRow();
  return rows;
}

/** One CSV cell, quoted, with spreadsheet formula injection neutralised. */
export function csvCell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]) {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
