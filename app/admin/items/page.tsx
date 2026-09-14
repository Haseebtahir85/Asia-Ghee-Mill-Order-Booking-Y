"use client";

import { useEffect, useRef, useState } from "react";
import { Item, ItemType, IconKind } from "@/lib/types";

const NAVY = "#0b2b5b";
const YELLOW = "#F6C90E";
const RED = "#D62828";

const ICON_OPTIONS: { value: IconKind; label: string }[] = [
  { value: "tin", label: "Tin" },
  { value: "pack", label: "Pack / Carton" },
  { value: "bucket", label: "Bucket (Balti)" },
  { value: "bottle", label: "Bottle" },
  { value: "soap", label: "Soap" },
];

const VALID_TYPES: ItemType[] = ["ghee", "oil", "other"];
const VALID_ICONS: IconKind[] = ["tin", "pack", "bucket", "bottle", "soap"];

const emptyForm = {
  name: "",
  weight_kg: "",
  rate: "",
  type: "ghee" as ItemType,
  icon: "tin" as IconKind,
  item_number: "",
  sku_number: "",
};

// Excel column headers, in the exact order written and read back. ID is
// used to match rows back to items — matching by name alone can't survive
// a rename. A row with no ID and no matching name is a brand-new item.
const EXCEL_HEADERS = ["ID", "Name", "Item #", "SKU", "Weight (kg)", "Rate", "Type", "Icon", "Active"] as const;

type FieldChange = { field: string; oldValue: string; newValue: string };

// One entry per affected item (existing update OR brand-new creation) —
// every changed field for that item lives together in one row.
type ItemChangeGroup = {
  key: string;
  itemLabel: string;
  isNew: boolean;
  fields: FieldChange[];
};

type NewItemPayload = {
  name: string;
  weight_kg: number;
  rate: number;
  type: ItemType;
  icon: IconKind | null;
  item_number: string | null;
  sku_number: string | null;
  is_active: boolean;
};

type PendingImport = {
  patches: { id: string; patch: Partial<Item> }[];
  creates: NewItemPayload[];
  groups: ItemChangeGroup[];
  skipped: number;
};

// Same five glyphs used on the public /book page, kept in sync so the
// icon an admin picks here is exactly what customers will see there:
//   tin    -> straight cylinder, flat rim + flat base
//   pack   -> square carton with a folded top flap
//   bucket -> wide-to-narrow trapezoid with a handle arc
//   bottle -> tapered oil bottle (RSO)
//   soap   -> rounded bar
function IconGlyph({ kind }: { kind: IconKind }) {
  if (kind === "tin") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="6.5" y="8" width="11" height="11.5" rx="0.6" fill="#F6C90E" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="8" rx="5.5" ry="1.8" fill="#FDE58A" stroke="#0B2B5B" strokeWidth="1.4" />
        <ellipse cx="12" cy="19.5" rx="5.5" ry="1.2" fill="none" stroke="#0B2B5B" strokeWidth="1" opacity="0.5" />
        <rect x="9.5" y="4.6" width="5" height="1.7" rx="0.4" fill="#0B2B5B" />
      </svg>
    );
  }
  if (kind === "pack") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="9" width="14" height="11" rx="0.5" fill="#FDE9A8" stroke="#D62828" strokeWidth="1.4" />
        <path d="M5 9 9 5h6l4 4" fill="#FBE0B0" stroke="#D62828" strokeWidth="1.3" />
        <path d="M9 5v4M15 5v4" stroke="#D62828" strokeWidth="1" opacity="0.6" />
        <path d="M5 13.5h14" stroke="#0B2B5B" strokeWidth="1" opacity="0.4" />
      </svg>
    );
  }
  if (kind === "bottle") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M10 2.5h4v3.1l1.6 2.4c.4.6.6 1.3.6 2V19a2.5 2.5 0 0 1-2.5 2.5h-3.4A2.5 2.5 0 0 1 7.8 19v-9c0-.7.2-1.4.6-2L10 5.6V2.5z" fill="#CFE8E0" stroke="#0B2B5B" strokeWidth="1.4" />
        <rect x="9.6" y="1.4" width="4.8" height="1.6" rx="0.4" fill="#0B2B5B" />
        <rect x="8.2" y="11.5" width="7.6" height="5" fill="#1B8A6B" opacity="0.75" />
      </svg>
    );
  }
  if (kind === "soap") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="8.5" width="17" height="9" rx="4" fill="#F7D9E6" stroke="#0B2B5B" strokeWidth="1.4" />
        <path d="M7 10.8c3.5 1.6 6.5 1.6 10 0" stroke="#0B2B5B" strokeWidth="1" opacity="0.45" fill="none" />
      </svg>
    );
  }
  // bucket
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 7.5h14l-2 11.2a1.6 1.6 0 0 1-1.58 1.3H8.58A1.6 1.6 0 0 1 7 18.7L5 7.5z" fill="#DCE1E8" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M4 7.5h16" stroke="#0B2B5B" strokeWidth="1.4" />
      <path d="M7.5 7.5c0-2.6 2-4 4.5-4s4.5 1.4 4.5 4" stroke="#0B2B5B" strokeWidth="1.3" fill="none" />
    </svg>
  );
}

