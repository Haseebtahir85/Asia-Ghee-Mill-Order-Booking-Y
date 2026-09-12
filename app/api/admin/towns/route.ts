import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// GET /api/admin/towns — all towns (active + inactive), in sort order
export async function GET() {
  const { data, error } = await supabaseServer
    .from("towns")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ towns: data });
}

// POST /api/admin/towns — add a new town
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let sortOrder = body.sort_order;
  if (sortOrder === undefined) {
    const { data: last } = await supabaseServer
      .from("towns")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (last?.sort_order ?? 0) + 10;
  }

  const { data, error } = await supabaseServer
    .from("towns")
    .insert({
      name: body.name.trim(),
      group_no: body.group_no ?? null,
      upc: body.upc ?? null,
      sort_order: sortOrder,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ town: data }, { status: 201 });
}
