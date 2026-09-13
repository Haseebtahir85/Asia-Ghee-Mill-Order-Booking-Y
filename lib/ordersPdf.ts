// Destination: lib/ordersPdf.ts
import PDFDocument from "pdfkit";

// Builds the "Order Book" PDF, matching Order_book_page.xlsx:
// - Full catalog list (every item, blank if not ordered — not just the
//   lines actually ordered) in TWO panels per bill: a customer-facing
//   panel (Item / Qty / Rate / Amount / Type / Weight (Ton)) and a
//   dispatch/loading panel (Item / Type / Qty / Dispatched, left blank
//   for hand-checkoff).
// - TWO summary tables per bill, stacked below the item panels, both
//   in the same column-divided style (label above, thin divider, value
//   below, vertical dividers between columns — no merged cells):
//     Table 1 ("simple bill"): Weight (Ghee) / Weight (Oil) /
//       Total Weight (Ton) / Weight (RSO) / Weight (SOAP) /
//       G.Total Weight (Ton)
//     Table 2 ("Provisional Order" — its own heading printed directly
//       above it): Weight (Ghee) / Weight (Oil) / RSO / Total, where
//       Total = Ghee + Oil + RSO.
// - The number of bills placed on one A4 landscape page is computed
//   from the actual bill height (header + panels + both summary
//   tables), not hardcoded — so a bill is never split across a page
//   boundary, and however many whole bills fit is however many go on
//   each page.
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
const HEADER_H = 24; // company name + order # + town/date lines
const PANEL_HEADER_H = 7; // column header row + rule
const TABLE_GAP = 3;
const STAT_BAR_H = 11;
const STAT_HEADING_H = 6;
const TOTALS_LINE_H = 7;
const BOTTOM_PADDING = 5;

