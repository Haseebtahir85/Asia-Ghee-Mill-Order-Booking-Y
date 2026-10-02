// Destination: app/api/admin/secondary-reports/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

interface Params {
  params: { id: string };
}

// DELETE /api/admin/secondary-reports/:id — removes a filed report (its
// lines go with it), which lets that town file again for the period.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { error } = await supabaseServer.from("secondary_reports").delete().eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
