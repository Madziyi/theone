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
const isDirectionName = (name?: string | null) => !!name && /\bdirection\b/i.test(name ?? "");

function cardinalFromDeg(angle: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const idx = Math.round(((angle % 360) / 360) * 16) % 16;
  return dirs[idx];
}

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
  isDirection = false,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  displayUnit: string;
  isDirection?: boolean;
}) {
  if (!active || !payload || !payload.length) return null;
  const raw = payload[0]?.value as number | null;
  const when = new Date(label ?? "").toLocaleString(undefined, { hour12: false });

  const content = isDirection && typeof raw === "number"
    ? `${cardinalFromDeg(raw)} (${Math.round(raw)}°)`
    : `${payload[0]?.name ?? "Value"}: ${typeof raw === "number" ? (raw as number).toFixed(2) : raw} ${displayUnit}`;

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm shadow-soft">
      <div className="font-medium">{when}</div>
      <div className="mt-1">{content}</div>
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
          const name: string = p.name ?? "";
          const val = typeof p.value === "number" ? p.value : null;
          const isDir = /\bdirection\b/i.test(name);
          const labelVal = isDir && typeof val === "number"
            ? `${cardinalFromDeg(val)} (${Math.round(val)}°)`
            : (typeof p.value === "number" ? p.value.toFixed(2) : p.value);
          return (
            <div key={p.dataKey} className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
              <span className="truncate">{name}</span>
              <span className="ml-auto">{labelVal}</span>
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

// Local <-> ISO helpers for datetime-local
function pad2(n: number) { return String(n).padStart(2, "0"); }
function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function isoToLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toLocalInputValue(d);
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
  const isDirection = isDirectionName(selectedParam?.standard_name);

  const points = useMemo(() => {
    return rows.map((r) => {
      if (r.value == null) return { ts: r.ts, value: null as number | null };
      if (!mainCat) return { ts: r.ts, value: r.value };
      const { value } = convertUnit(r.value, r.unit, mainCat, unitPreferences);
      return { ts: r.ts, value };
    });
  }, [rows, mainCat, unitPreferences]);

  const yUnitLabel = useMemo(() => {
    if (isDirection) return "°";
    if (!mainCat) return selectedParam?.unit ?? "";
    return String(unitPreferences[mainCat] ?? selectedParam?.unit ?? "");
  }, [mainCat, unitPreferences, selectedParam, isDirection]);

  /* ------------------------------- Exports ------------------------------- */

  const BOM = "\uFEFF";
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
  const paramItems = params
    .filter(p => !/(eastward|northward)\s+velocity/i.test(p.standard_name ?? ""))
    .map((p) => ({ value: String(p.parameter_id), label: p.standard_name ?? `Param ${p.parameter_id}` }));

  const yTickFmt = (v: number) => {
    if (!Number.isFinite(v)) return "";
    return (v as number).toFixed(2);
    };

  return (
    <section className="max-w-7xl mx-auto px-3 py-4 space-y-4 overflow-x-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <div className="flex gap-2 flex-1 min-w-0 basis-full sm:basis-auto">
          <div className="min-w-0">
            <Select className="w-full" items={buoyItems.length ? buoyItems : [{ value: "", label: "Select buoy" }]} value={buoy} onValueChange={setBuoy} placeholder="Buoy" aria-label="Buoy"/>
          </div>
          <div className="min-w-0">
            <Select className="w-full" items={paramItems.length ? paramItems : [{ value: "", label: "Select parameter" }]} value={paramId} onValueChange={setParamId} placeholder="Parameter" aria-label="Parameter"/>
          </div>
        </div>

        {/* Time range pills */}
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
                <YAxis domain={["auto", "auto"]} tickFormatter={yTickFmt} tick={{ fontSize: 10 }}>
                  <Label
                    value={`${selectedParam?.standard_name ?? "Value"} (${isDirection ? "°" : yUnitLabel})`}
                    angle={-90}
                    position="insideLeft"
                    style={{ textAnchor: "middle", fontWeight: "bold" }}
                  />
                </YAxis>
                <RTooltip content={<SingleSeriesTooltip displayUnit={isDirection ? "°" : yUnitLabel} isDirection={isDirection} />} />
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
      <button className="rounded-xl border border-2 border-blue-300 border-solid border-border bg-card/80 px-3 py-2 text-sm shadow-soft backdrop-blur" onClick={() => setOpen((s) => !s)} aria-expanded={open}>
        ⚙️ Units
      </button>
      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-64 rounded-xl border border-border bg-card/95 p-3 shadow-soft">
           <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Unit Preferences</h3>
          <button
                className="text-sm text-muted hover:opacity-80"
                onClick={() => setOpen(false)}
                aria-label="Close unit panel"
              >
                ✕
              </button>
          </div>
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
  unit?: string;             // display unit after conversion
  values?: (number | null)[]; // aligned to grid
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
  const [slots, setSlots] = useState<CompareSlot[]>([{ open: true }]);
  const [paramsByBuoy, setParamsByBuoy] = useState<Record<string, Parameter[]>>({});
  const [loading, setLoading] = useState(false);

  // Local time range state for the modal (fix invalid date by using datetime-local format)
  const [rangeKey, setRangeKey] = useState<RangeKey>(range.range);
  const [customStart, setCustomStart] = useState<string>(
    range.range === "custom" ? isoToLocalInput(range.startISO) : ""
  );
  const [customEnd, setCustomEnd] = useState<string>(
    range.range === "custom" ? isoToLocalInput(range.endISO) : ""
  );

  // Seed defaults when switching to Custom
  useEffect(() => {
    if (rangeKey !== "custom") return;
    if (!customStart || !customEnd) {
      const end = new Date();
      const start = new Date(end.getTime() - 24 * 3600_000);
      setCustomStart(toLocalInputValue(start));
      setCustomEnd(toLocalInputValue(end));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const { localStartISO, localEndISO } = useMemo(() => {
    if (rangeKey === "custom" && customStart && customEnd) {
      const s = new Date(customStart);
      const e = new Date(customEnd);
      if (s < e) return { localStartISO: s.toISOString(), localEndISO: e.toISOString() };
    }
    const end = new Date();
    const hours = rangeKey === "24h" ? 24 : rangeKey === "7d" ? 7 * 24 : 30 * 24;
    const start = new Date(end.getTime() - hours * 3600_000);
    return { localStartISO: start.toISOString(), localEndISO: end.toISOString() };
  }, [rangeKey, customStart, customEnd]);

  const grid = useMemo(() => buildTenMinuteGrid(localStartISO, localEndISO), [localStartISO, localEndISO]);

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

  const hydrateSlot = async (idx: number, buoyId: string, paramId: string) => {
    setLoading(true);
    const meta = (paramsByBuoy[buoyId] ?? []).find((p) => String(p.parameter_id) === paramId);

    const { data } = await supabase.rpc("get_measurement_unified", {
      param_id: Number(paramId),
      start_time: localStartISO,
      end_time: localEndISO,
    });
    const raw = (((data as unknown) ?? []) as UnifiedRow[])
      .filter((r) => String(r.buoy_id) === String(buoyId))
      .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    const cat = getCategory(meta?.standard_name ?? null, meta?.unit ?? "");
    const conv = (val: number, unit: string) => (cat ? convertUnit(val, unit, cat, unitPreferences).value : val);
    const displayUnit = cat ? String(unitPreferences[cat]) : meta?.unit ?? "";

    const values: (number | null)[] = [];
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

    setSlots((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], unit: displayUnit, values };
      return copy;
    });
    setLoading(false);
  };

  // Re-hydrate completed slots when local range changes
  useEffect(() => {
    slots.forEach((s, i) => {
      if (s.buoyId && s.paramId) hydrateSlot(i, s.buoyId, s.paramId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStartISO, localEndISO]);

  // Compact dataset aligned to the grid for Recharts
  const data = useMemo(() => {
    return grid.map((iso, idx) => ({
      ts: iso, 
      ...Object.fromEntries(slots.map((s, i) => [`s${i}`, s.values ? s.values[idx] ?? null : null])),
    }));
  }, [grid, slots]);

  const complete = slots
    .map((s, i) => ({ ...s, _idx: i }))
    .filter((s): s is Required<typeof s> & { _idx: number } => !!s.buoyId && !!s.paramId && !!s.values && typeof s.unit === "string");

  // ==== Multi-axis logic (unrestricted): one YAxis per unique unit, alternating sides ====
  const unitOrder: string[] = [];
  complete.forEach((s) => {
    if (!unitOrder.includes(s.unit)) unitOrder.push(s.unit);
  });
  const unitAxisMap = new Map<string, { id: string; orientation: "left" | "right" }>();
  unitOrder.forEach((u, i) => {
    unitAxisMap.set(u, { id: `u${i}`, orientation: i % 2 === 0 ? "left" : "right" });
  });

  // Export PNG for modal chart
  const compareChartRef = useRef<HTMLDivElement>(null);
  const exportComparePNG = async () => {
    if (!compareChartRef.current) return;
    const canvas = await html2canvas(compareChartRef.current, { backgroundColor: "#fff" });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return;
    await saveOrDownload(
      blob,
      `compare_${rangeToken(rangeKey, localStartISO, localEndISO)}.png`,
      "PNG file",
      "image/png"
    );
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto max-w-7xl p-1 space-y-2 bg-white text-black dark:bg-gradient-to-br dark:from-[#0b1a2b] dark:to-[#132c47] dark:text-white min-h-full rounded-none">
          <div className="mx-auto max-w-7xl space-y-2 p-2">
            {/* Header row with local range + export + close */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-lg font-semibold">Compare Parameters</div>

                <button className="h-9 rounded-xl border border-border bg-card px-2 text-sm" onClick={onClose}>
                  Close
                </button>

              <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
                <Tabs value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
                  <TabsList className="flex gap-1 rounded-xl">
                    <TabsTrigger value="24h" className="px-3">24h</TabsTrigger>
                    <TabsTrigger value="7d" className="px-3">7d</TabsTrigger>
                    <TabsTrigger value="30d" className="px-3">30d</TabsTrigger>
                    <TabsTrigger value="custom" className="px-3">Custom</TabsTrigger>
                  </TabsList>
                </Tabs>

                {rangeKey === "custom" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="datetime-local"
                      className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      aria-label="Custom start"
                    />
                    <input
                      type="datetime-local"
                      className="h-9 rounded-lg border border-border bg-card px-2 text-sm"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      aria-label="Custom end"
                    />
                  </div>
                )}

                <button className="h-9 rounded-xl border border-border bg-primary px-3 text-sm text-white"
                        onClick={exportComparePNG} disabled={!complete.length}>
                  Export PNG
                </button>

              </div>
            </div>

            {/* Collapsible, sequential slots */}
            <div className="grid gap-3">
              {slots.map((slot, idx) => {
                const title =
                  slot.buoyId && slot.paramId
                    ? `${slot.buoyName ?? ""} (${slot.paramName ?? ""})${slot.unit ? ` [${slot.unit}]` : ""}`
                    : `Pick ${["1st", "2nd", "3rd", "4th", "5th", "6th"][idx]} parameter`;

                const canShow = idx === 0 || (slots[idx - 1].buoyId && slots[idx - 1].paramId);
                if (!canShow) return null;

                return (
                  <div key={idx} className="rounded-2xl border border-border p-2 overflow-visible">
                    {/* Header with dropdown + remove (X) */}
                    <div className="flex items-center gap-2">
                      <button
                        className="group flex-1 flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium"
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
                          className={`ml-2 h-4 w-4 shrink-0 transition-transform duration-200 ${slot.open ? "rotate-180" : "rotate-0"}`}
                          aria-hidden="true"
                        />
                      </button>

                      <button
                        className="shrink-0 rounded-lg border border-border bg-card px-2 py-2 text-xs hover:bg-accent/30"
                        aria-label={`Remove selection ${idx + 1}`}
                        onClick={() =>
                          setSlots((prev) => {
                            const next = prev.filter((_, i) => i !== idx);
                            return next.length ? next : [{ open: true }];
                          })
                        }
                      >
                        ❌
                      </button>
                    </div>

                    {/* Body: two inline selects */}
                    {slot.open && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="min-w-0">
                          <Select
                            className="w-full"
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
                          />
                        </div>
                        <div className="min-w-0">
                          <Select
                            className="w-full"
                            items={(paramsByBuoy[slot.buoyId ?? ""] ?? []).map((p) => ({
                              value: String(p.parameter_id),
                              label: p.standard_name ?? `Param ${p.parameter_id}`,
                            }))}
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
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Chart */}
            <div className="rounded-2xl border border-border p-1" ref={compareChartRef}>
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
                        tickFormatter={(v) => formatXAxisTick(v, rangeKey)}
                        interval="preserveStartEnd"
                        minTickGap={50}
                        angle={-20}
                        textAnchor="end"
                        height={50}
                        tick={{ fontSize: 10 }}
                      >
                        <Label value="Timeline" offset={0} position="insideBottom" style={{ fontWeight: "bold" }} />
                      </XAxis>

                      {/* Dynamic Y axes per unit, alternating sides */}
                      {unitOrder.map((u, i) => {
                        const conf = unitAxisMap.get(u)!;
                        const labelAngle = conf.orientation === "left" ? -90 : 90;
                        const labelPos = conf.orientation === "left" ? "insideLeft" : "insideRight";
                        const labelDxOffset = conf.orientation === "left" ? -(-15) : (-5);
                        return (
                          <YAxis
                            key={conf.id}
                            yAxisId={conf.id}
                            orientation={conf.orientation}
                            tick={{ fontSize: 10 }}
                            domain={["auto", "auto"]}
                          >
                            <Label
                              value={u}
                              angle={labelAngle}
                              position={labelPos as any}
                              style={{ textAnchor: "middle", fontWeight: "bold" }}
                              dx={labelDxOffset}
                            />
                          </YAxis>
                        );
                      })}

                      <RTooltip content={<MultiSeriesTooltip />} />
                      <Legend />

                      {complete.map((s, i) => {
                        const unitConf = unitAxisMap.get(s.unit)!;
                        const name = `${s.buoyName ?? ""} (${s.paramName ?? ""}) [${s.unit}]`;
                        return (
                          <Line
                            key={`s${s._idx}`}
                            type="monotone"
                            dataKey={`s${s._idx}`}
                            name={name}
                            yAxisId={unitConf.id}
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