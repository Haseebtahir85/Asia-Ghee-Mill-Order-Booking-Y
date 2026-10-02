// Destination: app/api/admin/tos/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// POST /api/admin/tos/reorder
// Body: { order: string[] } — TO ids in their new display order.
export async function POST(req: NextRequest) {
  const { order } = (await req.json()) as { order: string[] };

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: "order must be a non-empty array of TO ids" }, { status: 400 });
  }

  const results = await Promise.all(
    order.map((id, index) =>
      supabaseServer
        .from("tos")
        .update({ sort_order: (index + 1) * 10 })
        .eq("id", id)
    )
  );
  const failed = results.find((r) => r.error);

  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
