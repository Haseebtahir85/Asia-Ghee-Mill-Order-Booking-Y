// Destination: lib/ordersPdf.ts
import PDFDocument from "pdfkit";

// Builds the "Order Book" PDF matching your actual template exactly:
// two SEPARATE, self-contained tables per order (a bill/customer table
// and a "Provisional Order" dispatch table), each with its own
// complete header, compact/natural column widths (not stretched to
// fill the page), and its own DISTINCT summary section written as a
// plain label/value list (not a horizontal stat bar) — the two tables
// show different totals, not duplicates of each other:
//
//   Bill table summary: Weight (Ton), Amount, then the full six-line
//     breakdown — Weight (Ghee), Weight (Oil), Total Weight (Ton),
//     Weight (RSO), Weight (SOAP), G.Total Weight (Ton).
//   Provisional Order table summary: a compact 2x2 grid — Weight
//     (Ghee) / RSO on one row, Weight (Oil) / Total on the next
//     (Total = Ghee + Oil + RSO).
//
// Every table lists the full catalog (blank rows for items not
// ordered on this order), and dashed guide lines mark where the
// printed sheet should be cut, since each table becomes a separate
// physical slip.
function weightCategory(name: string, type: string): "ghee" | "oil" | "rso" | "soap" | "other" {
  const n = name.toLowerCase();
  if (n.includes("rso")) return "rso";
  if (n.includes("soap")) return "soap";
  if (type === "ghee") return "ghee";
  if (type === "oil") return "oil";
  return "other";
}

type CatalogItem = { id: string; name: string; weight_kg: number; type: string };

const ROW_H = 5.6;
const HEADER_LINE_H = 8;
const HEADER_LINES = 3; // company name / order# (+ "Provisional Order" for the right table) / town+date
const PANEL_HEADER_H = 7;
const KV_ROW_H = 6.5;
const KV_GAP_H = 4;

