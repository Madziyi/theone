import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useUnitPreferences } from "@/contexts/UnitPreferencesContext";
import {
  ResponsiveContainer,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Label
} from "recharts";

/* ----------------------------- Types ----------------------------- */
type Buoy = { buoy_id: number | string; name: string; location_nickname?: string | null };
type Parameter = { parameter_id: number; standard_name: string | null; unit: string | null; depth?: number | null };
type UnifiedRow = { ts: string; value: number | null; unit: string; buoy_id: string | number; parameter_id: number };
type LatestRow = { parameter_id: number; value: number | null; measured_at: string | null; unit?: string | null };
type AlertEvent = {
  id: string;
  team_id: string;
  rule_id: string;
  kind: string;
  severity: string;
  buoy_id: number | null;
  parameter_id: number | null;
  measured_at: string;
  created_at: string;
  value: number | null;
  throttled: boolean;
  message: string;
  context: any;
};
type RangeKey = "24h" | "7d" | "30d";
type TeamId = {team_id: string | null};

/* ----------------------------- Units ----------------------------- */
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
    K: { "°C": (k) => k - 273.15, "°F": (k) => (k - 273.15) * 9/5 + 32 },
    "°C": { K: (c) => c + 273.15, "°F": (c) => (c * 9/5) + 32 },
    "°F": { K: (f) => (f - 32) * 5/9 + 273.15, "°C": (f) => (f - 32) * 5/9 },
  },
  pressure: {
    Pa: { Psi: (pa) => pa * 0.000145038, kPa: (pa) => pa / 1000 },
    Psi: { Pa: (psi) => psi / 0.000145038, kPa: (psi) => psi * 6.89476 },
    kPa: { Pa: (kpa) => kpa * 1000, Psi: (kpa) => kpa * 0.145038 },
  },
  speed: {
    "m/s": { knots: (ms) => ms * 1.94384, mph: (ms) => ms * 2.23694, "cm/s": (ms) => ms * 100 },
    knots:  { "m/s": (k) => k / 1.94384,  mph: (k) => k * 1.15078,     "cm/s": (k) => (k / 1.94384) * 100 },
    mph:    { "m/s": (m) => m / 2.23694,  knots: (m) => m / 1.15078,   "cm/s": (m) => (m / 2.23694) * 100 },
    "cm/s": { "m/s": (c) => c / 100,      knots: (c) => (c / 100) * 1.94384, mph: (c) => (c / 100) * 2.23694 },
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
  const u = (unit ?? "").toLowerCase();
  if (["k","°c","c","°f","f"].includes(u)) return "temperature" as const;
  if (["pa","kpa","psi"].includes(u)) return "pressure" as const;
  if (["m/s","ms","knots","mph","cm/s"].includes(u)) return "speed" as const;
  if (["m","ft"].includes(u)) return "distance" as const;
  if (["g/l","μg/l","ug/l"].includes(u)) return "concentration" as const;
  return null;
};

function convertUnit(
  value: number,
  from: string,
  cat: keyof UnitConversions | null,
  prefs: ReturnType<typeof useUnitPreferences>["unitPreferences"]
) {
  if (!cat) return { value, unit: from };
  const to = String(prefs[cat] ?? from);
  if (from === to) return { value, unit: from };
  const fn = UNIT_CONVERSIONS[cat]?.[from]?.[to];
  return fn ? { value: fn(value), unit: to } : { value, unit: from };
}

/* ----------------------------- Helpers ----------------------------- */
const formatTick = (timestamp: string, range: RangeKey): string => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  const t24 = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { hour12: false, ...o });
  if (range === "24h") return t24({ hour: "2-digit", minute: "2-digit" }).format(d);
  if (range === "7d")
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${t24({ hour: "2-digit", minute: "2-digit" }).format(d)}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Updated just now";
  if (m < 60) return `Updated ${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Updated ${h} h ago`;
  const d = Math.floor(h / 24);
  return `Updated ${d} d ago`;
}

