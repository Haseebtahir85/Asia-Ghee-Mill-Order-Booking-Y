// Destination: app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// GET /api/admin/orders — filterable list for the admin Orders page.
// Query params (all optional): status, town_id, from (YYYY-MM-DD), to (YYYY-MM-DD)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const townId = searchParams.get("town_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabaseServer.from("orders").select("*").order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (townId) query = query.eq("town_id", townId);
  if (from) query = query.gte("order_date", from);
  if (to) query = query.lte("order_date", to);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: data });
}

// DELETE /api/admin/orders — bulk hard-delete.
// Body: { ids: string[] }
// Backs both the per-row "Delete" button (ids.length === 1) and the
// "Delete Selected" / "Delete All (filtered)" button (ids.length > 1) —
// same call either way, just a different ids array from the client.
//
// order_items rows are removed first because they carry a foreign key
// to orders.id; if that FK isn't set to ON DELETE CASCADE in your schema,
// deleting the parent order first would fail (or silently orphan rows,
// depending on the constraint). Deleting children first is safe either way.
export async function DELETE(req: NextRequest) {
  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const ids = body.ids;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string" && id.trim())) {
    return NextResponse.json({ error: "ids must be a non-empty array of order id strings" }, { status: 400 });
  }

  // De-dupe defensively — a caller sending the same id twice shouldn't
  // change behavior or the reported deleted count.
  const uniqueIds = Array.from(new Set(ids));

  // Remove line items belonging to these orders first.
  const { error: itemsError } = await supabaseServer
    .from("order_items")
    .delete()
    .in("order_id", uniqueIds);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  // select() on the delete makes Supabase return the rows it actually
  // removed, so the response can report how many orders were deleted —
  // useful if some ids in the request no longer existed (already deleted
  // by someone else, bad id, etc.).
  const { data, error } = await supabaseServer
    .from("orders")
    .delete()
    .in("id", uniqueIds)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deletedIds = (data ?? []).map((row) => row.id as string);
  const notFound = uniqueIds.filter((id) => !deletedIds.includes(id));

  return NextResponse.json({
    deleted: deletedIds,
    deletedCount: deletedIds.length,
    notFound, // ids that were requested but didn't match any row
  });
}