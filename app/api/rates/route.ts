import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { RateCard } from "@/lib/types";

// GET /api/rates                         -> list all rate cards
// GET /api/rates?origin=X&destination=Y&weight=12   -> find matching rate
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");
  const weight = searchParams.get("weight");

  if (origin && destination && weight) {
    const w = parseFloat(weight);
    const { data, error } = await supabaseServer
      .from("rate_cards")
      .select("*")
      .eq("origin", origin)
      .eq("destination", destination)
      .eq("is_active", true)
      .lte("min_weight_kg", w)
      .order("effective_from", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // pick the first slab whose max_weight_kg is null (no cap) or >= weight
    const match = (data as RateCard[]).find(
      (r) => r.max_weight_kg === null || r.max_weight_kg >= w
    );

    return NextResponse.json({ rate: match ?? null });
  }

  const { data, error } = await supabaseServer
    .from("rate_cards")
    .select("*")
    .order("origin")
    .order("destination")
    .order("min_weight_kg");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rates: data });
}

// POST /api/rates — create a new rate card entry
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.origin || !body.destination || body.rate_per_kg === undefined) {
    return NextResponse.json(
      { error: "origin, destination, rate_per_kg are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseServer
    .from("rate_cards")
    .insert({
      origin: body.origin,
      destination: body.destination,
      min_weight_kg: body.min_weight_kg ?? 0,
      max_weight_kg: body.max_weight_kg ?? null,
      rate_per_kg: body.rate_per_kg,
      effective_from: body.effective_from ?? new Date().toISOString().slice(0, 10),
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rate: data }, { status: 201 });
}