function cardinalFromDeg(angle: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const idx = Math.round(((angle % 360) / 360) * 16) % 16;
  return dirs[idx];
}

function isDirectionParam(name: string | null) {
  return !!name && /\bdirection\b/i.test(name);
}

/* ====== Threshold helpers (same logic as Monitor) ====== */
type Threshold = {
  id: number;
  team_id: string | null;
  name: string;
  unit: string;
  ranges: any; // {green:[min,max], yellow:[min,max], red:[min,max]} or [{color,min,max}]
};

function classify(value: number | null | undefined, thr?: Threshold | null): "green" | "yellow" | "red" | "gray" {
  if (value == null || thr == null) return "gray";
  const r = thr.ranges;

  const tryObj = (color: "green" | "yellow" | "red") => {
    if (r && Array.isArray(r[color]) && r[color].length === 2) {
      const [min, max] = r[color];
      if ((min == null || value >= Number(min)) && (max == null || value <= Number(max))) return true;
    }
    return false;
  };
  if (tryObj("red")) return "red";
  if (tryObj("yellow")) return "yellow";
  if (tryObj("green")) return "green";

  if (Array.isArray(r)) {
    for (const band of r) {
      const min = band?.min ?? null;
      const max = band?.max ?? null;
      if ((min == null || value >= Number(min)) && (max == null || value <= Number(max))) {
        const c = String(band?.color ?? "gray").toLowerCase();
        if (c === "red" || c === "yellow" || c === "green") return c as any;
      }
    }
  }
  return "gray";
}

function statusClasses(c: "green" | "yellow" | "red" | "gray") {
  switch (c) {
    case "green": return "border-green-300 bg-green-50 dark:bg-green-950/30";
    case "yellow": return "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30";
    case "red": return "border-red-300 bg-red-50 dark:bg-red-950/30 alert-ring";
    default: return "border-border bg-card";
  }
}

