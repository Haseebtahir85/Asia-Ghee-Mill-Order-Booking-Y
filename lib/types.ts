export type ItemType = "ghee" | "oil" | "other";
export type OrderStatus = "pending" | "confirmed" | "dispatched" | "delivered" | "cancelled";

export interface Item {
  id: string;
  name: string;
  rate: number;
  type: ItemType;
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
  rate: number;
  qty: number;
  amount: number;
  weight_kg: number;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_contact: string | null;
  status: OrderStatus;
  order_date: string;
  notes: string | null;
  total_amount: number;
  total_weight_ghee_kg: number;
  total_weight_oil_kg: number;
  created_at: string;
  updated_at: string;
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[];
}

// What the public /book page submits
export interface NewOrderInput {
  customer_name: string;
  customer_contact?: string;
  notes?: string;
  lines: {
    item_id: string;
    qty: number;
  }[];
}