export function buildOrderBookPdf(
  orders: any[],
  catalogItems: CatalogItem[],
  discountByTownId: Map<string, number>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 14 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
    const left = doc.page.margins.left;

    // Bill height is the same for every bill (fixed catalog row count),
    // so compute it once and derive how many whole bills fit per page.
    const itemRowsH = catalogItems.length * ROW_H;
    const billHeight =
      HEADER_H +
      PANEL_HEADER_H +
      itemRowsH +
      TABLE_GAP +
      TOTALS_LINE_H +
      STAT_BAR_H +
      TABLE_GAP +
      STAT_HEADING_H +
      STAT_BAR_H +
      BOTTOM_PADDING;
    const billsPerPage = Math.max(1, Math.floor(pageHeight / billHeight));

    function drawBill(order: any, top: number) {
      const discount = discountByTownId.get(order.town_id ?? "") ?? 0;
      let y = top;

      // --- Header ---
      doc.font("Helvetica-Bold").fontSize(7.5).text("ASIA GHEE MILLS (Pvt.) Ltd.", left, y, { width: pageWidth, align: "center" });
      y += 9;
      doc.fontSize(7).fillColor("#0b2b5b").text(`Order #: ${order.order_number}`, left, y, { width: pageWidth, align: "center" });
      doc.fillColor("#000");
      y += 8;
      doc.font("Helvetica").fontSize(5.5).fillColor("#555").text(`Town: ${order.town ?? ""}    Date: ${order.order_date}`, left, y, { width: pageWidth, align: "center" });
      doc.fillColor("#000");
      y += 7;

      // --- Two panels side by side ---
      const leftColW = [95, 22, 30, 38, 26, 40]; // Item Qty Rate Amount Type Weight(Ton)
      const leftTotalW = leftColW.reduce((a, b) => a + b, 0);
      const gap = 14;
      const rightColW = [95, 26, 22, 40]; // Item Type Qty Dispatched
      const rightTotalW = rightColW.reduce((a, b) => a + b, 0);

      const leftX0 = left;
      const rightX0 = left + leftTotalW + gap;
      const leftColX = [leftX0];
      for (let i = 0; i < leftColW.length - 1; i++) leftColX.push(leftColX[i] + leftColW[i]);
      const rightColX = [rightX0];
      for (let i = 0; i < rightColW.length - 1; i++) rightColX.push(rightColX[i] + rightColW[i]);

      const headerY = y;
      doc.font("Helvetica-Bold").fontSize(5.5);
      ["Item", "Qty", "Rate", "Amount", "Type", "Wt (Ton)"].forEach((h, i) => {
        doc.text(h, leftColX[i], headerY, { width: leftColW[i], align: i === 0 ? "left" : "center" });
      });
      ["Item", "Type", "Qty", "Dispatched"].forEach((h, i) => {
        doc.text(h, rightColX[i], headerY, { width: rightColW[i], align: i === 0 ? "left" : "center" });
      });
      y += 7;
      doc.moveTo(leftX0, y).lineTo(leftX0 + leftTotalW, y).strokeColor("#0b2b5b").lineWidth(0.75).stroke();
      doc.moveTo(rightX0, y).lineTo(rightX0 + rightTotalW, y).strokeColor("#0b2b5b").lineWidth(0.75).stroke();
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

        doc.text(item.name, leftColX[0], y, { width: leftColW[0] });
        doc.text(qty ? String(qty) : "", leftColX[1], y, { width: leftColW[1], align: "center" });
        doc.text(qty ? String(rate) : "", leftColX[2], y, { width: leftColW[2], align: "center" });
        doc.text(qty ? Math.round(amount).toLocaleString() : "", leftColX[3], y, { width: leftColW[3], align: "center" });
        doc.text(item.type, leftColX[4], y, { width: leftColW[4], align: "center" });
        doc.text(qty ? weightTon.toFixed(3) : "", leftColX[5], y, { width: leftColW[5], align: "center" });

        doc.text(item.name, rightColX[0], y, { width: rightColW[0] });
        doc.text(item.type, rightColX[1], y, { width: rightColW[1], align: "center" });
        doc.text(qty ? String(qty) : "", rightColX[2], y, { width: rightColW[2], align: "center" });
        // Dispatched intentionally left blank for manual check-off.

        y += ROW_H;
      }

      const totalTon = gheeTon + oilTon;
      const grandTotalTon = totalTon + rsoTon + soapTon;
      const provisionalTotal = gheeTon + oilTon + rsoTon;
      const fullWidth = leftTotalW + gap + rightTotalW;

      y += 2;
      doc.font("Helvetica-Bold").fontSize(5.5);
      doc.text(`Weight (Ton): ${grandTotalTon.toFixed(3)}`, leftX0, y, { width: fullWidth / 2 });
      doc.text(`Amount: ${Math.round(totalAmount).toLocaleString()}`, leftX0 + fullWidth / 2, y, { width: fullWidth / 2, align: "right" });
      y += TOTALS_LINE_H;

      // Small helper to draw a column-divided stat bar: label above,
      // thin rule, value below, vertical dividers between cells — no
      // merged cells anywhere.
      function drawStatBar(x: number, width: number, barTop: number, stats: { label: string; value: string }[]) {
        const cellW = width / stats.length;
        doc.rect(x, barTop, width, STAT_BAR_H).strokeColor("#0b2b5b").lineWidth(0.5).stroke();
        stats.forEach((s, i) => {
          const cx = x + i * cellW;
          if (i > 0) doc.moveTo(cx, barTop).lineTo(cx, barTop + STAT_BAR_H).strokeColor("#cfd6e4").lineWidth(0.5).stroke();
          doc.font("Helvetica-Bold").fontSize(4).fillColor("#666").text(s.label, cx + 2, barTop + 1.5, { width: cellW - 4, align: "center" });
          doc.font("Helvetica-Bold").fontSize(5.6).fillColor("#0b2b5b").text(s.value, cx + 2, barTop + 7, { width: cellW - 4, align: "center" });
        });
        doc.fillColor("#000");
      }

      // --- Table 1: the "simple bill" summary (6 columns) ---
      drawStatBar(leftX0, fullWidth, y, [
        { label: "Weight (Ghee)", value: gheeTon.toFixed(3) },
        { label: "Weight (Oil)", value: oilTon.toFixed(3) },
        { label: "Total Wt (Ton)", value: totalTon.toFixed(3) },
        { label: "Weight (RSO)", value: rsoTon.toFixed(3) },
        { label: "Weight (SOAP)", value: soapTon.toFixed(3) },
        { label: "G.Total Wt (Ton)", value: grandTotalTon.toFixed(3) },
      ]);
      y += STAT_BAR_H + TABLE_GAP;

      // --- Table 2: "Provisional Order" summary (4 columns), its own
      // heading printed directly above it ---
      doc.font("Helvetica-Bold").fontSize(5.6).fillColor("#0b2b5b").text("Provisional Order", leftX0, y, { width: fullWidth, align: "center" });
      doc.fillColor("#000");
      y += STAT_HEADING_H;
      drawStatBar(leftX0, fullWidth, y, [
        { label: "Weight (Ghee)", value: gheeTon.toFixed(3) },
        { label: "Weight (Oil)", value: oilTon.toFixed(3) },
        { label: "RSO", value: rsoTon.toFixed(3) },
        { label: "Total", value: provisionalTotal.toFixed(3) },
      ]);
    }

    for (let i = 0; i < orders.length; i += billsPerPage) {
      if (i > 0) doc.addPage();
      const pageOrders = orders.slice(i, i + billsPerPage);
      pageOrders.forEach((order, idx) => {
        drawBill(order, doc.page.margins.top + idx * billHeight);
      });
    }

    doc.end();
  });
}