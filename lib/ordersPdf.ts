// Destination: lib/ordersPdf.ts
import PDFDocument from "pdfkit";

// Builds the "Order Book" PDF: two SEPARATE, self-contained tables per
// order (a bill/customer table and a "Provisional Order" dispatch
// table), each with its own complete header and its own DISTINCT
// summary section written as a plain label/value list — the two
// tables show different totals, not duplicates of each other:
//
//   Bill table summary: Weight (Ton), Amount, then the full six-line
//     breakdown — Weight (Ghee), Weight (Oil), Total Weight (Ton),
//     Weight (RSO), Weight (SOAP), G.Total Weight (Ton).
//   Provisional Order table summary: Weight (Ghee) / Weight (Oil) /
//     RSO / Total (Total = Ghee + Oil + RSO).
//
// FIXED at exactly 2 orders (4 tables) per A4 portrait page. Column
// widths scale to fill the page width exactly, and every row/font size
// scales UP from a compact base so the fixed 2-per-page budget is used
// productively (bigger, more legible text) rather than left as blank
// space. Dashed guide lines mark where the printed sheet should be
// cut, since each table becomes a separate physical slip.
function weightCategory(name: string, type: string): "ghee" | "oil" | "rso" | "soap" | "other" {
  const n = name.toLowerCase();
  if (n.includes("rso")) return "rso";
  if (n.includes("soap")) return "soap";
  if (type === "ghee") return "ghee";
  if (type === "oil") return "oil";
  return "other";
}

type CatalogItem = { id: string; name: string; weight_kg: number; type: string };

const ORDERS_PER_PAGE = 2;

// Compact base sizing (proportions only — actual values are scaled up
// at render time to fill exactly half the page height each).
const BASE_ROW_H = 5.3;
const BASE_HEADER_LINE_H = 7;
const HEADER_LINES = 3; // company name / order# (+ "Provisional Order" for the right table) / town+date
const BASE_PANEL_HEADER_H = 6;
const BASE_KV_ROW_H = 6;
const BASE_KV_GAP_H = 3;
const BASE_BOX_H = 16; // rounded pill box for the fraction-style totals
const BASE_FONT = {
  company: 7,
  subtitle: 6, // "Provisional Order" / bill's "Order #:" line
  dispatchOrderNo: 5.2,
  townDate: 5,
  colHeader: 5.2,
  itemRow: 5,
  kv: 5.3,
  boxNumerator: 5.6,
  boxDenominator: 4.4,
};

// Compact, fixed base column widths — proportions only; scaled up to
// fill the actual page width at render time.
const BILL_COLS = [
  { label: "Item", w: 78 },
  { label: "Qty", w: 22 },
  { label: "Rate", w: 30 },
  { label: "Amount", w: 38 },
  { label: "Type", w: 26 },
  { label: "Wt (Ton)", w: 40 },
];
const DISPATCH_COLS = [
  { label: "Item", w: 78 },
  { label: "Type", w: 26 },
  { label: "Qty", w: 22 },
  { label: "Dispatched", w: 40 },
];

