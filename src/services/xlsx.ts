/**
 * Minimal, dependency-free .xlsx writer.
 *
 * Produces a real Office Open XML workbook (uncompressed ZIP container) that
 * opens in Excel, Google Sheets, LibreOffice and Numbers. It supports text,
 * numbers, currency and date columns, bold header rows, optional totals rows,
 * frozen headers, auto-filters and auto-sized columns.
 */

export type CellValue = string | number | boolean | null | undefined;

export interface SheetDefinition {
  /** Worksheet tab name (sanitised automatically, max 31 characters). */
  name: string;
  /** Header row, written in row 1. */
  headers: string[];
  /** Data rows. Each row should have the same length as `headers`. */
  rows: CellValue[][];
  /** Zero-based column indexes that should use a number format with 2 decimals. */
  moneyColumns?: number[];
  /** Zero-based column indexes that contain "YYYY-MM-DD" strings. */
  dateColumns?: number[];
  /** When true the final row is rendered in bold (for totals). */
  totalsRow?: boolean;
}

const encoder = new TextEncoder();

/* ---------- CRC32 ---------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/* ---------- ZIP (stored, no compression) ---------- */

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  // 2026-01-01 00:00:00 in MS-DOS format; the exact value is irrelevant.
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    const localHeader = new Uint8Array(local.buffer);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, offset, true);

    localParts.push(localHeader, nameBytes, entry.data);
    centralParts.push(new Uint8Array(central.buffer), nameBytes);

    offset += localHeader.length + nameBytes.length + size;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  const parts = [...localParts, ...centralParts, new Uint8Array(end.buffer)];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);

  let position = 0;

  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }

  return output;
}

/* ---------- XML helpers ---------- */

function escapeXml(value: string): string {
  return value
    // Remove characters that are illegal in XML 1.0.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnLetters(index: number): string {
  let n = index + 1;
  let letters = "";

  while (n > 0) {
    const remainder = (n - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    n = Math.floor((n - 1) / 26);
  }

  return letters;
}

function sheetName(raw: string, used: Set<string>): string {
  const cleaned =
    raw.replace(/[\\/?*[\]:]/g, " ").replace(/^'+|'+$/g, "").trim() ||
    "Sheet";

  let base = cleaned.slice(0, 31);
  let candidate = base;
  let counter = 2;

  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    base = cleaned.slice(0, 31 - suffix.length);
    candidate = base + suffix;
    counter += 1;
  }

  used.add(candidate.toLowerCase());

  return candidate;
}

function dateSerial(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) return null;

  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  if (!Number.isFinite(time)) return null;

  return Math.round(time / 86400000) + 25569;
}

/* ---------- Style indexes (see styles.xml below) ---------- */

const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_MONEY = 2;
const STYLE_DATE = 3;
const STYLE_BOLD = 4;
const STYLE_BOLD_MONEY = 5;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/></numFmts>
<fonts count="2">
<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFD9EAD3"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/* ---------- Worksheet XML ---------- */

function cellXml(
  reference: string,
  value: CellValue,
  style: number,
  asDate: boolean
): string {
  const styleAttr = style ? ` s="${style}"` : "";

  if (value === null || value === undefined || value === "") {
    return style ? `<c r="${reference}"${styleAttr}/>` : "";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return `<c r="${reference}"${styleAttr}><v>${value}</v></c>`;
  }

  if (typeof value === "boolean") {
    return `<c r="${reference}"${styleAttr} t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  if (asDate) {
    const serial = dateSerial(value);

    if (serial !== null) {
      return `<c r="${reference}"${styleAttr}><v>${serial}</v></c>`;
    }
  }

  const text = escapeXml(value);
  const preserve = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : "";

  return `<c r="${reference}"${styleAttr} t="inlineStr"><is><t${preserve}>${text}</t></is></c>`;
}

function displayLength(value: CellValue, asDate: boolean): number {
  if (value === null || value === undefined) return 0;
  if (asDate) return 12;
  if (typeof value === "number") return value.toFixed(2).length + 2;
  return String(value).length;
}

function worksheetXml(sheet: SheetDefinition): string {
  const money = new Set(sheet.moneyColumns || []);
  const dates = new Set(sheet.dateColumns || []);
  const columnCount = Math.max(
    sheet.headers.length,
    ...sheet.rows.map(row => row.length)
  );

  const widths: number[] = [];

  for (let c = 0; c < columnCount; c += 1) {
    let width = displayLength(sheet.headers[c], false) + 2;

    for (const row of sheet.rows) {
      width = Math.max(width, displayLength(row[c], dates.has(c)) + 2);
    }

    widths.push(Math.min(Math.max(width, 10), 55));
  }

  const colsXml = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
    )
    .join("");

  const headerCells = sheet.headers
    .map((header, c) =>
      cellXml(`${columnLetters(c)}1`, header, STYLE_HEADER, false)
    )
    .join("");

  const lastDataIndex = sheet.rows.length - 1;

  const bodyRows = sheet.rows
    .map((row, r) => {
      const isTotals = Boolean(sheet.totalsRow) && r === lastDataIndex;
      const cells: string[] = [];

      for (let c = 0; c < columnCount; c += 1) {
        const isMoney = money.has(c);
        const isDate = dates.has(c);

        let style = STYLE_DEFAULT;

        if (isTotals) style = isMoney ? STYLE_BOLD_MONEY : STYLE_BOLD;
        else if (isMoney) style = STYLE_MONEY;
        else if (isDate) style = STYLE_DATE;

        cells.push(
          cellXml(`${columnLetters(c)}${r + 2}`, row[c], style, isDate)
        );
      }

      return `<row r="${r + 2}">${cells.join("")}</row>`;
    })
    .join("");

  const lastColumn = columnLetters(Math.max(columnCount - 1, 0));
  const lastRow = Math.max(sheet.rows.length + 1, 1);
  const filter =
    sheet.rows.length > 1 && !sheet.totalsRow
      ? `<autoFilter ref="A1:${lastColumn}${lastRow}"/>`
      : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${colsXml}</cols><sheetData><row r="1">${headerCells}</row>${bodyRows}</sheetData>${filter}</worksheet>`;
}

/* ---------- Public API ---------- */

export function buildXlsx(sheets: SheetDefinition[]): Uint8Array {
  const definitions = sheets.length
    ? sheets
    : [{ name: "Sheet1", headers: ["No data"], rows: [] }];

  const used = new Set<string>();
  const names = definitions.map(sheet => sheetName(sheet.name, used));

  const entries: ZipEntry[] = [];

  const add = (name: string, content: string) =>
    entries.push({ name, data: encoder.encode(content) });

  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${definitions
      .map(
        (_, index) =>
          `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
      .join("")}</Types>`
  );

  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
  );

  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map(
        (name, index) =>
          `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
      )
      .join("")}</sheets></workbook>`
  );

  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${definitions
      .map(
        (_, index) =>
          `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
      )
      .join("")}<Relationship Id="rId${definitions.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  );

  add("xl/styles.xml", STYLES_XML);

  definitions.forEach((sheet, index) => {
    add(`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet));
  });

  return buildZip(entries);
}
