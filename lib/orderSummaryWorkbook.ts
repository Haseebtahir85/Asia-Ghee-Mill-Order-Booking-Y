// Destination: lib/orderSummaryWorkbook.ts
//
// Builds the "Summary" workbook for the admin Orders page's Summary
// button. This is a SEPARATE file from lib/ordersWorkbook.ts (which
// builds the "Soft copy" export) — different report, different
// structure, kept apart on purpose.
//
// One row per order. Columns are NOT hardcoded — they're built from
// whatever is currently in the `items` table, so adding, renaming, or
// reordering items (via sort_order) is reflected automatically without
// touching this code.
//
// Grouping: the visible category (Vanaspati Ghee / Cooking Oil / Canola
// Oil / RSO) is read from the item_number PREFIX, not the `type` column
// — `type` only distinguishes "ghee" vs "oil" vs "other", but Cooking
// Oil, Canola Oil and RSO all share type "oil" and are only told apart
// by their item_number prefix (FG-CO- / FG-CCO- / FG-RSO-).
//
// Soap never gets a quantity column — it only ever appears as a weight
// (tons) figure, same as the Weight Ghee / Weight Oil / RSO columns.
// "Weight Oil" is Cooking Oil + Canola Oil + RSO combined; the RSO
// column is that same RSO portion broken out separately for visibility
// (it's already inside Weight Oil, not added again); Total = Weight
// Ghee + Weight Oil (which already includes RSO — adding RSO a second
// time would double-count it).
import ExcelJS from "exceljs";

type PivotCategory = "ghee" | "cooking_oil" | "canola_oil" | "rso" | "soap" | "other";

const CATEGORY_LABELS: Record<PivotCategory, string> = {
  ghee: "VANASPATI GHEE",
  cooking_oil: "COOKING OIL",
  canola_oil: "CANOLA OIL",
  rso: "RSO",
  soap: "SOAP",
  other: "OTHER",
};

// Left-to-right order of the quantity-column groups. "soap" is
// deliberately excluded — it never gets quantity columns, only a
// weight figure — but "other" is included as a safety net so a future
// item that doesn't match any known prefix still gets a visible
// quantity column instead of silently disappearing.
const QUANTITY_GROUP_ORDER: PivotCategory[] = ["ghee", "cooking_oil", "canola_oil", "rso", "other"];

function categorizePivotItem(item: { type?: string | null; item_number?: string | null }): PivotCategory {
  const num = item.item_number ?? "";
  if (num.startsWith("FG-CCO-")) return "canola_oil";
  if (num.startsWith("FG-CO-")) return "cooking_oil";
  if (num.startsWith("FG-RSO-")) return "rso";
  if (num.startsWith("FG-GH-")) return "ghee";
  if (num.startsWith("FG-Soap-")) return "soap";
  // Fallback for items with an unrecognized item_number prefix — keep
  // them visible by type rather than dropping them.
  if (item.type === "ghee") return "ghee";
  if (item.type === "oil") return "cooking_oil";
  return "other";
}

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } };
const GROUP_BORDER: ExcelJS.Border = { style: "medium" };
const HEADER_UNDERLINE: ExcelJS.Border = { style: "medium" };

