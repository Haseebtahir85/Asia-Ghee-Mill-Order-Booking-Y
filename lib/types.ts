export type OrderStatus =
  | "pending"
  | "confirmed"
  | "dispatched"
  | "delivered"
  | "cancelled";

export interface Order {
  id: string;
  order_number: string;
  customer_name: string;
  customer_contact: string | null;
  origin: string;
  destination: string;
  weight_kg: number;
  rate_per_kg: number;
  extra_charges: number;
  total_amount: number;
  status: OrderStatus;
  order_date: string; // ISO date
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RateCard {
  id: string;
  origin: string;
  destination: string;
  min_weight_kg: number;
  max_weight_kg: number | null;
  rate_per_kg: number;
  effective_from: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NewOrderInput {
  customer_name: string;
  customer_contact?: string;
  origin: string;
  destination: string;
  weight_kg: number;
  rate_per_kg: number;
  extra_charges?: number;
  status?: OrderStatus;
  order_date?: string;
  notes?: string;
}