export function buildOrderBookPdf(
  orders: any[],
  catalogItems: CatalogItem[],
  discountByTownId: Map<string, number>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: 20 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    const pageLeft = doc.page.margins.left;
    const pageTop = doc.page.margins.top;
    const rowGap = 20;

    // --- Horizontal scale: fill the page width exactly ---
    const rawBillW = BILL_COLS.reduce((a, c) => a + c.w, 0);
    const rawDispatchW = DISPATCH_COLS.reduce((a, c) => a + c.w, 0);
    const colGap = 20;
    const widthScale = pageWidth / (rawBillW + rawDispatchW + colGap);
    const scaledBillCols = BILL_COLS.map((c) => ({ ...c, w: c.w * widthScale }));
    const scaledDispatchCols = DISPATCH_COLS.map((c) => ({ ...c, w: c.w * widthScale }));
    const billW = scaledBillCols.reduce((a, c) => a + c.w, 0);
    const dispatchW = scaledDispatchCols.reduce((a, c) => a + c.w, 0);
    const scaledColGap = colGap * widthScale;

    // --- Vertical scale: exactly ORDERS_PER_PAGE rows fill the page
    // height, so content grows to use the space instead of leaving it
    // blank ---
    const baseHeaderH = HEADER_LINES * BASE_HEADER_LINE_H;
    const baseSlipContentH = baseHeaderH + BASE_PANEL_HEADER_H + catalogItems.length * BASE_ROW_H + 4;
    const baseBillSummaryH = BASE_KV_ROW_H + BASE_KV_GAP_H + BASE_BOX_H; // Amount line + gap + totals box
    const baseDispatchSummaryH = BASE_BOX_H; // totals box only, no Amount line
    const baseRowHeight = baseSlipContentH + Math.max(baseBillSummaryH, baseDispatchSummaryH) + 6;

    const targetRowHeight = (pageHeight - (ORDERS_PER_PAGE - 1) * rowGap) / ORDERS_PER_PAGE;
    const heightScale = targetRowHeight / baseRowHeight;

    const ROW_H = BASE_ROW_H * heightScale;
    const HEADER_LINE_H = BASE_HEADER_LINE_H * heightScale;
    const PANEL_HEADER_H = BASE_PANEL_HEADER_H * heightScale;
    const KV_ROW_H = BASE_KV_ROW_H * heightScale;
    const KV_GAP_H = BASE_KV_GAP_H * heightScale;
    const BOX_H = BASE_BOX_H * heightScale;
    const rowHeight = targetRowHeight;

    const font = {
      company: BASE_FONT.company * heightScale,
      subtitle: BASE_FONT.subtitle * heightScale,
      dispatchOrderNo: BASE_FONT.dispatchOrderNo * heightScale,
      townDate: BASE_FONT.townDate * heightScale,
      colHeader: BASE_FONT.colHeader * heightScale,
      itemRow: BASE_FONT.itemRow * heightScale,
      kv: BASE_FONT.kv * heightScale,
      boxNumerator: BASE_FONT.boxNumerator * heightScale,
      boxDenominator: BASE_FONT.boxDenominator * heightScale,
    };

    function drawKV(x: number, y: number, width: number, label: string, value: string, bold = false) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(font.kv);
      doc.text(label, x, y, { width: width * 0.62 });
      doc.font("Helvetica-Bold").fontSize(font.kv);
      doc.text(value, x + width * 0.62, y, { width: width * 0.38, align: "right" });
    }

    // Town is bold and 2pt larger than the rest of the line; Date stays
    // normal weight/size. Both drawn as one manually-centered block so
    // they still read as a single line.
    function drawTownDateLine(x: number, y: number, width: number, town: string, date: string) {
      const townText = `Town: ${town}`;
      const dateText = `    Date: ${date}`;
      doc.font("Helvetica-Bold").fontSize(font.townDate + 2);
      const townWidth = doc.widthOfString(townText);
      doc.font("Helvetica").fontSize(font.townDate);
      const dateWidth = doc.widthOfString(dateText);
      const startX = x + (width - (townWidth + dateWidth)) / 2;

      doc.font("Helvetica-Bold").fontSize(font.townDate + 2).fillColor("#555");
      doc.text(townText, startX, y, { lineBreak: false });
      doc.font("Helvetica").fontSize(font.townDate).fillColor("#555");
      doc.text(dateText, startX + townWidth, y, { lineBreak: false });
      doc.fillColor("#000");
    }

    // The rounded-pill totals box — each segment is a fraction: the
    // category name + value on top (bold italic), a short rule, then
    // "Weight ton" underneath (italic) — separated by vertical divider
    // lines, matching the reference design exactly.
    function drawTotalsBox(x: number, y: number, width: number, segments: { label: string; value: string }[]) {
      const segW = width / segments.length;
      const radius = BOX_H / 2.2;

      doc.roundedRect(x, y, width, BOX_H, radius).strokeColor("#000").lineWidth(0.75).stroke();

      segments.forEach((s, i) => {
        const segX = x + i * segW;
        const cx = segX + segW / 2;

        if (i > 0) {
          doc.moveTo(segX, y + 3).lineTo(segX, y + BOX_H - 3).strokeColor("#000").lineWidth(0.6).stroke();
        }

        const numerator = `${s.label} ${s.value}`;
        doc.font("Helvetica-BoldOblique").fontSize(font.boxNumerator);
        const numW = doc.widthOfString(numerator);
        const ruleY = y + BOX_H * 0.48;
        doc.text(numerator, cx - numW / 2, y + BOX_H * 0.14, { lineBreak: false });

        const ruleW = Math.min(segW - 10, Math.max(numW, doc.widthOfString("Weight ton")) + 4);
        doc.moveTo(cx - ruleW / 2, ruleY).lineTo(cx + ruleW / 2, ruleY).strokeColor("#000").lineWidth(0.5).stroke();

        doc.font("Helvetica-Oblique").fontSize(font.boxDenominator);
        const denomW = doc.widthOfString("Weight ton");
        doc.text("Weight ton", cx - denomW / 2, y + BOX_H * 0.58, { lineBreak: false });
      });
    }

    function drawTable(order: any, kind: "bill" | "dispatch", x: number, top: number, discount: number) {
      let y = top;
      const cols = kind === "bill" ? scaledBillCols : scaledDispatchCols;
      const width = cols.reduce((a, c) => a + c.w, 0);

      doc.font("Helvetica-Bold").fontSize(font.company).text("ASIA GHEE MILLS (Pvt.) Ltd.", x, y, { width, align: "center" });
      y += HEADER_LINE_H;
      if (kind === "dispatch") {
        doc.fontSize(font.subtitle).fillColor("#c0392b").text("Provisional Order", x, y, { width, align: "center" });
        doc.fillColor("#000");
      } else {
        doc.fontSize(font.subtitle).fillColor("#0b2b5b").text(`Order #: ${order.order_number}`, x, y, { width, align: "center" });
        doc.fillColor("#000");
      }
      y += HEADER_LINE_H;
      if (kind === "dispatch") {
        doc.font("Helvetica").fontSize(font.dispatchOrderNo).fillColor("#0b2b5b").text(`Order #: ${order.order_number}`, x, y, { width, align: "center" });
        doc.fillColor("#000");
      } else {
        drawTownDateLine(x, y, width, order.town ?? "", order.order_date);
      }
      y += HEADER_LINE_H;
      if (kind === "dispatch") {
        drawTownDateLine(x, y, width, order.town ?? "", order.order_date);
        y += HEADER_LINE_H;
      }

      const colX: number[] = [x];
      for (let i = 0; i < cols.length - 1; i++) colX.push(colX[i] + cols[i].w);

      doc.font("Helvetica-Bold").fontSize(font.colHeader);
      cols.forEach((c, i) => {
        doc.text(c.label, colX[i], y, { width: c.w, align: i === 0 ? "left" : "center" });
      });
      y += HEADER_LINE_H;
      doc.moveTo(x, y).lineTo(x + width, y).strokeColor("#0b2b5b").lineWidth(0.75).stroke();
      y += 2;

      const lineByItemId = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_id, l] as [string, any]));
      const lineByName = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_name.trim().toLowerCase(), l] as [string, any]));

      let totalAmount = 0;
      let gheeTon = 0;
      let oilTon = 0;
      let rsoTon = 0;
      let soapTon = 0;

      const itemsTop = y;

      doc.font("Helvetica").fontSize(font.itemRow);
      for (const item of catalogItems) {
        const line = lineByItemId.get(item.id) ?? lineByName.get(item.name.trim().toLowerCase());
        const qty = line ? line.qty : 0;
        const rate = line ? line.rate : 0;
        const netRate = rate - (rate * discount) / 100;
        const amount = qty * netRate;
        const weightTon = (qty * item.weight_kg) / 1000;

        if (qty > 0) {
          totalAmount += amount;
          const category = weightCategory(item.name, item.type);
          if (category === "ghee") gheeTon += weightTon;
          else if (category === "oil") oilTon += weightTon;
          else if (category === "rso") rsoTon += weightTon;
          else if (category === "soap") soapTon += weightTon;
        }

        if (kind === "bill") {
          doc.text(item.name, colX[0], y, { width: cols[0].w });
          doc.text(qty ? String(qty) : "", colX[1], y, { width: cols[1].w, align: "center" });
          doc.text(qty ? String(rate) : "", colX[2], y, { width: cols[2].w, align: "center" });
          doc.text(qty ? Math.round(amount).toLocaleString() : "", colX[3], y, { width: cols[3].w, align: "center" });
          doc.text(item.type, colX[4], y, { width: cols[4].w, align: "center" });
          doc.text(qty ? weightTon.toFixed(3) : "", colX[5], y, { width: cols[5].w, align: "center" });
        } else {
          doc.text(item.name, colX[0], y, { width: cols[0].w });
          doc.text(item.type, colX[1], y, { width: cols[1].w, align: "center" });
          doc.text(qty ? String(qty) : "", colX[2], y, { width: cols[2].w, align: "center" });
          // Dispatched intentionally left blank for manual check-off.
        }

        y += ROW_H;
      }

      // Grid lines — every row and every column boundary, like a real
      // table, not just plain text.
      const itemsBottom = y;
      doc.save();
      doc.strokeColor("#ccc").lineWidth(0.3);
      for (let r = 0; r <= catalogItems.length; r++) {
        const ly = itemsTop + r * ROW_H;
        doc.moveTo(x, ly).lineTo(x + width, ly).stroke();
      }
      const vLines = [...colX, x + width];
      for (const vx of vLines) {
        doc.moveTo(vx, itemsTop).lineTo(vx, itemsBottom).stroke();
      }
      doc.restore();

      y += 3;
      const totalTon = gheeTon + oilTon;
      const grandTotalTon = totalTon + rsoTon + soapTon;
      const provisionalTotal = gheeTon + oilTon + rsoTon;

      if (kind === "bill") {
        drawKV(x, y, width, "Amount", Math.round(totalAmount).toLocaleString(), true);
        y += KV_ROW_H + KV_GAP_H;
        drawTotalsBox(x, y, width, [
          { label: "Ghee", value: gheeTon.toFixed(3) },
          { label: "Oil", value: oilTon.toFixed(3) },
          { label: "RSO", value: rsoTon.toFixed(3) },
          { label: "Soap", value: soapTon.toFixed(3) },
          { label: "Total", value: grandTotalTon.toFixed(3) },
        ]);
      } else {
        drawTotalsBox(x, y, width, [
          { label: "Ghee", value: gheeTon.toFixed(3) },
          { label: "Oil", value: oilTon.toFixed(3) },
          { label: "RSO", value: rsoTon.toFixed(3) },
          { label: "Total", value: provisionalTotal.toFixed(3) },
        ]);
      }
    }

    for (let i = 0; i < orders.length; i += ORDERS_PER_PAGE) {
      if (i > 0) doc.addPage();
      const pageOrders = orders.slice(i, i + ORDERS_PER_PAGE);

      pageOrders.forEach((order, rowIdx) => {
        const rowTop = pageTop + rowIdx * (rowHeight + rowGap);
        const discount = discountByTownId.get(order.town_id ?? "") ?? 0;

        drawTable(order, "bill", pageLeft, rowTop, discount);
        drawTable(order, "dispatch", pageLeft + billW + scaledColGap, rowTop, discount);

        // Vertical dashed cut-line between this row's two tables.
        doc.save();
        doc.dash(3, { space: 2 }).strokeColor("#999").lineWidth(0.5);
        const cutX = pageLeft + billW + scaledColGap / 2;
        doc.moveTo(cutX, rowTop).lineTo(cutX, rowTop + rowHeight).stroke();
        doc.undash();
        doc.restore();

        // Horizontal dashed cut-line under this row (skip after the
        // last row on the page).
        if (rowIdx < pageOrders.length - 1) {
          const lineY = rowTop + rowHeight + rowGap / 2;
          doc.save();
          doc.dash(3, { space: 2 }).strokeColor("#999").lineWidth(0.5);
          doc.moveTo(pageLeft, lineY).lineTo(pageLeft + billW + scaledColGap + dispatchW, lineY).stroke();
          doc.undash();
          doc.restore();
        }
      });
    }

    doc.end();
  });
}