export function buildOrderSummaryWorkbook(orders: any[], catalogItems: any[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ASIA GHEE MILLS (Pvt.) Ltd.";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Summary");

  // Group the live catalog into display categories, each list ordered
  // by the item's own sort_order. Every item in the catalog gets a
  // column here regardless of whether any order in this export used
  // it — columns come from the catalog, not from which items happen
  // to have data, so a column is never dropped just because it's
  // empty for this particular batch.
  const itemsByCategory = new Map<PivotCategory, any[]>();
  for (const item of catalogItems) {
    const cat = categorizePivotItem(item);
    if (!itemsByCategory.has(cat)) itemsByCategory.set(cat, []);
    itemsByCategory.get(cat)!.push(item);
  }
  for (const list of itemsByCategory.values()) {
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  let col = 1;
  // Left edge of every distinct block (Sr., Town, each category group,
  // and each fixed weight column) — used after the sheet is built to
  // draw ONE clean vertical line at each block boundary, and nowhere
  // else, so items within the same category never look separated from
  // each other.
  const blockStartCols: number[] = [];

  // Adds a column that spans BOTH header rows (Sr., Town, and every
  // weight/summary column at the end) since those don't belong under
  // an item-category group.
  function addFixedColumn(label: string, width: number): number {
    blockStartCols.push(col);
    sheet.getColumn(col).width = width;
    sheet.mergeCells(1, col, 2, col);
    const cell = sheet.getCell(1, col);
    cell.value = label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = HEADER_FILL;
    const thisCol = col;
    col++;
    return thisCol;
  }

  const srCol = addFixedColumn("Sr.", 6);
  const townCol = addFixedColumn("Town", 20);

  // item_id -> its spreadsheet column, for quantity-tracked categories only
  const itemColumn = new Map<string, number>();

  for (const cat of QUANTITY_GROUP_ORDER) {
    const items = itemsByCategory.get(cat);
    if (!items || items.length === 0) continue;

    const startCol = col;
    blockStartCols.push(startCol);
    for (const item of items) {
      sheet.getColumn(col).width = 9;
      const cell = sheet.getCell(2, col);
      cell.value = item.name;
      cell.font = { bold: true, size: 9 };
      cell.alignment = { vertical: "middle", horizontal: "center", textRotation: 90, wrapText: true };
      cell.fill = HEADER_FILL;
      itemColumn.set(item.id, col);
      col++;
    }
    const endCol = col - 1;
    if (endCol > startCol) sheet.mergeCells(1, startCol, 1, endCol);
    const groupCell = sheet.getCell(1, startCol);
    groupCell.value = CATEGORY_LABELS[cat];
    groupCell.font = { bold: true, size: 10 };
    groupCell.alignment = { vertical: "middle", horizontal: "center" };
    groupCell.fill = HEADER_FILL;
  }

  const soapCol = addFixedColumn("SOAP", 10);
  const weightGheeCol = addFixedColumn("Weight Ghee", 11);
  const weightOilCol = addFixedColumn("Weight Oil", 11);
  const rsoWeightCol = addFixedColumn("RSO", 9);
  const totalCol = addFixedColumn("Total Oil, Ghee & RSO", 14);
  const lastCol = totalCol;

  sheet.getRow(1).height = 22;
  sheet.getRow(2).height = 65;

  // Every catalog item's category and weight-per-unit, for the
  // per-order rollups below (covers ALL categories, including soap —
  // unlike itemColumn, which only covers quantity-tracked ones).
  const categoryByItemId = new Map<string, PivotCategory>();
  const weightPerUnitByItemId = new Map<string, number>();
  for (const item of catalogItems) {
    categoryByItemId.set(item.id, categorizePivotItem(item));
    weightPerUnitByItemId.set(item.id, item.weight_kg ?? 0);
  }

  let rowIdx = 3;
  orders.forEach((order, i) => {
    sheet.getCell(rowIdx, srCol).value = i + 1;
    sheet.getCell(rowIdx, townCol).value = order.town ?? "";

    let gheeKg = 0;
    let oilKg = 0; // Cooking Oil + Canola Oil + RSO combined
    let rsoKg = 0; // RSO alone — a breakout of oilKg, not added again
    let soapKg = 0;

    for (const line of (order.order_items ?? []) as any[]) {
      const cat = categoryByItemId.get(line.item_id);
      const qty = line.qty ?? 0;
      const lineWeightKg = (weightPerUnitByItemId.get(line.item_id) ?? 0) * qty;

      if (cat === "ghee") gheeKg += lineWeightKg;
      if (cat === "cooking_oil" || cat === "canola_oil" || cat === "rso") oilKg += lineWeightKg;
      if (cat === "rso") rsoKg += lineWeightKg;
      if (cat === "soap") soapKg += lineWeightKg;

      const targetCol = itemColumn.get(line.item_id);
      if (targetCol) {
        const cell = sheet.getCell(rowIdx, targetCol);
        cell.value = (Number(cell.value) || 0) + qty;
      }
    }

    sheet.getCell(rowIdx, soapCol).value = Number((soapKg / 1000).toFixed(2));
    sheet.getCell(rowIdx, weightGheeCol).value = Number((gheeKg / 1000).toFixed(2));
    sheet.getCell(rowIdx, weightOilCol).value = Number((oilKg / 1000).toFixed(2));
    sheet.getCell(rowIdx, rsoWeightCol).value = Number((rsoKg / 1000).toFixed(2));
    sheet.getCell(rowIdx, totalCol).value = Number(((gheeKg + oilKg) / 1000).toFixed(2));

    rowIdx++;
  });

  const lastRow = rowIdx - 1;

  // Draw the header/group borders LAST, once every column and row is
  // known. Only two things get a line: a vertical rule at the LEFT
  // edge of each block (Sr., Town, each category group, each weight
  // column) running the full height of the sheet, and a horizontal
  // rule under row 2 separating the header from the data. Nothing
  // else gets a border, so items within the same category never look
  // separated from each other — only the block boundaries do, same as
  // the reference sheet.
  if (lastRow >= 2) {
    for (const startCol of blockStartCols) {
      for (let r = 1; r <= lastRow; r++) {
        const cell = sheet.getCell(r, startCol);
        cell.border = { ...cell.border, left: GROUP_BORDER };
      }
    }
    // Close the right edge of the table too.
    for (let r = 1; r <= lastRow; r++) {
      const cell = sheet.getCell(r, lastCol);
      cell.border = { ...cell.border, right: GROUP_BORDER };
    }
    // Underline the whole header row so it reads as a header, and cap
    // the top and bottom of the table.
    for (let c = 1; c <= lastCol; c++) {
      sheet.getCell(1, c).border = { ...sheet.getCell(1, c).border, top: GROUP_BORDER };
      sheet.getCell(2, c).border = { ...sheet.getCell(2, c).border, bottom: HEADER_UNDERLINE };
      sheet.getCell(lastRow, c).border = { ...sheet.getCell(lastRow, c).border, bottom: GROUP_BORDER };
    }
  }

  sheet.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    margins: { top: 0.5, bottom: 0.5, left: 0.3, right: 0.3, header: 0.2, footer: 0.2 },
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  sheet.views = [{ state: "frozen", xSplit: townCol, ySplit: 2 }];

  return workbook;
}