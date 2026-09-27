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