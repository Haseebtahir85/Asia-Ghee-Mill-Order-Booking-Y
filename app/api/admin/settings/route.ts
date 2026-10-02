import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

// Always read live data from the database — never a copy frozen at build time
// (otherwise a renamed/deleted town or a changed rate keeps showing the old value).
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// GET /api/admin/settings — all settings
export async function GET() {
  const { data, error } = await supabaseServer.from("settings").select("key, value").order("key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

// PATCH /api/admin/settings — body: { key: string, value: string }
export async function PATCH(req: NextRequest) {
  const { key, value } = await req.json();

  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("settings")
    .upsert({ key, value: String(value) })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ setting: data });
}
