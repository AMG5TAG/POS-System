/**
 * Minimal RFC 4180-compliant CSV parser.
 * Returns an array of objects keyed by the header row.
 * Handles quoted fields (including embedded commas and newlines), CRLF and LF.
 */
export function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  const text = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const fields = tokenize(text);
  if (fields.length === 0) return [];

  const headers = fields[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < fields.length; i++) {
    const cells = fields[i];
    if (cells.length === 0 || (cells.length === 1 && cells[0].trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cells[j] ?? "";
    }
    rows.push(obj);
  }

  return rows;
}

/**
 * Tokenize CSV text into a 2-D array of strings (rows × fields).
 */
function tokenize(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let pos = 0;

  while (pos <= text.length) {
    if (pos === text.length) {
      rows.push(row);
      row = [];   // prevent the post-loop guard from pushing the same row again
      break;
    }

    if (text[pos] === '"') {
      pos++;
      let field = "";
      while (pos < text.length) {
        if (text[pos] === '"') {
          if (text[pos + 1] === '"') {
            field += '"';
            pos += 2;
          } else {
            pos++;
            break;
          }
        } else {
          field += text[pos++];
        }
      }
      row.push(field);
      if (text[pos] === ",") pos++;
      else if (text[pos] === "\n") { rows.push(row); row = []; pos++; }
    } else {
      let field = "";
      while (pos < text.length && text[pos] !== "," && text[pos] !== "\n") {
        field += text[pos++];
      }
      row.push(field);
      if (text[pos] === ",") pos++;
      else if (text[pos] === "\n") { rows.push(row); row = []; pos++; }
    }
  }

  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * Normalise a CSV header name to a camelCase key using the supplied mapping.
 * Falls back to the original header (lowercased) if not in the map.
 */
export function normaliseHeaders(
  rawHeaders: string[],
  headerMap: Record<string, string>,
): string[] {
  return rawHeaders.map((h) => {
    const key = h.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
    return headerMap[key] ?? headerMap[h.trim().toLowerCase()] ?? h.trim();
  });
}
