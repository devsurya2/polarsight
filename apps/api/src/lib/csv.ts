/**
 * CSV export.
 *
 * RFC 4180 quoting, with a guard against spreadsheet formula
 * injection: a cell beginning =, +, - or @ is prefixed with an
 * apostrophe so Excel and Sheets treat it as text. Without that, an
 * exported enquiry could run a formula on the machine of whoever
 * opens the file.
 */

export function csvCell(value: unknown): string {
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (value === null || value === undefined) s = "";
  else if (Array.isArray(value)) s = value.join("; ");
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);

  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Serialises rows to CSV. `columns` fixes the order and the header
 * text; without it the keys of the first row are used.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns?: Array<{ key: string; header: string }>
): string {
  const cols =
    columns ??
    (rows[0] ? Object.keys(rows[0]).map((k) => ({ key: k, header: k })) : []);
  if (cols.length === 0) return "";

  const header = cols.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => cols.map((c) => csvCell(r[c.key])).join(","));

  // CRLF, because that is what the spec says and what Excel expects.
  return [header, ...body].join("\r\n");
}

/** `enquiries-2026-11-10.csv` */
export function exportFilename(base: string, ext: "csv" | "json"): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}
