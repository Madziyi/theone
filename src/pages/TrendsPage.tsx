import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUnitPreferences } from "@/contexts/UnitPreferencesContext";
import html2canvas from "html2canvas";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  Legend,
  Label,
} from "recharts";
import { ChevronDown } from "lucide-react";

/* ----------------------------- Types ----------------------------- */

type Buoy = { id: number; buoy_id: string; name: string };
type Parameter = { parameter_id: number; standard_name: string | null; unit: string | null; depth?: number | null };
type UnifiedRow = { ts: string; value: number | null; unit: string; buoy_id: string | number; parameter_id: number };
type RangeKey = "24h" | "7d" | "30d" | "custom";

/* ---------- Unit conversions (incl. cm/s & g/L ↔ μg/L) ---------- */

type UnitFn = (v: number) => number;
type UnitConversions = {
  temperature: Record<string, Record<string, UnitFn>>;
  pressure: Record<string, Record<string, UnitFn>>;
  speed: Record<string, Record<string, UnitFn>>;
  distance: Record<string, Record<string, UnitFn>>;
  concentration: Record<string, Record<string, UnitFn>>;
};
const UNIT_CONVERSIONS: UnitConversions = {
  temperature: {
    K: { "°C": (k) => k - 273.15, "°F": (k) => (k - 273.15) * 9 / 5 + 32 },
    "°C": { K: (c) => c + 273.15, "°F": (c) => c * 9 / 5 + 32 },
    "°F": { K: (f) => (f - 32) * 5 / 9 + 273.15, "°C": (f) => (f - 32) * 5 / 9 },
  },
  pressure: {
    Pa: { Psi: (pa) => pa * 0.000145038, kPa: (pa) => pa / 1000 },
    Psi: { Pa: (psi) => psi / 0.000145038, kPa: (psi) => psi * 6.89476 },
    kPa: { Pa: (kpa) => kpa * 1000, Psi: (kpa) => kpa * 0.145038 },
  },
  speed: {
    "m/s": { knots: (ms) => ms * 1.94384, mph: (ms) => ms * 2.23694, "cm/s": (ms) => ms * 100 },
    knots: { "m/s": (k) => k / 1.94384, mph: (k) => k * 1.15078, "cm/s": (k) => (k / 1.94384) * 100 },
    mph: { "m/s": (m) => m / 2.23694, knots: (m) => m / 1.15078, "cm/s": (m) => (m / 2.23694) * 100 },
    "cm/s": { "m/s": (c) => c / 100, knots: (c) => (c / 100) * 1.94384, mph: (c) => (c / 100) * 2.23694 },
  },
  distance: { m: { ft: (m) => m * 3.28084 }, ft: { m: (f) => f / 3.28084 } },
  concentration: { "g/L": { "μg/L": (g) => g * 1_000_000 } },
};

const getCategory = (name: string | null, unit: string) => {
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("temperature")) return "temperature" as const;
  if (lower.includes("pressure")) return "pressure" as const;
  if (lower.includes("velocity") || lower.includes("speed") || lower.includes("gust")) return "speed" as const;
  if (lower.includes("height")) return "distance" as const;
  if (lower.includes("chlorophyll") || lower.includes("phycocyanin") || lower.includes("cdom")) return "concentration" as const;

  const u = unit.toLowerCase();
  if (["k", "°c", "c", "°f", "f"].includes(u)) return "temperature" as const;
  if (["pa", "kpa", "psi"].includes(u)) return "pressure" as const;
  if (["m/s", "ms", "knots", "mph", "cm/s"].includes(u)) return "speed" as const;
  if (["m", "ft"].includes(u)) return "distance" as const;
  if (["g/l", "μg/l", "ug/l"].includes(u)) return "concentration" as const;
  return null;
};

function convertUnit(
  value: number,
  from: string,
  cat: keyof UnitConversions,
  prefs: ReturnType<typeof useUnitPreferences>["unitPreferences"]
) {
  const to = String(prefs[cat] ?? from);
  if (from === to) return { value, unit: from };
  const fn = UNIT_CONVERSIONS[cat]?.[from]?.[to];
  return fn ? { value: fn(value), unit: to } : { value, unit: from };
}

/* ------------------------- Helpers (UI/data) ------------------------- */

const isEastVel = (name: string | null) => !!name && /eastward\s+(water\s+)?velocity/i.test(name);
const isNorthVel = (name: string | null) => !!name && /northward\s+(water\s+)?velocity/i.test(name);

