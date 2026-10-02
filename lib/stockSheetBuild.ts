// Destination: lib/stockSheetBuild.ts
// Server-side. Rebuilds a stock sheet Excel file from the saved rows, in the same
// layout as the "Town wise Closing Stock Report" the admin uploads (same
// columns B..V, same headers, same formulas). Used for the Download button when
// no copy of the original file was kept.
import * as XLSX from "xlsx";
import { colLetter } from "@/lib/stockSheetParse";

export interface BuildRow {
  row_no?: number;
  sheet_to_name: string;
  sheet_towns: string | null;
  opening_ghee: number | null;
  opening_oil: number | null;
  opening_rso: number | null;
  primary_ghee: number | null;
  primary_oil: number | null;
  primary_rso: number | null;
  secondary_ghee: number | null;
  secondary_oil: number | null;
  secondary_rso: number | null;
  remarks: string | null;
}

const serial = (year: number, month: number) => Date.UTC(year, month - 1, 1) / 86400000 + 25569;
const num = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));

export function buildStockSheetBuffer(rows: BuildRow[], month: number, year: number): Buffer {
  const ws: XLSX.WorkSheet = {};
  const put = (addr: string, cell: XLSX.CellObject) => {
    ws[addr] = cell;
  };
  const text = (addr: string, v: string) => put(addr, { t: "s", v });
  const number = (addr: string, v: number) => put(addr, { t: "n", v });
  const formula = (addr: string, f: string, v: number) => put(addr, { t: "n", f, v });
  const dateCell = (addr: string, s: number) => put(addr, { t: "n", v: s, z: "dd-mmm-yy" });

  // columns (0-based): B=1 #, C=2 TO Names, D=3 hidden, E=4 Towns, F..I opening, J..M primary, N..Q secondary, R..U closing, V remarks
  const L = colLetter;
  const OPEN = 5, PRIM = 9, SEC = 13, CLOSE = 17, REMARKS = 21;

  text("B2", "TOWN WISE CLOSING STOCK REPORT ");

  const nextMonth = month === 12 ? { m: 1, y: year + 1 } : { m: month + 1, y: year };
  const groups: [number, string][] = [
    [OPEN, "Closing Stock (Tons)"],
    [PRIM, "Primary Achvmnt (Tons)"],
    [SEC, "Secondary Achvmnt (Tons)"],
    [CLOSE, "Closing Stock (Tons)"],
  ];
  for (const [c, label] of groups) text(`${L(c)}3`, label);

  dateCell(`${L(OPEN)}4`, serial(year, month)); // opening date: the 1st of the month
  dateCell(`${L(PRIM)}4`, serial(nextMonth.y, nextMonth.m)); // closing date: the 1st of the next month
  formula(`${L(SEC)}4`, `${L(PRIM)}4`, serial(nextMonth.y, nextMonth.m));
  formula(`${L(CLOSE)}4`, `${L(SEC)}4`, serial(nextMonth.y, nextMonth.m));

  text("B5", "#");
  text("C5", "TO Names");
  text("D5", "TO Name");
  text("E5", "Towns");
  for (const start of [OPEN, PRIM, SEC, CLOSE]) {
    ["Ghee", "Oil", "RSO", "Total"].forEach((h, i) => text(`${L(start + i)}5`, h));
  }
  text(`${L(REMARKS)}5`, "Remarks");

  rows.forEach((r, i) => {
    const n = 6 + i;
    if (i === 0) number(`B${n}`, 1);
    else formula(`B${n}`, `B${n - 1}+1`, i + 1);
    text(`C${n}`, r.sheet_to_name);
    if (r.sheet_towns) text(`E${n}`, r.sheet_towns);

    const open = [num(r.opening_ghee), num(r.opening_oil), num(r.opening_rso)];
    const prim = [num(r.primary_ghee), num(r.primary_oil), num(r.primary_rso)];
    const sec = [num(r.secondary_ghee), num(r.secondary_oil), num(r.secondary_rso)];
    const close = [open[0] + prim[0] - sec[0], open[1] + prim[1] - sec[1], open[2] + prim[2] - sec[2]];
    const sum = (a: number[]) => a[0] + a[1] + a[2];

    // opening: only the values the file had (blank stays blank, like the original)
    [r.opening_ghee, r.opening_oil, r.opening_rso].forEach((v, k) => {
      if (v !== null && v !== undefined) number(`${L(OPEN + k)}${n}`, Number(v));
    });
    formula(`${L(OPEN + 3)}${n}`, `SUM(${L(OPEN)}${n}:${L(OPEN + 2)}${n})`, sum(open));

    prim.forEach((v, k) => number(`${L(PRIM + k)}${n}`, v));
    formula(`${L(PRIM + 3)}${n}`, `SUM(${L(PRIM)}${n}:${L(PRIM + 2)}${n})`, sum(prim));

    sec.forEach((v, k) => number(`${L(SEC + k)}${n}`, v));
    formula(`${L(SEC + 3)}${n}`, `SUM(${L(SEC)}${n}:${L(SEC + 2)}${n})`, sum(sec));

    // the sheet's formula:  Closing = Opening + Primary - Secondary
    close.forEach((v, k) => formula(`${L(CLOSE + k)}${n}`, `${L(OPEN + k)}${n}+${L(PRIM + k)}${n}-${L(SEC + k)}${n}`, v));
    formula(`${L(CLOSE + 3)}${n}`, `SUM(${L(CLOSE)}${n}:${L(CLOSE + 2)}${n})`, sum(close));

    if (r.remarks) text(`${L(REMARKS)}${n}`, r.remarks);
  });

  const lastRow = 5 + rows.length;
  ws["!ref"] = `A1:${L(REMARKS)}${lastRow}`;
  ws["!cols"] = [
    { wch: 2 },
    { wch: 5 },
    { wch: 24 },
    { wch: 26, hidden: true }, // D: "TO Name" — hidden in the original file too
    { wch: 30 },
    ...Array.from({ length: 16 }, () => ({ wch: 11 })),
    { wch: 24 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock Sheet");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true }) as Buffer;
}
