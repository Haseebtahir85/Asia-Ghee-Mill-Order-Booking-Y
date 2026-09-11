import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// POST /api/admin/items/reorder
// Body: { order: string[] }  — item ids in their new display order.
// Assigns sort_order = 10, 20, 30... in the order given, so there's
// always room to insert an item between two others later.
export async function POST(req: NextRequest) {
  const { order } = (await req.json()) as { order: string[] };

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: "order must be a non-empty array of item ids" }, { status: 400 });
  }

  const updates = order.map((id, index) =>
    supabaseServer
      .from("items")
      .update({ sort_order: (index + 1) * 10 })
      .eq("id", id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);

  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