// 24-hour tick formatting (no AM/PM), range-aware
const formatXAxisTick = (timestamp: string, range: RangeKey): string => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  const t24 = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { hour12: false, ...o });
  if (range === "24h") return t24({ hour: "2-digit", minute: "2-digit" }).format(d);
  if (range === "7d")
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${t24({
      hour: "2-digit",
      minute: "2-digit",
    }).format(d)}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// Ensures numbers serialize in a way CSV parsers treat as numeric cells
function formatCsvNumber(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  const s = abs >= 1e-6 && abs < 1e12 ? String(v) : v.toFixed(12);
  return s.replace(/\.?0+$/, "");
}

function SingleSeriesTooltip({
  active,
  payload,
  label,
  displayUnit,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  displayUnit: string;
}) {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0]?.value;
  const val = typeof v === "number" ? v.toFixed(2) : v;
  const when = new Date(label ?? "").toLocaleString(undefined, { hour12: false });
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft">
      <div className="font-medium">{when}</div>
      <div className="mt-1">{`${payload[0]?.name ?? "Value"}: ${val} ${displayUnit}`}</div>
    </div>
  );
}

function MultiSeriesTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload || !payload.length) return null;
  const when = new Date(label ?? "").toLocaleString(undefined, { hour12: false });
  return (
    <div className="max-w-[260px] rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft">
      <div className="font-medium">{when}</div>
      <div className="mt-1 space-y-0.5">
        {payload.map((p) => {
          const val = typeof p.value === "number" ? p.value.toFixed(2) : p.value;
          return (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto">{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const sanitize = (s: string) => s.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
const rangeToken = (range: RangeKey, startISO: string, endISO: string) =>
  range === "custom"
    ? `${new Date(startISO).toISOString().replace(/[:]/g, "").slice(0, 15)}_${new Date(endISO)
        .toISOString()
        .replace(/[:]/g, "")
        .slice(0, 15)}`
    : range;

function buildTenMinuteGrid(startISO: string, endISO: string) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const grid: string[] = [];
  const step = 10 * 60 * 1000;
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) grid.push(new Date(t).toISOString());
  return grid;
}

// Unified “save as…” with fallback
async function saveOrDownload(blob: Blob, filename: string, description: string, mime: string) {
  const anyWin = window as any;
  if ("showSaveFilePicker" in anyWin) {
    try {
      const handle = await anyWin.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept: { [mime]: [`.${filename.split(".").pop()}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch {
      /* user canceled */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

/* ---------------------------- Component ---------------------------- */

export default function TrendsPage() {
  const [search, setSearch] = useSearchParams();
  const { unitPreferences } = useUnitPreferences();

  // Controls
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [buoy, setBuoy] = useState<string>(search.get("buoy") ?? "");
  const [params, setParams] = useState<Parameter[]>([]);
  const [paramId, setParamId] = useState<string>("");
  const [range, setRange] = useState<RangeKey>("24h");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // Data
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  // Compare modal
  const [compareOpen, setCompareOpen] = useState(false);

  /* ------------------------- Data fetching ------------------------- */

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("buoys").select("id, buoy_id, name").order("name");
      const list = ((data as unknown) ?? []) as Buoy[];
      setBuoys(list);
      if (!buoy && list.length) {
        const first = String(list[0].buoy_id);
        setBuoy(first);
        setSearch((prev) => {
          const n = new URLSearchParams(prev);
          n.set("buoy", first);
          return n;
        }, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!buoy) return;
    setSearch((prev) => {
      const n = new URLSearchParams(prev);
      n.set("buoy", buoy);
      return n;
    }, { replace: true });

    (async () => {
      const { data } = await supabase
        .from("parameters")
        .select("parameter_id, standard_name, unit, buoy_id, depth")
        .eq("buoy_id", buoy)
        .order("standard_name", { ascending: true });

      const list = (((data as unknown) ?? []) as Parameter[]).map((r) => ({
        parameter_id: Number(r.parameter_id),
        standard_name: r.standard_name,
        unit: r.unit,
        depth: r.depth ?? null,
      }));

      // Hide eastward/northward only; allow "Current speed"/"Current direction" if present in DB
      const visible = list
        .filter((p) => !isEastVel(p.standard_name) && !isNorthVel(p.standard_name))
        .sort((a, b) => (a.standard_name ?? "").localeCompare(b.standard_name ?? ""));

      setParams(visible);
      if (!paramId && visible.length) setParamId(String(visible[0].parameter_id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buoy]);

  const { startISO, endISO, invalidCustom } = useMemo(() => {
    const end = new Date();
    if (range === "custom") {
      const s = customStart ? new Date(customStart) : null;
      const e = customEnd ? new Date(customEnd) : null;
      return { startISO: s?.toISOString() ?? "", endISO: e?.toISOString() ?? "", invalidCustom: !(s && e && s < e) };
    }
    const hours = range === "24h" ? 24 : range === "7d" ? 7 * 24 : 30 * 24;
    const start = new Date(end.getTime() - hours * 3600_000);
    return { startISO: start.toISOString(), endISO: end.toISOString(), invalidCustom: false };
  }, [range, customStart, customEnd]);

  useEffect(() => {
    if (!buoy || !paramId) return;
    if (range === "custom" && invalidCustom) return;

    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase.rpc("get_measurement_unified", {
          param_id: Number(paramId),
          start_time: startISO,
          end_time: endISO,
        });
        if (error) throw error;
        const all = ((data as unknown) ?? []) as UnifiedRow[];
        setRows(all.filter((r) => String(r.buoy_id) === String(buoy)));
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [buoy, paramId, range, startISO, endISO, invalidCustom]);

  const selectedParam = params.find((p) => String(p.parameter_id) === paramId) ?? null;
  const mainCat = getCategory(selectedParam?.standard_name ?? null, selectedParam?.unit ?? "");

  const points = useMemo(() => {
    return rows.map((r) => {
      if (r.value == null) return { ts: r.ts, value: null as number | null };
      if (!mainCat) return { ts: r.ts, value: r.value };
      const { value } = convertUnit(r.value, r.unit, mainCat, unitPreferences);
      return { ts: r.ts, value };
    });
  }, [rows, mainCat, unitPreferences]);

  const yUnitLabel = useMemo(() => {
    if (!mainCat) return selectedParam?.unit ?? "";
    return String(unitPreferences[mainCat] ?? selectedParam?.unit ?? "");
  }, [mainCat, unitPreferences, selectedParam]);

  /* ------------------------------- Exports ------------------------------- */

  const BOM = "\uFEFF";
  // CSV helpers: quote headers safely; keep numbers as bare values
  const escHeader = (s: string) =>
    `"${String(s).replace(/\r?\n/g, " ").replace(/,/g, " ").replace(/"/g, '""').trim()}"`;
  const quoteTs = (iso: string) => `"${iso}"`;
  const numCell = (v: number | null | undefined) => formatCsvNumber(v);

  const exportParamCsv = async () => {
    const buoyName = buoys.find((b) => String(b.buoy_id) === String(buoy))?.name ?? "buoy";
    const unit = yUnitLabel;
    const header =
      [escHeader("timestamp"), escHeader(`${selectedParam?.standard_name ?? "value"} (${unit})`)].join(",") + "\n";
    const body = points.map((p) => [quoteTs(p.ts), numCell(p.value)].join(",")).join("\n") + "\n";
    const blob = new Blob([BOM, header, body], { type: "text/csv;charset=utf-8" });
    const fname = `${sanitize(buoyName)}_${sanitize(selectedParam?.standard_name ?? "parameter")}_${rangeToken(
      range,
      startISO,
      endISO
    )}.csv`;
    await saveOrDownload(blob, fname, "CSV File", "text/csv");
  };

  const exportAllCsv = async () => {
    const grid = buildTenMinuteGrid(startISO, endISO);
    // Exclude eastward/northward velocity from "all parameters" export
    const filteredParams = params.filter(
      (p) => !/(eastward|northward)\s+velocity/i.test(p.standard_name ?? "")
    );
    const series = await Promise.all(
      filteredParams.map(async (p) => {
        const { data } = await supabase.rpc("get_measurement_unified", {
          param_id: p.parameter_id,
          start_time: startISO,
          end_time: endISO,
        });
        const raw = (((data as unknown) ?? []) as UnifiedRow[])
          .filter((r) => String(r.buoy_id) === String(buoy))
          .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
        const cat = getCategory(p.standard_name, p.unit ?? "");
        const preferredUnit = cat ? String(unitPreferences[cat]) : p.unit ?? "";
        let i = 0;
        let last: number | null = null;
        const values: (number | null)[] = [];
        for (const g of grid) {
          const gt = new Date(g).getTime();
          while (i < raw.length && new Date(raw[i].ts).getTime() <= gt) {
            const row = raw[i++];
            last =
              row.value == null || !cat ? row.value : convertUnit(row.value, row.unit, cat, unitPreferences).value;
          }
        values.push(last);
        }
        return { header: `${p.standard_name ?? `p_${p.parameter_id}`} (${preferredUnit})`, values };
      })
    );

    let csv =
      [escHeader("timestamp"), ...series.map((s) => escHeader(s.header))].join(",") + "\n";
    for (let i = 0; i < grid.length; i++) {
      csv += [quoteTs(grid[i]), ...series.map((s) => numCell(s.values[i]))].join(",") + "\n";
    }
    const buoyName = buoys.find((b) => String(b.buoy_id) === String(buoy))?.name ?? "buoy";
    const blob = new Blob([BOM, csv], { type: "text/csv;charset=utf-8" });
    const fname = `${sanitize(buoyName)}_${rangeToken(range, startISO, endISO)}.csv`;
    await saveOrDownload(blob, fname, "CSV File", "text/csv");
  };

  const exportPNG = async () => {
    if (!chartRef.current) return;
    const canvas = await html2canvas(chartRef.current, { backgroundColor: "#fff" });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return;
    const buoyName = buoys.find((b) => String(b.buoy_id) === String(buoy))?.name ?? "buoy";
    const fname = `${sanitize(buoyName)}_${sanitize(selectedParam?.standard_name ?? "parameter")}_${rangeToken(
      range,
      startISO,
      endISO
    )}.png`;
    await saveOrDownload(blob, fname, "PNG file", "image/png");
  };

  /* ------------------------------- UI ------------------------------- */

  const buoyItems = buoys.map((b) => ({ value: String(b.buoy_id), label: b.name }));
  // Hide eastward/northward velocity parameters in Trends selects
  const paramItems = params
    .filter(p => !/(eastward|northward)\s+velocity/i.test(p.standard_name ?? ""))
    .map((p) => ({ value: String(p.parameter_id), label: p.standard_name ?? `Param ${p.parameter_id}` }));

  return (
    <section className="max-w-7xl mx-auto px-3 py-4 space-y-4 overflow-x-hidden">
      {/* Controls: unified flex bar; wraps nicely on narrow widths */}
       <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex gap-2 flex-1 min-w-0 basis-full sm:basis-auto">
      <div className="min-w-0">
        <Select className="w-full" items={buoyItems.length ? buoyItems : [{ value: "", label: "Select buoy" }]} value={buoy} onValueChange={setBuoy} placeholder="Buoy" aria-label="Buoy"/>
      </div>
      <div className="min-w-0">
        <Select className="w-full" items={paramItems.length ? paramItems : [{ value: "", label: "Select parameter" }]} value={paramId} onValueChange={setParamId} placeholder="Parameter" aria-label="Parameter"/>
      </div>
    </div>

        {/* Middle: time range pills */}
        <div className="no-scrollbar min-w-[260px] flex-1 overflow-x-auto">
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <TabsList className="flex flex-wrap gap-1 p-1 rounded-xl">
              <TabsTrigger value="24h" className="px-3">24h</TabsTrigger>
              <TabsTrigger value="7d" className="px-3">7d</TabsTrigger>
              <TabsTrigger value="30d" className="px-3">30d</TabsTrigger>
              <TabsTrigger value="custom" className="px-3">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap justify-start gap-2 md:justify-end">
          <button className="h-10 rounded-xl border border-border bg-card px-3 text-sm" onClick={exportParamCsv} disabled={!points.length}>
            Download CSV data
          </button>
          <button className="h-10 rounded-xl border border-border bg-card px-3 text-sm" onClick={exportAllCsv} disabled={!params.length}>
            Download all parameters data
          </button>
          <button className="h-10 rounded-xl border border-border bg-primary px-3 text-sm text-white" onClick={exportPNG} disabled={!points.length}>
            Export PNG
          </button>
          <button className="h-10 rounded-xl border border-border bg-card px-3 text-sm" onClick={() => setCompareOpen(true)} disabled={!buoy || !params.length}>
            Compare…
          </button>
        </div>
      </div>

      {range === "custom" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Start</span>
            <input type="datetime-local" className="h-10 rounded-xl border border-border bg-card px-2" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">End</span>
            <input type="datetime-local" className="h-10 rounded-xl border border-border bg-card px-2" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </label>
        </div>
      )}

      {/* Parameter title */}
      <div className="text-2xl font-semibold">{selectedParam?.standard_name ?? "—"}</div>

      {/* Chart */}
      <div ref={chartRef} className="rounded-2xl border border-border p-3">
        {loading ? (
          <div className="grid h-72 place-items-center text-sm text-muted">Loading…</div>
        ) : !points.length ? (
          <div className="grid h-72 place-items-center text-sm text-muted">No data</div>
        ) : (
          <div className="h-[70vh] min-h-[460px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
              data={points}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              key={`${paramId}-${yUnitLabel}`}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={(tick: string) => formatXAxisTick(tick, range)}
                interval="preserveStartEnd"
                minTickGap={50}
                angle={-20}
                textAnchor="end"
                height={50}
                tick={{ fontSize: 10 }}
              >
                <Label value="Timeline" offset={0} position="insideBottom" style={{ fontWeight: "bold" }} />
              </XAxis>
              <YAxis domain={["auto", "auto"]} tickFormatter={(v: number) => (Number.isFinite(v) ? v.toFixed(2) : "")} tick={{ fontSize: 10 }}>
                <Label value={`${selectedParam?.standard_name ?? "Value"} (${yUnitLabel})`} angle={-90} position="insideLeft" style={{ textAnchor: "middle", fontWeight: "bold" }} />
              </YAxis>
              <RTooltip content={<SingleSeriesTooltip displayUnit={yUnitLabel} />} />
              <Line type="monotone" dataKey="value" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Units floating panel stays globally usable */}
      <UnitsFloatingPanel />

      {compareOpen && (
        <CompareModal
          onClose={() => setCompareOpen(false)}
          buoys={buoys}
          unitPreferences={unitPreferences}
          range={{ startISO, endISO, range }}
        />
      )}
    </section>
  );
}

/* ---------------------- Units Floating panel ---------------------- */

function UnitsFloatingPanel() {
  const { unitPreferences, updatePreference } = useUnitPreferences();
  const OPTIONS: Record<keyof typeof unitPreferences, string[]> = {
    temperature: ["°C", "K", "°F"],
    pressure: ["Pa", "Psi", "kPa"],
    speed: ["m/s", "cm/s", "knots", "mph"],
    distance: ["m", "ft"],
    concentration: ["g/L", "μg/L"],
  };
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed right-3 bottom-[4.5rem] z-[1300] pb-[env(safe-area-inset-bottom)]">
      <button className="rounded-xl border border-border bg-card/80 px-3 py-2 text-sm shadow-soft backdrop-blur" onClick={() => setOpen((s) => !s)} aria-expanded={open}>
        ⚙️ Units
      </button>
      {open && (
        <div className="mt-2 w-64 rounded-xl border border-border bg-card/95 p-3 shadow-soft">
          <div className="mb-2 text-sm font-semibold">Unit Preferences</div>
          <div className="space-y-2">
            {(Object.keys(unitPreferences) as Array<keyof typeof unitPreferences>).map((key) => (
              <label key={key} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                <span className="capitalize">{key}</span>
                <select className="h-9 rounded-lg border border-border bg-background px-2 text-sm" value={unitPreferences[key]} onChange={(e) => updatePreference(key, e.target.value as any)}>
                  {OPTIONS[key].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Compare Modal --------------------------- */

type CompareSlot = {
  open?: boolean;
  buoyId?: string;
  buoyName?: string;
  paramId?: string;
  paramName?: string;
  unit?: string;
  // data filled after fetch
  values?: (number | null)[];
};

const PALETTE = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

function CompareModal({
  onClose,
  buoys,
  unitPreferences,
  range,
}: {
  onClose: () => void;
  buoys: Buoy[];
  unitPreferences: ReturnType<typeof useUnitPreferences>["unitPreferences"];
  range: { startISO: string; endISO: string; range: RangeKey };
}) {
  const [slots, setSlots] = useState<CompareSlot[]>([{ open: true }]); // first slot visible
  const [paramsByBuoy, setParamsByBuoy] = useState<Record<string, Parameter[]>>({});
  const [loading, setLoading] = useState(false);

  const grid = useMemo(() => buildTenMinuteGrid(range.startISO, range.endISO), [range.startISO, range.endISO]);

  // Load parameters for a given buoy on demand; hide east/north
  const loadParams = async (buoyId: string) => {
    if (paramsByBuoy[buoyId]) return;
    const { data } = await supabase
      .from("parameters")
      .select("parameter_id, standard_name, unit, buoy_id, depth")
      .eq("buoy_id", buoyId)
      .order("standard_name", { ascending: true });
    const base = (((data as unknown) ?? []) as Parameter[]).map((r) => ({
      parameter_id: Number(r.parameter_id),
      standard_name: r.standard_name,
      unit: r.unit,
      depth: r.depth ?? null,
    }));
    const visible = base
      .filter((p) => !isEastVel(p.standard_name) && !isNorthVel(p.standard_name))
      .sort((a, b) => (a.standard_name ?? "").localeCompare(b.standard_name ?? ""));
    setParamsByBuoy((m) => ({ ...m, [buoyId]: visible }));
  };

  // Fetch + convert + forward-fill to 10-min grid for one slot
  const hydrateSlot = async (idx: number, buoyId: string, paramId: string) => {
    setLoading(true);
    const meta = (paramsByBuoy[buoyId] ?? []).find((p) => String(p.parameter_id) === paramId);

    let values: (number | null)[] = [];
    let displayUnit = meta?.unit ?? "";
    const { data } = await supabase.rpc("get_measurement_unified", {
      param_id: Number(paramId),
      start_time: range.startISO,
      end_time: range.endISO,
    });
    const raw = (((data as unknown) ?? []) as UnifiedRow[])
      .filter((r) => String(r.buoy_id) === String(buoyId))
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const cat = getCategory(meta?.standard_name ?? null, meta?.unit ?? "");
    const conv = (val: number, unit: string) => (cat ? convertUnit(val, unit, cat, unitPreferences).value : val);
    let i = 0;
    let last: number | null = null;
    for (const g of grid) {
      const gt = new Date(g).getTime();
      while (i < raw.length && new Date(raw[i].ts).getTime() <= gt) {
        const row = raw[i++];
        last = row.value == null ? null : conv(row.value, row.unit);
      }
      values.push(last);
    }
    displayUnit = cat ? String(unitPreferences[cat]) : meta?.unit ?? "";

    setSlots((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], unit: displayUnit, values };
      return copy;
    });
    setLoading(false);
  };

  // Compact dataset aligned to the grid for Recharts
  const data = useMemo(() => {
    return grid.map((iso, idx) => ({
      ts: new Date(iso).toLocaleString(undefined, { hour12: false }),
      ...Object.fromEntries(slots.map((s, i) => [`s${i}`, s.values ? s.values[idx] ?? null : null])),
    }));
  }, [grid, slots]);

  const complete = slots.filter((s) => s.buoyId && s.paramId);
  const units = Array.from(new Set(complete.map((s) => s.unit)));
  const dualAxes = complete.length === 2 && units.length === 2;
  const requireSameUnit = complete.length >= 3;
  const firstUnit = complete[0]?.unit ?? null;

  return (
    <div className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-7xl p-1 space-y-2 bg-white text-black dark:bg-gradient-to-br dark:from-[#0b1a2b] dark:to-[#132c47] dark:text-white min-h-full rounded-none">
          <div className="mx-auto max-w-7xl space-y-2 p-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Compare Parameters</h2>
              <button className="h-10 rounded-xl border border-border bg-card px-2 text-sm" onClick={onClose}>
                Close
              </button>
            </div>

            {/* Collapsible, sequential slots */}
            <div className="grid gap-3">
              {slots.map((slot, idx) => {
                const title =
                  slot.buoyId && slot.paramId
                    ? `${slot.buoyName ?? ""} (${slot.paramName ?? ""})`
                    : `Pick ${["1st", "2nd", "3rd", "4th", "5th", "6th"][idx]} parameter`;

                const canShow = idx === 0 || (slots[idx - 1].buoyId && slots[idx - 1].paramId);
                if (!canShow) return null;

                return (
                  <div key={idx} className="rounded-2xl border border-border p-2 overflow-visible">
                    {/* Header trigger — looks like a dropdown */}
                    <button
                      className="group w-full flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium"
                      onClick={() =>
                        setSlots((prev) => {
                          const c = [...prev];
                          c[idx] = { ...c[idx], open: !c[idx].open };
                          return c;
                        })
                      }
                    >
                      <span className="overflow-hidden text-ellipsis">{title}</span>
                      <ChevronDown
                        className={`ml-2 h-4 w-4 transition-transform duration-200 ${slot.open ? "rotate-180" : "rotate-0"}`}
                        aria-hidden="true"
                      />
                    </button>

                    {/* Body: two inline selects */}
                    {slot.open && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="min-w-0"><Select className="w-full"
                          items={buoys.map((b) => ({ value: String(b.buoy_id), label: b.name }))}
                          value={slot.buoyId ?? ""}
                          onValueChange={async (v) => {
                            await loadParams(v);
                            const buoyName = buoys.find((b) => String(b.buoy_id) === v)?.name;
                            setSlots((prev) => {
                              const c = [...prev];
                              c[idx] = { open: true, buoyId: v, buoyName, paramId: undefined, paramName: undefined, unit: undefined, values: [] };
                              return c;
                            });
                          }}
                          placeholder="Select buoy"
                          aria-label={`Compare buoy ${idx + 1}`}
                        /></div>
                        <div className="min-w-0"><Select className="w-full"
                          items={(paramsByBuoy[slot.buoyId ?? ""] ?? []).map((p) => {
                            const cat = getCategory(p.standard_name, p.unit ?? "");
                            const displayUnit = cat ? String(unitPreferences[cat]) : p.unit ?? "";
                            const disabled = !!(requireSameUnit && firstUnit && displayUnit !== firstUnit && !(slot.paramId && String(slot.paramId) === String(p.parameter_id)));
                            return { value: String(p.parameter_id), label: p.standard_name ?? `Param ${p.parameter_id}`, disabled };
                          })}
                          value={slot.paramId ?? ""}
                          onValueChange={async (v) => {
                            const meta = (paramsByBuoy[slot.buoyId ?? ""] ?? []).find((p) => String(p.parameter_id) === v);
                            setSlots((prev) => {
                              const c = [...prev];
                              c[idx] = { ...c[idx], paramId: v, paramName: meta?.standard_name ?? "" };
                              return c;
                            });
                            if (slot.buoyId) await hydrateSlot(idx, slot.buoyId, v);
                            // collapse this slot and reveal next
                            setSlots((prev) => {
                              const c = [...prev];
                              c[idx] = { ...c[idx], open: false };
                              if (idx === c.length - 1 && c.length < 6) c.push({ open: true });
                              return c;
                            });
                          }}
                          placeholder="Select parameter"
                          aria-label={`Compare parameter ${idx + 1}`}
                        /></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Chart */}
            <div className="rounded-2xl border border-border p-3">
              <div className="h-[70vh] min-h-[460px]">
                {loading ? (
                  <div className="grid h-full place-items-center text-sm text-muted">Loading…</div>
                ) : complete.length === 0 ? (
                  <div className="grid h-full place-items-center text-sm text-muted">Select parameters to compare.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="ts"
                        tickFormatter={(v) => formatXAxisTick(v, range.range)}
                        interval="preserveStartEnd"
                        minTickGap={50}
                        angle={-20}
                        textAnchor="end"
                        height={50}
                        tick={{ fontSize: 10 }}
                      >
                        <Label value="Timeline" offset={0} position="insideBottom" style={{ fontWeight: "bold" }} />
                      </XAxis>
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} domain={["auto", "auto"]}>
                        <Label value={complete[0]?.unit ?? ""} angle={-90} position="insideLeft" style={{ textAnchor: "middle", fontWeight: "bold" }} />
                      </YAxis>
                      {dualAxes && (
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} domain={["auto", "auto"]}>
                          <Label value={complete[1]?.unit ?? ""} angle={90} position="insideRight" style={{ textAnchor: "middle", fontWeight: "bold" }} />
                        </YAxis>
                      )}
                      <RTooltip content={<MultiSeriesTooltip />} />
                      <Legend />
                      {slots.map((s, i) => {
                        if (!s.paramId || !s.values) return null;
                        const name = `${s.buoyName ?? ""} (${s.paramName ?? ""})`;
                        const yAxisId = !dualAxes ? "left" : i === 0 ? "left" : "right";
                        return (
                          <Line
                            key={`s${i}`}
                            type="monotone"
                            dataKey={`s${i}`}
                            name={name}
                            yAxisId={yAxisId}
                            dot={false}
                            strokeWidth={2}
                            stroke={PALETTE[i % PALETTE.length]}
                            connectNulls
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
