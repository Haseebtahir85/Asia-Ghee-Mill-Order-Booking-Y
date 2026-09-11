import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { NewOrderInput } from "@/lib/types";

// GET /api/orders?status=pending&from=2026-09-01&to=2026-09-30&q=customer
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const q = searchParams.get("q");

  let query = supabaseServer
    .from("orders")
    .select("*")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);
  if (q) {
    query = query.or(
      `customer_name.ilike.%${q}%,order_number.ilike.%${q}%,origin.ilike.%${q}%,destination.ilike.%${q}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data });
}

// POST /api/orders  — create a new order
export async function POST(req: NextRequest) {
  const body = (await req.json()) as NewOrderInput;

  if (
    !body.customer_name ||
    !body.origin ||
    !body.destination ||
    body.weight_kg === undefined ||
    body.rate_per_kg === undefined
  ) {
    return NextResponse.json(
      { error: "customer_name, origin, destination, weight_kg, rate_per_kg are required" },
      { status: 400 }
    );
  }

  if (body.weight_kg <= 0) {
    return NextResponse.json({ error: "weight_kg must be greater than 0" }, { status: 400 });
  }
  if (body.rate_per_kg < 0) {
    return NextResponse.json({ error: "rate_per_kg cannot be negative" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("orders")
    .insert({
      customer_name: body.customer_name,
      customer_contact: body.customer_contact ?? null,
      origin: body.origin,
      destination: body.destination,
      weight_kg: body.weight_kg,
      rate_per_kg: body.rate_per_kg,
      extra_charges: body.extra_charges ?? 0,
      status: body.status ?? "pending",
      order_date: body.order_date ?? new Date().toISOString().slice(0, 10),
      notes: body.notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: data }, { status: 201 });
}
