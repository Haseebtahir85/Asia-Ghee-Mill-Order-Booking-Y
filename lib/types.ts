// Destination: lib/types.ts

export type ItemType = "ghee" | "oil" | "other";
export type OrderStatus = "pending" | "issue" | "done";
export type IconKind = "tin" | "pack" | "bucket" | "bottle" | "soap";

export interface Item {
  id: string;
  name: string;
  weight_kg: number; // per unit sold
  rate: number; // per unit sold
  type: ItemType;
  icon: IconKind | null; // explicit icon choice; falls back to name/type guessing when null
  item_number: string | null; // admin-only reference number; never sent to the public /book page
  sku_number: string | null; // admin-only SKU; never sent to the public /book page
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Town {
  id: string;
  name: string;
  group_no: number | null;
  upc: string | null;
  discount: number | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string | null;
  item_name: string;
  item_type: ItemType;
  rate: number; // per unit, snapshot at order time
  weight_kg: number; // per unit, snapshot at order time
  qty: number;
  amount: number; // generated: qty * rate
  weight_total_kg: number; // generated: qty * weight_kg
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  created_at: string;
  order_date: string;
  customer_name: string | null;
  town_id: string | null;
  town: string | null;
  total_amount: number;
  total_weight_kg: number;
  status: OrderStatus;
  notes: string | null;
  exported_at: string | null;
  // Set ONLY by the edit page's save path (town/notes/lines) — never by
  // exporting, acknowledging, flagging, or a plain status change. Do
  // NOT reuse a generic "updated_at" column for this: many tables
  // (like Item/Town above) auto-touch updated_at on every row update
  // via a trigger, which would make it fire the moment exported_at
  // itself gets written — a dedicated field sidesteps that entirely.
  content_edited_at: string | null;
  update_acknowledged_at: string | null;
  // Manual override: when set, this order shows in the New Orders tab
  // (with full checkbox/export/edit access) regardless of created_at
  // vs. the last export marker. Set/cleared via the "Add to New" /
  // "Remove from New" row button. Requires a matching DB column —
  // see the note after this file.
  flagged_new_at: string | null;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

// What the public /book page submits
export interface NewOrderInput {
  town_id: string;
  notes?: string;
  lines: {
    item_id: string;
    qty: number;
  }[];
}

// ---------------------------------------------------------------------------
// TO's Secondary Ach. Report
// ---------------------------------------------------------------------------

// A TO (territory officer). A TO can have many towns; a town belongs to only
// one TO (enforced by the to_towns table).
export interface TO {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// TO row as returned by /api/admin/tos (its towns joined in).
export interface TOWithTowns extends TO {
  towns: { id: string; name: string }[];
}

export type ReportStage = "closing_opening" | "secondary_sale" | "closing_stock";

export interface SecondaryReportLine {
  id: string;
  report_id: string;
  stage: ReportStage;
  item_id: string | null;
  item_name: string;
  item_type: string;
  item_sort: number;
  weight_kg: number; // per unit, snapshot at filing time
  qty: number;
  weight_total_kg: number; // generated: qty * weight_kg
  created_at: string;
}

export interface SecondaryReport {
  id: string;
  report_month: number; // month the admin selected (pages 2 + 3); page 1 is the month before
  report_year: number;
  town_id: string | null;
  town_name: string;
  to_id: string | null;
  to_name: string;
  created_at: string;
  secondary_report_lines?: SecondaryReportLine[];
}

// Live ON/OFF + month the admin has chosen, with the resolved periods.
export interface SecondaryReportSettingsInfo {
  enabled: boolean;
  selected_month: number; // raw admin choice, 1-12
  month: number; // period for pages 2 + 3
  year: number;
  prev_month: number; // period for page 1
  prev_year: number;
}

// What the public /book page reads from /api/secondary-report/config
export interface SecondaryReportConfig extends SecondaryReportSettingsInfo {
  tos: { id: string; name: string; town_ids: string[] }[]; // every active TO with its towns
  filed_town_ids: string[]; // towns that already filed for the open month
}
