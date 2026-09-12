import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { supabaseServer } from "@/lib/supabase";

// POST /api/admin/items/bulk-update
// Body: multipart/form-data with a single "file" field (.xlsx, .xls, or .csv).
//
// Expected columns (header names are matched case-insensitively, and a
// few common variants are accepted for each):
//   Name    — "name", "item", "item name"
//   Weight  — "weight", "weight (kg)", "weight_kg"
//   Rate    — "rate", "price"
//
// Matching is by exact item name (trimmed, case-insensitive) against
// the existing catalog. Only weight_kg and rate are updated — nothing
// else about the item changes. Rows whose name doesn't match any
// existing item are reported back, not created.
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return NextResponse.json({ error: "Couldn't read that file — is it a valid .xlsx, .xls, or .csv?" }, { status: 400 });
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return NextResponse.json({ error: "The file has no sheets" }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheetName], {
    defval: "",
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "The sheet has no rows" }, { status: 400 });
  }

  const NAME_KEYS = ["name", "item", "item name", "item_name"];
  const WEIGHT_KEYS = ["weight", "weight (kg)", "weight_kg", "weight kg"];
  const RATE_KEYS = ["rate", "price"];

  function findValue(row: Record<string, unknown>, candidates: string[]): unknown {
    const keys = Object.keys(row);
    for (const candidate of candidates) {
      const match = keys.find((k) => k.trim().toLowerCase() === candidate);
      if (match !== undefined) return row[match];
    }
    return undefined;
  }

  function toNumber(value: unknown): number | null {
    if (value === undefined || value === null || value === "") return null;
    const cleaned = String(value).replace(/,/g, "").trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  const parsedRows = rows.map((row) => ({
    name: String(findValue(row, NAME_KEYS) ?? "").trim(),
    weight_kg: toNumber(findValue(row, WEIGHT_KEYS)),
    rate: toNumber(findValue(row, RATE_KEYS)),
  }));

  const usableRows = parsedRows.filter((r) => r.name);
  if (usableRows.length === 0) {
    return NextResponse.json(
      { error: "Couldn't find a name column — expected a header like \"Name\" or \"Item\"" },
      { status: 400 }
    );
  }

  const { data: existingItems, error: fetchError } = await supabaseServer
    .from("items")
    .select("id, name");

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const byName = new Map<string, string>();
  for (const item of existingItems ?? []) {
    byName.set(String(item.name).trim().toLowerCase(), item.id);
  }

  const updated: string[] = [];
  const notFound: string[] = [];
  const skippedNoValues: string[] = [];

  for (const row of usableRows) {
    const id = byName.get(row.name.toLowerCase());
    if (!id) {
      notFound.push(row.name);
      continue;
    }
    if (row.weight_kg === null && row.rate === null) {
      skippedNoValues.push(row.name);
      continue;
    }

    const patch: Record<string, number> = {};
    if (row.weight_kg !== null) patch.weight_kg = row.weight_kg;
    if (row.rate !== null) patch.rate = row.rate;

    const { error: updateError } = await supabaseServer.from("items").update(patch).eq("id", id);
    if (updateError) {
      notFound.push(`${row.name} (update failed: ${updateError.message})`);
      continue;
    }
    updated.push(row.name);
  }

  return NextResponse.json({
    updatedCount: updated.length,
    updated,
    notFound,
    skippedNoValues,
  });
}