// Dropdown that shows the actual icon glyph for the current value and
// for every option — a native <select> can't render SVGs inside its
// <option> list in any browser, so this is a small custom popover
// instead. Closes on selection or on an outside click.
function IconSelect({ value, onChange }: { value: IconKind | null; onChange: (icon: IconKind) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={value ? ICON_OPTIONS.find((o) => o.value === value)?.label : "Choose icon"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "5px 7px",
          border: "1px solid #ccc",
          borderRadius: 6,
          background: "#fff",
          cursor: "pointer",
        }}
      >
        {value ? <IconGlyph kind={value} /> : <span style={{ fontSize: 11, color: "#999" }}>—</span>}
        <span style={{ fontSize: 8, color: "#888" }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            zIndex: 20,
            display: "flex",
            gap: 4,
            padding: 6,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
          }}
        >
          {ICON_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              title={opt.label}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 30,
                height: 30,
                padding: 0,
                border: value === opt.value ? "1.5px solid #0b2b5b" : "1px solid transparent",
                borderRadius: 6,
                background: value === opt.value ? "#eef2f9" : "transparent",
                cursor: "pointer",
              }}
            >
              <IconGlyph kind={opt.value} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [excelStatus, setExcelStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadItems() {
    setLoading(true);
    const res = await fetch("/api/admin/items");
    const json = await res.json();
    setItems(json.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, []);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.rate || !form.weight_kg) {
      setError("Name, weight, and rate are required.");
      return;
    }

    const res = await fetch("/api/admin/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        weight_kg: parseFloat(form.weight_kg),
        rate: parseFloat(form.rate),
        type: form.type,
        icon: form.icon,
        item_number: form.item_number || null,
        sku_number: form.sku_number || null,
      }),
    });

    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Failed to add item");
      return;
    }

    setForm(emptyForm);
    loadItems();
  }

  async function updateItem(id: string, patch: Partial<Item>) {
    await fetch(`/api/admin/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    loadItems();
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this item? This does not affect past orders (they keep a snapshot).")) return;
    await fetch(`/api/admin/items/${id}`, { method: "DELETE" });
    loadItems();
  }

  async function move(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setItems(reordered);
    await fetch("/api/admin/items/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: reordered.map((i) => i.id) }),
    });
  }

  // Builds an .xlsx of the current catalog so the admin can edit values in
  // Excel and re-upload it. The ID column is used to match rows back to
  // items — don't edit or remove it. Leave ID blank on a new row to add a
  // brand-new item.
  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const rows = items.map((it) => ({
      ID: it.id,
      Name: it.name,
      "Item #": it.item_number ?? "",
      SKU: it.sku_number ?? "",
      "Weight (kg)": it.weight_kg,
      Rate: it.rate,
      Type: it.type,
      Icon: it.icon ?? "",
      Active: it.is_active ? "Active" : "Inactive",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows, { header: [...EXCEL_HEADERS] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Items");
    XLSX.writeFile(workbook, "items-template.xlsx");
  }

  function triggerExcelUpload() {
    fileInputRef.current?.click();
  }

  async function applyPatches(patches: { id: string; patch: Partial<Item> }[]) {
    for (const { id, patch } of patches) {
      await fetch(`/api/admin/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    }
  }

  async function applyCreates(creates: NewItemPayload[]) {
    for (const payload of creates) {
      await fetch("/api/admin/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  }

  // Reads the uploaded workbook, matches each row to an existing item by
  // ID (falling back to name, case-insensitive, if ID is missing).
  //
  // - Matched rows: Name / Item # / SKU / Type / Icon changes are gated —
  //   held for confirmation. Weight (kg) / Rate / Active changes apply
  //   directly and are never shown in the popup.
  // - Unmatched rows with a name AND both weight and rate present:
  //   treated as a brand-new item to create (also shown in the popup).
  // - Unmatched rows missing a name, or missing weight/rate (required,
  //   non-nullable columns): skipped.
  //
  // Cancel applies nothing at all, including Weight/Rate/Active changes
  // riding along in the same upload.
  async function handleExcelFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImporting(true);
    setExcelStatus(null);
    setError(null);

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

      const byId = new Map(items.map((it) => [it.id, it]));
      const byLowerName = new Map(items.map((it) => [it.name.trim().toLowerCase(), it]));

      const patches: { id: string; patch: Partial<Item> }[] = [];
      const creates: NewItemPayload[] = [];
      const groupsByKey = new Map<string, ItemChangeGroup>();
      let skipped = 0;

      const toNum = (v: unknown): number | null => {
        if (v === undefined || v === null || v === "") return null;
        const n = Number(String(v).replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : null;
      };

      rows.forEach((row, index) => {
        const rowId = String(row["ID"] ?? row["id"] ?? "").trim();
        const rawName = String(row["Name"] ?? row["name"] ?? "").trim();
        const match = rowId ? byId.get(rowId) : rawName ? byLowerName.get(rawName.toLowerCase()) : undefined;

        const itemNoRaw = row["Item #"] ?? row["item_number"] ?? row["Item Number"];
        const skuRaw = row["SKU"] ?? row["sku_number"] ?? row["sku"];
        const weightRaw = row["Weight (kg)"] ?? row["weight_kg"] ?? row["Weight"];
        const rateRaw = row["Rate"] ?? row["rate"] ?? row["Price"];
        const typeRaw = String(row["Type"] ?? row["type"] ?? "").trim().toLowerCase();
        const iconRaw = String(row["Icon"] ?? row["icon"] ?? "").trim().toLowerCase();
        const activeRaw = String(row["Active"] ?? row["active"] ?? row["Status"] ?? "").trim().toLowerCase();

        if (!match) {
          if (!rawName) {
            skipped++;
            return;
          }
          const weight_kg = toNum(weightRaw);
          const rate = toNum(rateRaw);
          if (weight_kg === null || rate === null) {
            // Weight and Rate are required, non-nullable columns — can't
            // create an item without them.
            skipped++;
            return;
          }

          const type: ItemType = VALID_TYPES.includes(typeRaw as ItemType) ? (typeRaw as ItemType) : "other";
          const icon: IconKind | null = VALID_ICONS.includes(iconRaw as IconKind) ? (iconRaw as IconKind) : null;
          const item_number = itemNoRaw !== undefined ? String(itemNoRaw).trim() || null : null;
          const sku_number = skuRaw !== undefined ? String(skuRaw).trim() || null : null;
          const is_active = activeRaw !== "inactive";

          creates.push({ name: rawName, weight_kg, rate, type, icon, item_number, sku_number, is_active });

          const fields: FieldChange[] = [];
          if (item_number) fields.push({ field: "Item #", oldValue: "—", newValue: item_number });
          if (sku_number) fields.push({ field: "SKU", oldValue: "—", newValue: sku_number });
          fields.push({ field: "Type", oldValue: "—", newValue: type });
          if (icon) fields.push({ field: "Icon", oldValue: "—", newValue: icon });
          // Weight/Rate intentionally excluded from what's shown, per the same rule as updates.

          groupsByKey.set(`new:${index}`, { key: `new:${index}`, itemLabel: rawName, isNew: true, fields });
          return;
        }

        const patch: Partial<Item> = {};
        const fields: FieldChange[] = [];

        if (rawName && rawName !== match.name.trim()) {
          patch.name = rawName;
          fields.push({ field: "Name", oldValue: match.name, newValue: rawName });
        }

        if (itemNoRaw !== undefined) {
          const newItemNo = String(itemNoRaw).trim() || null;
          if (newItemNo !== (match.item_number ?? null)) {
            patch.item_number = newItemNo;
            fields.push({ field: "Item #", oldValue: match.item_number ?? "", newValue: newItemNo ?? "" });
          }
        }

        if (skuRaw !== undefined) {
          const newSku = String(skuRaw).trim() || null;
          if (newSku !== (match.sku_number ?? null)) {
            patch.sku_number = newSku;
            fields.push({ field: "SKU", oldValue: match.sku_number ?? "", newValue: newSku ?? "" });
          }
        }

        if (typeRaw && VALID_TYPES.includes(typeRaw as ItemType) && typeRaw !== match.type) {
          patch.type = typeRaw as ItemType;
          fields.push({ field: "Type", oldValue: match.type, newValue: typeRaw });
        }

        if (iconRaw && VALID_ICONS.includes(iconRaw as IconKind) && iconRaw !== (match.icon ?? "")) {
          patch.icon = iconRaw as IconKind;
          fields.push({ field: "Icon", oldValue: match.icon ?? "", newValue: iconRaw });
        }

        // Weight/Rate/Active — excepted from the confirmation gate.
        const newWeight = toNum(weightRaw);
        if (newWeight !== null && newWeight !== match.weight_kg) {
          patch.weight_kg = newWeight;
        }
        const newRate = toNum(rateRaw);
        if (newRate !== null && newRate !== match.rate) {
          patch.rate = newRate;
        }
        if (activeRaw === "active" && !match.is_active) patch.is_active = true;
        else if (activeRaw === "inactive" && match.is_active) patch.is_active = false;

        if (Object.keys(patch).length > 0) {
          patches.push({ id: match.id, patch });
        }
        if (fields.length > 0) {
          groupsByKey.set(match.id, { key: match.id, itemLabel: match.name, isNew: false, fields });
        }
      });

      const groups = Array.from(groupsByKey.values());

      if (groups.length > 0) {
        setPendingImport({ patches, creates, groups, skipped });
        setImporting(false);
        return;
      }

      await applyPatches(patches);
      setExcelStatus(
        skipped > 0
          ? `Updated ${patches.length} item${patches.length === 1 ? "" : "s"}, ${skipped} row${skipped === 1 ? "" : "s"} skipped.`
          : `Updated ${patches.length} item${patches.length === 1 ? "" : "s"}.`
      );
      loadItems();
    } catch (err: any) {
      setError(err.message || "Failed to read the Excel file.");
    } finally {
      setImporting(false);
    }
  }

  async function confirmOverwrite() {
    if (!pendingImport) return;
    setImporting(true);
    await applyPatches(pendingImport.patches);
    await applyCreates(pendingImport.creates);
    const total = pendingImport.patches.length + pendingImport.creates.length;
    setExcelStatus(
      pendingImport.skipped > 0
        ? `Updated ${total} item${total === 1 ? "" : "s"}, ${pendingImport.skipped} row${pendingImport.skipped === 1 ? "" : "s"} skipped.`
        : `Updated ${total} item${total === 1 ? "" : "s"}.`
    );
    setPendingImport(null);
    setImporting(false);
    loadItems();
  }

  function cancelImport() {
    setPendingImport(null);
  }

  function formatFields(fields: FieldChange[]): string {
    return fields.map((f) => `${f.field}: ${f.oldValue || "—"} → ${f.newValue || "—"}`).join(", ");
  }

  return (
    <main style={{ maxWidth: 950, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", background: "#fffdf5", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 6, height: 24, background: YELLOW, borderRadius: 3 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: NAVY, margin: 0 }}>Items, Weights & Rates</h1>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={downloadTemplate}
            disabled={loading || items.length === 0}
            title={loading ? "Waiting for items to load…" : items.length === 0 ? "No items to export yet" : undefined}
            style={{ ...secondaryButtonStyle, opacity: loading || items.length === 0 ? 0.6 : 1, cursor: loading || items.length === 0 ? "default" : "pointer" }}
          >
            Download Excel Template
          </button>
          <button type="button" onClick={triggerExcelUpload} disabled={importing} style={{ ...buttonStyle, opacity: importing ? 0.7 : 1 }}>
            {importing ? "Updating..." : "Update Data via Excel"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelFile}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {excelStatus && (
        <div style={{ color: NAVY, background: "#eef3fb", border: "1px solid #cddaf0", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {excelStatus}
        </div>
      )}

      <form
        onSubmit={addItem}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 10,
          marginBottom: 24,
          padding: 14,
          background: "#fff",
          border: `1px solid ${YELLOW}`,
          borderRadius: 10,
          boxShadow: "0 2px 8px rgba(11,43,91,0.06)",
        }}
      >
        <input placeholder="Item name (e.g. 1 Kg 12 Pack)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
        <input placeholder="Item #" value={form.item_number} onChange={(e) => setForm({ ...form, item_number: e.target.value })} style={inputStyle} />
        <input placeholder="SKU" value={form.sku_number} onChange={(e) => setForm({ ...form, sku_number: e.target.value })} style={inputStyle} />
        <input type="number" step="1" placeholder="Weight (kg)" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} style={inputStyle} />
        <input type="number" step="1" placeholder="Rate" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} style={inputStyle} />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ItemType })} style={{ ...inputStyle, padding: "8px 10px" }}>
          <option value="ghee">Ghee</option>
          <option value="oil">Oil</option>
          <option value="other">Other</option>
        </select>
        <IconSelect value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
        <button type="submit" style={buttonStyle}>Add</button>
      </form>

      {error && (
        <div style={{ color: RED, background: "#fdecec", border: "1px solid #f6c9c9", borderRadius: 6, padding: "6px 10px", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${YELLOW}`, borderRadius: 10, background: "#fff" }}>
        <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: 46 }} />
            <col style={{ minWidth: 200 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr style={{ textAlign: "left", background: NAVY }}>
              <th style={thStyle}></th>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Item #</th>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Weight (kg)</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Type</th>
              <th style={thStyle}>Icon</th>
              <th style={thStyle}>Active</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id} style={{ borderBottom: `1px solid #f3e6b0` }}>
                <td style={tdStyle}>
                  <button onClick={() => move(index, -1)} style={moveButtonStyle} title="Move up">↑</button>
                  <button onClick={() => move(index, 1)} style={moveButtonStyle} title="Move down">↓</button>
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={item.name}
                    onBlur={(e) => e.target.value !== item.name && updateItem(item.id, { name: e.target.value })}
                    style={{ width: "100%", minWidth: 180, border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={item.item_number ?? ""}
                    onBlur={(e) => e.target.value !== (item.item_number ?? "") && updateItem(item.id, { item_number: e.target.value || null })}
                    style={{ width: "100%", border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    defaultValue={item.sku_number ?? ""}
                    onBlur={(e) => e.target.value !== (item.sku_number ?? "") && updateItem(item.id, { sku_number: e.target.value || null })}
                    style={{ width: "100%", border: "1px solid transparent", padding: 4, boxSizing: "border-box", borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    step="1"
                    defaultValue={item.weight_kg}
                    onBlur={(e) => parseFloat(e.target.value) !== item.weight_kg && updateItem(item.id, { weight_kg: parseFloat(e.target.value) })}
                    style={{ width: 80, border: "1px solid transparent", padding: 4, borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <input
                    type="number"
                    step="1"
                    defaultValue={item.rate}
                    onBlur={(e) => parseFloat(e.target.value) !== item.rate && updateItem(item.id, { rate: parseFloat(e.target.value) })}
                    style={{ width: 90, border: "1px solid transparent", padding: 4, borderRadius: 4 }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = YELLOW)}
                    onBlurCapture={(e) => (e.currentTarget.style.borderColor = "transparent")}
                  />
                </td>
                <td style={tdStyle}>
                  <select value={item.type} onChange={(e) => updateItem(item.id, { type: e.target.value as ItemType })}>
                    <option value="ghee">Ghee</option>
                    <option value="oil">Oil</option>
                    <option value="other">Other</option>
                  </select>
                </td>
                <td style={tdStyle}>
                  <IconSelect value={item.icon} onChange={(icon) => updateItem(item.id, { icon })} />
                </td>
                <td style={tdStyle}>
                  <input type="checkbox" checked={item.is_active} onChange={(e) => updateItem(item.id, { is_active: e.target.checked })} />
                </td>
                <td style={tdStyle}>
                  <button onClick={() => deleteItem(item.id)} style={{ ...moveButtonStyle, color: RED, borderColor: "#f0b8b8" }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {pendingImport && (
        <div style={modalOverlayStyle} onClick={cancelImport}>
          <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 17, margin: "0 0 4px", color: NAVY }}>Confirm changes</h2>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px" }}>
              Review the affected items before overwriting.
            </p>
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #eee", borderRadius: 8, marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f5f6f8", textAlign: "left" }}>
                    <th style={{ padding: "6px 8px" }}>Item</th>
                    <th style={{ padding: "6px 8px" }}>Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingImport.groups.map((g) => (
                    <tr key={g.key} style={{ borderTop: "1px solid #eee" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600, color: NAVY, whiteSpace: "nowrap" }}>
                        {g.itemLabel}
                        {g.isNew && (
                          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#1b8a3d", background: "#e6f4ea", borderRadius: 10, padding: "1px 8px" }}>
                            New
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "6px 8px", color: "#444" }}>
                        {g.fields.length > 0 ? formatFields(g.fields) : g.isNew ? "New item" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={cancelImport} style={secondaryButtonStyle}>Cancel</button>
              <button type="button" onClick={confirmOverwrite} disabled={importing} style={buttonStyle}>
                {importing ? "Overwriting..." : "Overwrite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  minWidth: 0,
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  border: "1px solid #d9dde6",
  borderRadius: 6,
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: NAVY,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#fff",
  color: NAVY,
  border: `1px solid ${NAVY}`,
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600,
  fontSize: 13,
};

const moveButtonStyle: React.CSSProperties = {
  border: `1px solid ${YELLOW}`,
  background: "#fff",
  color: NAVY,
  borderRadius: 4,
  padding: "2px 8px",
  cursor: "pointer",
  marginRight: 4,
  fontWeight: 600,
};

const thStyle: React.CSSProperties = { padding: "9px 6px", fontSize: 13, color: "#fff", fontWeight: 700 };
const tdStyle: React.CSSProperties = { padding: "6px 6px", fontSize: 13 };

const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
  padding: 16,
};

const modalBoxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 22,
  width: "100%",
  maxWidth: 560,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
};