/* ---------------------------- Page ---------------------------- */
export default function ParameterDetailPage() {
  const { buoyId: buoyIdRaw, paramId: paramIdRaw } = useParams();
  const buoyId = buoyIdRaw ? (isNaN(Number(buoyIdRaw)) ? String(buoyIdRaw) : Number(buoyIdRaw)) : "";
  const paramId = paramIdRaw ? Number(paramIdRaw) : NaN;

  const { unitPreferences, updatePreference } = useUnitPreferences();

  const [buoy, setBuoy] = useState<Buoy | null>(null);
  const [param, setParam] = useState<Parameter | null>(null);

  const [latest, setLatest] = useState<LatestRow | null>(null);
  const [series24, setSeries24] = useState<UnifiedRow[]>([]);
  const [series7d, setSeries7d] = useState<UnifiedRow[]>([]);
  const [series30d, setSeries30d] = useState<UnifiedRow[]>([]);
  const [loading, setLoading] = useState(true);

  // threshold (global/default monitor tile)
  const [threshold, setThreshold] = useState<Threshold | null>(null);
  const [teamId, setTeamId] = useState<TeamId | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(false);

  // add pulse ring CSS (like Monitor)
  useEffect(() => {
    const css = `
      @keyframes alertPulse {0%{box-shadow:0 0 0 0 rgba(239,68,68,.6)}70%{box-shadow:0 0 0 10px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
      .alert-ring { animation: alertPulse 1.6s ease-out infinite; border-color: rgb(239 68 68) }
    `;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Load buoy + parameter metadata
  useEffect(() => {
    if (!buoyId || !paramId) return;
    (async () => {
      const [{ data: b }, { data: p }] = await Promise.all([
        supabase.from("buoys").select("buoy_id,name,location_nickname").eq("buoy_id", buoyId).maybeSingle(),
        supabase.from("parameters").select("parameter_id,standard_name,unit,depth").eq("buoy_id", buoyId).eq("parameter_id", paramId).maybeSingle(),
      ]);
      setBuoy((b as any) ?? null);
      setParam(p ? { ...(p as any), parameter_id: Number((p as any).parameter_id) } : null);
    })();
  }, [buoyId, paramId]);

useEffect(() => {
  if (!buoyId) return;

  const fetchTeamId = async () => {
    try {
      const { data, error } = await supabase
        .from("team_buoys")
        .select("team_id")
        .eq("buoy_id", buoyId)
        .limit(1);

      if (data && data.length > 0) {
        setTeamId(data.team_id); // ✅ Fix: Access first item in array
      } else {
        setTeamId(null);
      }
    } catch (err) {
      setTeamId(null);
    }
  };

  fetchTeamId();
}, [buoyId]);


  // Try to load a default/global threshold for this buoy+parameter (no team scope)
useEffect(() => {
  if (!buoyId || !paramId || !teamId) return; // ✅ Require all three

  let cancelled = false;

  (async () => {
    try {
      console.log("Fetching threshold for buoy:", buoyId, "and parameter:", paramId, "with Team ID", teamId);
      
      const { data: mt } = await supabase
        .from("monitor_tiles")
        .select("thresholds_id")
        .eq("team_id", teamId)
        .eq("buoy_id", buoyId)
        .eq("parameter_id", paramId)
        .limit(1)
        .maybeSingle();

      const tid = (mt as any)?.thresholds_id as number | null | undefined;

      if (!tid) {
        if (!cancelled) setThreshold(null);
        return;
      }

      const { data: thr } = await supabase
        .from("monitor_thresholds")
        .select("id,team_id,name,unit,ranges")
        .eq("id", tid)
        .maybeSingle();

      if (!cancelled) {
        setThreshold((thr as any) ?? null);
      }
    } catch (error) {
      if (!cancelled) setThreshold(null);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [buoyId, paramId, teamId]); // ✅ Fix: include teamId in dependencies


  // Load charts (fire once on param change)
  useEffect(() => {
    if (!paramId) return;
    const now = new Date();
    const iso = (d: Date) => d.toISOString();

    const loadRange = async (hours: number) => {
      const end = new Date(now);
      const start = new Date(end.getTime() - hours * 3600_000);
      const { data, error } = await supabase.rpc("get_measurement_unified", {
        param_id: paramId,
        start_time: iso(start),
        end_time: iso(end),
      });
      if (error) throw error;
      const rows = ((data ?? []) as UnifiedRow[]).filter(r => String(r.buoy_id) === String(buoyId));
      return rows;
    };

    (async () => {
      try {
        setLoading(true);
        const [d24, d7d, d30d] = await Promise.all([
          loadRange(24),
          loadRange(7 * 24),
          loadRange(30 * 24),
        ]);
        setSeries24(d24);
        setSeries7d(d7d);
        setSeries30d(d30d);
      } catch {
        setSeries24([]); setSeries7d([]); setSeries30d([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [buoyId, paramId]);

  // Latest value: poll every 60s
  useEffect(() => {
    if (!buoyId || !paramId) return;
    let cancelled = false;

    async function fetchLatest() {
      const cutoffISO = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { data, error } = await supabase.rpc("get_latest_measurements", {
        p_buoy_id: isNaN(Number(buoyId)) ? String(buoyId) : Number(buoyId),
        p_cutoff: cutoffISO,
      });
      if (error) return;
      const row = ((data ?? []) as any[]).find(r => Number(r.parameter_id) === Number(paramId));
      if (!cancelled) {
        setLatest(row ? { parameter_id: Number(row.parameter_id), value: row.value, measured_at: row.measured_at, unit: row.unit ?? null } : null);
      }
    }

    fetchLatest();
    const id = setInterval(fetchLatest, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [buoyId, paramId]);

  const cat = getCategory(param?.standard_name ?? null, param?.unit ?? "" );

  // Convert a series to preferred unit
  const convertSeries = (rows: UnifiedRow[]) => rows.map(r => {
    if (r.value == null) return { ts: r.ts, value: null };
    const { value } = convertUnit(r.value, r.unit, cat, unitPreferences);
    return { ts: r.ts, value };
  });

  const s24 = useMemo(() => convertSeries(series24), [series24, cat, unitPreferences]);
  const s7d = useMemo(() => convertSeries(series7d), [series7d, cat, unitPreferences]);
  const s30d = useMemo(() => convertSeries(series30d), [series30d, cat, unitPreferences]);

  const yUnitLabel = useMemo(() => {
    if (!cat) return param?.unit ?? "";
    return String(unitPreferences[cat] ?? param?.unit ?? "");
  }, [cat, unitPreferences, param?.unit]);

  const latestDisplay = useMemo(() => {
    if (!latest || latest.value == null) return { text: "—", sub: "" };
    if (isDirectionParam(param?.standard_name ?? null)) {
      const deg = Number(latest.value);
      return { text: `${cardinalFromDeg(deg)} `, sub: `(${deg.toFixed(2)}°)` };
    }
    const { value, unit } = convertUnit(latest.value, latest.unit ?? (param?.unit ?? ""), cat, unitPreferences);
    return { text: Number(value).toFixed(2), sub: ` ${unit}` };
  }, [latest, param?.standard_name, param?.unit, cat, unitPreferences]);

  const latestColor = classify(latest?.value ?? null, threshold);

  return (
    <section className="mx-auto max-w-6xl px-3 py-4 space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold truncate">
              {param?.standard_name ?? `Parameter ${paramId}`}
            </div>
            <div className="text-sm text-muted truncate">
              {buoy?.name ?? `Buoy ${String(buoyId)}`}
              {buoy?.location_nickname ? ` — ${buoy.location_nickname}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-border bg-primary px-3 py-1.5 text-sm text-white hover:text-gray-700"
              onClick={() => setAlertsOpen(true)}
            >
              Previous alerts
            </button>
          </div>
        </div>
      </div>

      {/* Latest — threshold styling applied if available */}
      <div className={`rounded-2xl border p-4 ${statusClasses(latestColor)}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-muted">Latest</div>
            <div className="mt-1 text-4xl font-semibold leading-none">
              {latestDisplay.text}
              <span className="text-base text-muted">{latestDisplay.sub}</span>
            </div>
            <div className="mt-2 text-xs text-muted">{timeAgo(latest?.measured_at ?? null)}</div>
          </div>
          {/* Units control */}
          <UnitsInline />
        </div>
      </div>

      {/* 24h */}
      <SeriesCard
        title="Past 24 hours"
        data={s24}
        range="24h"
        yUnitLabel={yUnitLabel}
        paramLabel={param?.standard_name ?? "Value"}
        loading={loading}
      />
      {/* 7d */}
      <SeriesCard
        title="Past 7 days"
        data={s7d}
        range="7d"
        yUnitLabel={yUnitLabel}
        paramLabel={param?.standard_name ?? "Value"}
        loading={loading}
      />
      {/* 30d */}
      <SeriesCard
        title="Past 30 days"
        data={s30d}
        range="30d"
        yUnitLabel={yUnitLabel}
        paramLabel={param?.standard_name ?? "Value"}
        loading={loading}
      />

      {/* Alerts Modal (scoped to this buoy+param, panel-like) */}
      {alertsOpen && (
        <AlertsForParamModal
          buoyId={buoyId}
          paramId={paramId}
          onClose={() => setAlertsOpen(false)}
        />
      )}
    </section>
  );
}

/* ---------------------------- UI Parts ---------------------------- */

function UnitsInline() {
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

function SeriesCard({
  title, data, range, yUnitLabel, paramLabel, loading,
}: {
  title: string;
  data: { ts: string; value: number | null }[];
  range: "24h" | "7d" | "30d";
  yUnitLabel: string;
  paramLabel: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      {loading ? (
        <div className="h-[50vh] min-h-[320px] rounded-xl bg-card animate-pulse grid place-items-center text-sm text-muted">
          Loading…
        </div>
      ) : !data.length ? (
        <div className="grid h-64 place-items-center text-sm text-muted">No data</div>
      ) : (
        <div className="h-[50vh] min-h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={(tick: string) => formatTick(tick, range)}
                interval="preserveStartEnd"
                minTickGap={50}
                angle={-20}
                textAnchor="end"
                height={50}
                tick={{ fontSize: 10 }}
              >
                <Label value="Timeline" offset={0} position="insideBottom" style={{ fontWeight: "bold" }} />
              </XAxis>
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => (Number.isFinite(v) ? v.toFixed(2) : "")}
                tick={{ fontSize: 10 }}
              >
                <Label
                  value={`${paramLabel} (${yUnitLabel})`}
                  angle={-90}
                  position="insideLeft"
                  style={{ textAnchor: "middle", fontWeight: "bold" }}
                />
              </YAxis>
              <RTooltip content={<SingleTooltip displayUnit={yUnitLabel} />} />
              <Line type="monotone" dataKey="value" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SingleTooltip({ active, payload, label, displayUnit }: { active?: boolean; payload?: any[]; label?: string; displayUnit: string; }) {
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

/* ---------- Alerts Panel-like Modal (scoped to this parameter) ---------- */

const KIND_LABEL: Record<string, string> = {
  threshold: "Threshold",
  rate_of_change: "Rate of change",
  trend: "Trend",
  rolling_avg: "Rolling average",
  vertical_gradient: "Vertical gradient",
  cross_parameter: "Cross-parameter",
  spatial_delta: "Spatial delta",
  spatial_coverage: "Spatial coverage",
};

function chipColor(sev: string) {
  switch (sev) {
    case "critical": return "bg-red-500/15 text-red-500 border-red-500/30";
    case "warning":  return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    default:         return "bg-sky-500/15 text-sky-400 border-sky-500/30";
  }
}

type RangeKeyPanel = "24h" | "7d" | "30d" | "custom";

function toISOFromLocal(localDT: string | null | undefined) {
  if (!localDT) return null;
  const d = new Date(localDT);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function ymdKeyFromISO(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function AlertsForParamModal({
  buoyId, paramId, onClose,
}: { buoyId: string | number; paramId: number; onClose: () => void; }) {
  const [range, setRange] = useState<RangeKeyPanel>("24h");
  const [severity, setSeverity] = useState<"all" | "info" | "warning" | "critical">("all");

  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const PAGE_SIZE = 25;

  const { sinceISO, untilISO, validRange } = useMemo(() => {
    const now = new Date();
    if (range !== "custom") {
      const d = new Date(now);
      if (range === "24h") d.setHours(now.getHours() - 24);
      if (range === "7d")  d.setDate(now.getDate() - 7);
      if (range === "30d") d.setDate(now.getDate() - 30);
      return { sinceISO: d.toISOString(), untilISO: now.toISOString(), validRange: true };
    }
    const fromIso = toISOFromLocal(customFrom);
    const toIso = toISOFromLocal(customTo);
    const valid = !!fromIso && !!toIso && new Date(fromIso!).getTime() <= new Date(toIso!).getTime();
    return { sinceISO: fromIso ?? "", untilISO: toIso ?? "", validRange: valid };
  }, [range, customFrom, customTo]);

  useEffect(() => {
    if (range !== "custom") return;
    if (!customFrom || !customTo) {
      const now = new Date();
      const from = new Date(now.getTime() - 24 * 3600 * 1000);
      const toLocal = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      setCustomFrom(toLocal(from));
      setCustomTo(toLocal(now));
    }
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setAlerts([]); setPage(0); setHasMore(true);
  }, [sinceISO, untilISO, severity, range, customFrom, customTo]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasMore) return;
      if (range === "custom" && !validRange) return;
      setLoading(true);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("alert_events")
        .select("*")
        .eq("buoy_id", isNaN(Number(buoyId)) ? String(buoyId) : Number(buoyId))
        .eq("parameter_id", Number(paramId))
        .gte("created_at", sinceISO);

      if (untilISO) q = q.lte("created_at", untilISO);
      if (severity !== "all") q = q.eq("severity", severity);

      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(from, to);

      if (cancelled) return;
      setLoading(false);
      if (error) { console.error("[alerts-for-param] fetch error:", error.message); return; }

      const rows = (data as AlertEvent[]) ?? [];
      setAlerts(prev => [...prev, ...rows]);
      if (rows.length < PAGE_SIZE) setHasMore(false);
    })();
    return () => { cancelled = true; };
  }, [buoyId, paramId, page, hasMore, sinceISO, untilISO, severity, range, validRange]);

  const groups = useMemo(() => {
    const by: Record<string, AlertEvent[]> = {};
    for (const a of alerts) {
      const key = ymdKeyFromISO(a.measured_at || a.created_at);
      (by[key] ||= []).push(a);
    }
    const keys = Object.keys(by).sort((a, b) => (a < b ? 1 : -1));
    return { keys, by };
  }, [alerts]);

  const toggleCard = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const loadMore = () => setPage(p => p + 1);

  return (
    <div className="fixed inset-0 z-[2000] bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">Previous alerts</h3>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <select
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  value={range}
                  onChange={(e) => setRange(e.target.value as RangeKeyPanel)}
                  aria-label="Time range"
                >
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="custom">Custom…</option>
                </select>
                {range === "custom" && (
                  <>
                    <label className="text-xs text-muted">From</label>
                    <input
                      type="datetime-local"
                      className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                    />
                    <label className="text-xs text-muted">To</label>
                    <input
                      type="datetime-local"
                      className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                    />
                  </>
                )}
                <select
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as any)}
                  aria-label="Severity filter"
                >
                  <option value="all">All severities</option>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
                <button className="h-9 rounded-lg border border-border px-2 text-sm" onClick={onClose}>
                  Close
                </button>
              </div>
            </div>

            {range === "custom" && !validRange && (
              <div className="mt-2 text-xs text-red-400">Please select a valid custom range (From ≤ To).</div>
            )}

            <div className="mt-3 space-y-4">
              {groups.keys.length === 0 && !loading && validRange && (
                <div className="py-10 text-center text-sm text-muted">No alerts found in this range.</div>
              )}

              {groups.keys.map(dateKey => (
                <section key={dateKey}>
                  <h4 className="mb-2 text-sm font-semibold text-muted">{dateKey}</h4>
                  <div className="space-y-2">
                    {groups.by[dateKey].map((a) => {
                      const ctx = a.context || {};
                      const titleParam = ctx.param_label ?? ctx.base_param_label ?? ctx.param_name ?? "—";
                      const title = `${KIND_LABEL[a.kind] ?? a.kind} • ${titleParam}`;
                      const t = new Date(a.measured_at || a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                      const isOpen = !!expanded[a.id];

                      return (
                        <article key={a.id} className="rounded-xl border border-border bg-background">
                          <button
                            className="w-full flex items-center gap-2 px-3 py-2 text-left"
                            onClick={() => toggleCard(a.id)}
                            aria-expanded={isOpen}
                          >
                            <h3 className="text-sm font-semibold truncate">{title}</h3>

                            <span className={`ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chipColor(a.severity)}`}>
                              {a.severity}
                            </span>

                            {a.throttled && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-xs text-purple-400">
                                throttled
                              </span>
                            )}

                            <span className="ml-auto text-xs text-muted">{t}</span>
                          </button>

                          {isOpen && (
                            <div className="px-3 pb-3">
                              <pre className="whitespace-pre-wrap rounded-lg border border-border/60 bg-card p-2 text-[12px] leading-5">
{a.message}
                              </pre>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}

              <div className="mt-3 flex items-center justify-between">
                {loading ? (
                  <div className="text-xs text-muted">Loading…</div>
                ) : hasMore ? (
                  <button
                    className="h-9 rounded-lg border border-border bg-primary px-3 text-sm text-white hover:bg-accent/30"
                    onClick={loadMore}
                    disabled={range === "custom" && !validRange}
                    title={range === "custom" && !validRange ? "Set a valid custom range first" : "Load more"}
                  >
                    Load more
                  </button>
                ) : (
                  groups.keys.length > 0 && <div className="text-xs text-muted">End of results</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}