// Compact, fixed column widths — matching a normal spreadsheet's
// natural width, not stretched to fill the page.
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
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 20 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    const pageLeft = doc.page.margins.left;
    const pageTop = doc.page.margins.top;

    const billW = BILL_COLS.reduce((a, c) => a + c.w, 0);
    const dispatchW = DISPATCH_COLS.reduce((a, c) => a + c.w, 0);
    const colGap = 20;

    // The bill table's summary is much taller (8 lines) than the
    // Provisional Order table's (2 lines) — the row's total height is
    // driven by the taller one; the shorter side just ends early.
    const itemRowsH = catalogItems.length * ROW_H;
    const headerH = HEADER_LINES * HEADER_LINE_H;
    const billSummaryH = KV_ROW_H * 2 + KV_GAP_H + KV_ROW_H * 6; // Weight/Amount, gap, 6-line breakdown
    const dispatchSummaryH = KV_ROW_H * 4; // Ghee / Oil / RSO / Total, one per line
    const slipContentH = headerH + PANEL_HEADER_H + itemRowsH + 4;
    const rowHeight = slipContentH + Math.max(billSummaryH, dispatchSummaryH) + 6;
    const rowGap = 14;
    const ordersPerPage = Math.max(1, Math.floor((pageHeight + rowGap) / (rowHeight + rowGap)));

    // One label/value line — plain text, no bar, no merged cells.
    function drawKV(x: number, y: number, width: number, label: string, value: string, bold = false) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(5.6);
      doc.text(label, x, y, { width: width * 0.62 });
      doc.font("Helvetica-Bold").fontSize(5.6);
      doc.text(value, x + width * 0.62, y, { width: width * 0.38, align: "right" });
    }

    function drawTable(
      order: any,
      kind: "bill" | "dispatch",
      x: number,
      top: number,
      discount: number
    ) {
      let y = top;
      const cols = kind === "bill" ? BILL_COLS : DISPATCH_COLS;
      const width = cols.reduce((a, c) => a + c.w, 0);

      doc.font("Helvetica-Bold").fontSize(7.5).text("ASIA GHEE MILLS (Pvt.) Ltd.", x, y, { width, align: "center" });
      y += HEADER_LINE_H;
      if (kind === "dispatch") {
        doc.fontSize(6.5).fillColor("#c0392b").text("Provisional Order", x, y, { width, align: "center" });
        doc.fillColor("#000");
      } else {
        doc.fontSize(6.5).fillColor("#0b2b5b").text(`Order #: ${order.order_number}`, x, y, { width, align: "center" });
        doc.fillColor("#000");
      }
      y += HEADER_LINE_H;
      if (kind === "dispatch") {
        doc.font("Helvetica").fontSize(5.5).fillColor("#0b2b5b").text(`Order #: ${order.order_number}`, x, y, { width, align: "center" });
        doc.fillColor("#000");
      } else {
        doc.font("Helvetica").fontSize(5.2).fillColor("#555").text(`Town: ${order.town ?? ""}    Date: ${order.order_date}`, x, y, { width, align: "center" });
        doc.fillColor("#000");
      }
      y += HEADER_LINE_H;
      if (kind === "dispatch") {
        doc.font("Helvetica").fontSize(5.2).fillColor("#555").text(`Town: ${order.town ?? ""}    Date: ${order.order_date}`, x, y, { width, align: "center" });
        doc.fillColor("#000");
        y += HEADER_LINE_H;
      }

      const colX: number[] = [x];
      for (let i = 0; i < cols.length - 1; i++) colX.push(colX[i] + cols[i].w);

      doc.font("Helvetica-Bold").fontSize(5.5);
      cols.forEach((c, i) => {
        doc.text(c.label, colX[i], y, { width: c.w, align: i === 0 ? "left" : "center" });
      });
      y += 7;
      doc.moveTo(x, y).lineTo(x + width, y).strokeColor("#0b2b5b").lineWidth(0.75).stroke();
      y += 2;

      const lineByItemId = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_id, l] as [string, any]));
      const lineByName = new Map<string, any>((order.order_items as any[]).map((l: any) => [l.item_name.trim().toLowerCase(), l] as [string, any]));

      let totalAmount = 0;
      let gheeTon = 0;
      let oilTon = 0;
      let rsoTon = 0;
      let soapTon = 0;

      doc.font("Helvetica").fontSize(5.2);
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

      y += 3;
      const totalTon = gheeTon + oilTon;
      const grandTotalTon = totalTon + rsoTon + soapTon;
      const provisionalTotal = gheeTon + oilTon + rsoTon;

      if (kind === "bill") {
        drawKV(x, y, width, "Weight (Ton)", grandTotalTon.toFixed(3), true);
        y += KV_ROW_H;
        drawKV(x, y, width, "Amount", Math.round(totalAmount).toLocaleString(), true);
        y += KV_ROW_H + KV_GAP_H;
        drawKV(x, y, width, "Weight (Ghee)", gheeTon.toFixed(3));
        y += KV_ROW_H;
        drawKV(x, y, width, "Weight (Oil)", oilTon.toFixed(3));
        y += KV_ROW_H;
        drawKV(x, y, width, "Total Weight (Ton)", totalTon.toFixed(3), true);
        y += KV_ROW_H;
        drawKV(x, y, width, "Weight (RSO)", rsoTon.toFixed(3));
        y += KV_ROW_H;
        drawKV(x, y, width, "Weight (SOAP)", soapTon.toFixed(3));
        y += KV_ROW_H;
        drawKV(x, y, width, "G.Total Weight (Ton)", grandTotalTon.toFixed(3), true);
      } else {
        drawKV(x, y, width, "Weight (Ghee)", gheeTon.toFixed(3));
        y += KV_ROW_H;
        drawKV(x, y, width, "Weight (Oil)", oilTon.toFixed(3));
        y += KV_ROW_H;
        drawKV(x, y, width, "RSO", rsoTon.toFixed(3));
        y += KV_ROW_H;
        drawKV(x, y, width, "Total", provisionalTotal.toFixed(3), true);
      }
    }

    for (let i = 0; i < orders.length; i += ordersPerPage) {
      if (i > 0) doc.addPage();
      const pageOrders = orders.slice(i, i + ordersPerPage);

      pageOrders.forEach((order, rowIdx) => {
        const rowTop = pageTop + rowIdx * (rowHeight + rowGap);
        const discount = discountByTownId.get(order.town_id ?? "") ?? 0;

        drawTable(order, "bill", pageLeft, rowTop, discount);
        drawTable(order, "dispatch", pageLeft + billW + colGap, rowTop, discount);

        // Vertical dashed cut-line between this row's two tables.
        doc.save();
        doc.dash(3, { space: 2 }).strokeColor("#999").lineWidth(0.5);
        const cutX = pageLeft + billW + colGap / 2;
        doc.moveTo(cutX, rowTop).lineTo(cutX, rowTop + rowHeight).stroke();
        doc.undash();
        doc.restore();

        // Horizontal dashed cut-line under this row (skip after the
        // last row on the page).
        if (rowIdx < pageOrders.length - 1) {
          const lineY = rowTop + rowHeight + rowGap / 2;
          doc.save();
          doc.dash(3, { space: 2 }).strokeColor("#999").lineWidth(0.5);
          doc.moveTo(pageLeft, lineY).lineTo(pageLeft + billW + colGap + dispatchW, lineY).stroke();
          doc.undash();
          doc.restore();
        }
      });
    }

    doc.end();
  });
}