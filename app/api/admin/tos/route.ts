// Destination: app/api/admin/tos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/admin/tos — all TOs (active + inactive) with their town's name, in sort order
export async function GET() {
  const { data, error } = await supabaseServer
    .from("tos")
    .select("*, towns(name)")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tos = (data ?? []).map((row: any) => {
    const { towns, ...rest } = row;
    return { ...rest, town_name: towns?.name ?? null };
  });

  return NextResponse.json({ tos });
}

// POST /api/admin/tos — add a TO. town_id is optional: leave it empty and
// the TO works for every town.
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "TO's name is required" }, { status: 400 });
  }

  let sortOrder = body.sort_order;
  if (sortOrder === undefined) {
    const { data: last } = await supabaseServer
      .from("tos")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (last?.sort_order ?? 0) + 10;
  }

  const { data, error } = await supabaseServer
    .from("tos")
    .insert({
      name: String(body.name).trim(),
      town_id: body.town_id || null,
      sort_order: sortOrder,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "This TO is already added for this town." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ to: data }, { status: 201 });
}
