import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useUnitPreferences } from "@/contexts/UnitPreferencesContext";
import {
  ResponsiveContainer,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Label, Legend,
} from "recharts";

/* ----------------------------- Types ----------------------------- */
type Buoy = { buoy_id: number; name: string; location_nickname?: string | null };
type ParamMeta = { parameter_id: number; buoy_id: number; standard_name: string | null; unit: string | null; depth?: number | null };

type UnifiedRow = { ts: string; value: number | null; unit: string; buoy_id: number; parameter_id: number };
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

type AlertRule = {
  id: string;
  team_id: string;
  name: string | null;
  config: any; // {"base":{buoy_id,parameter_id}, "compares":[{buoy_id,parameter_id}], "delta":..., ...}
};

type Threshold = {
  id: number;
  team_id: string | null;
  name: string;
  unit: string;
  ranges: any; // {green:[min,max],yellow:[min,max],red:[min,max]} OR [{color,min,max}]
};

type TileRow = {
  id: number; team_id: string | null; buoy_id: number; parameter_id: number; thresholds_id: number | null;
};

type RangeKey = "24h" | "7d" | "30d";

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

function cardinalFromDeg(angle: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const idx = Math.round(((angle % 360) / 360) * 16) % 16;
  return dirs[idx];
}

// === Ten-minute grid & forward-fill (same as above) ===
export function buildTenMinuteGrid(startISO: string, endISO: string) {
  const start = new Date(startISO).getTime();
  const end = new Date(endISO).getTime();
  const grid: string[] = [];
  const step = 10 * 60 * 1000;
  for (let t = Math.ceil(start / step) * step; t <= end; t += step) {
    grid.push(new Date(t).toISOString());
  }
  return grid;
}

export function forwardFillToGrid(
  series: { ts: string; value: number | null }[],
  grid: string[]
): (number | null)[] {
  const values: (number | null)[] = [];
  let i = 0;
  let last: number | null = null;
  const s = series.slice().sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (const g of grid) {
    const gt = Date.parse(g);
    while (i < s.length && Date.parse(s[i].ts) <= gt) {
      last = s[i].value;
      i++;
    }
    values.push(last);
  }
  return values;
}


// Pick nearest value to bucket time within tolerance; otherwise null
function nearestValueAt(
  series: { ts: string; value: number | null }[],
  tBucket: number,
  toleranceMs: number
): number | null {
  if (!series.length) return null;
  let lo = 0, hi = series.length - 1;
  while (lo < hi && Date.parse(series[lo + 1].ts) <= tBucket) lo++;
  const cand: { dt: number; v: number | null }[] = [];
  for (let k = Math.max(0, lo - 1); k <= Math.min(series.length - 1, lo + 1); k++) {
    const dt = Math.abs(Date.parse(series[k].ts) - tBucket);
    cand.push({ dt, v: series[k].value });
  }
  cand.sort((a, b) => a.dt - b.dt);
  return cand[0].dt <= toleranceMs ? (cand[0].v ?? null) : null;
}


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
const formatTick = (timestamp: string, range: RangeKey): string => {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  const t24 = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { hour12: false, ...o });
  if (range === "24h") return t24({ hour: "2-digit", minute: "2-digit" }).format(d);
  if (range === "7d")
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${t24({ hour: "2-digit", minute: "2-digit" }).format(d)}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
function pad(n: number, w = 2) { return String(n).padStart(w, "0"); }
function isoNowMinusHours(h: number) {
  const end = new Date(); const start = new Date(end.getTime() - h * 3600_000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/* ---------- thresholds (copied from Monitor) ---------- */
function classify(value: number | null | undefined, thr?: Threshold): "green" | "yellow" | "red" | "gray" {
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

/* ---------- tiny sparkline ---------- */
function Sparkline({ points, height = 36 }: { points: { t: number; v: number | null }[]; height?: number }) {
  const width = 140; const pad = 4;
  const xs = points.map((p) => p.t);
  const ys = points.filter((p) => p.v != null).map((p) => p.v as number);
  const tMin = xs.length ? Math.min(...xs) : 0;
  const tMax = xs.length ? Math.max(...xs) : 1;
  const vMin = ys.length ? Math.min(...ys) : 0;
  const vMax = ys.length ? Math.max(...ys) : 1;
  const x = (t: number) => tMax === tMin ? width / 2 : pad + ((width - 2 * pad) * (t - tMin)) / (tMax - tMin);
  const y = (v: number) => vMax === vMin ? height / 2 : height - pad - ((height - 2 * pad) * (v - vMin)) / (vMax - vMin);
  const path = points.filter((p) => p.v != null).map((p, i) => `${i ? "L" : "M"} ${x(p.t).toFixed(1)} ${y(Number(p.v)).toFixed(1)}`).join(" ");
  return <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mt-1">
    <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.7} />
  </svg>;
}

/* ----------------------------- Page ----------------------------- */
export default function SpatialDeltaDetailPage() {
  const { alertId } = useParams();
  const { unitPreferences } = useUnitPreferences();

  const [alertRow, setAlertRow] = useState<AlertEvent | null>(null);
  const [rule, setRule] = useState<AlertRule | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

  const [buoysById, setBuoysById] = useState<Record<number, Buoy>>({});
  const [paramsById, setParamsById] = useState<Record<number, ParamMeta>>({});

  type Participant = { buoy_id: number; parameter_id: number; role: "base" | "compare" };
  const [participants, setParticipants] = useState<Participant[]>([]);

  const [latest, setLatest] = useState<Record<number, LatestRow>>({});
  const [sparks, setSparks] = useState<Record<number, { t: number; v: number | null }[]>>({});
  const [compareSeries, setCompareSeries] = useState<Record<number, { ts: string; value: number | null }[]>>({});
  const [compareUnits, setCompareUnits] = useState<Record<number, string>>({}); // parameter_id -> unit label after conversion

  const [thresholds, setThresholds] = useState<Record<number, Threshold | null>>({}); // parameter_id -> Threshold|null
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingCompare, setLoadingCompare] = useState(true);
  const [range, setRange] = useState<RangeKey>("24h");
  const [compareGrid, setCompareGrid] = useState<Array<{ ts: string; [key: string]: number | null | string }>>([]);


  useEffect(() => {
    if (!alertId) {
      console.warn("No alertId found in URL.");
      return;
    }

    (async () => {
      setLoadingMeta(true);
      console.log("Fetching alert event for alertId:", alertId);

      const { data: a, error: alertError } = await supabase
        .from("alert_events")
        .select("*")
        .eq("id", alertId)
        .maybeSingle();

      if (alertError) {
        console.error("Error fetching alert event:", alertError);
      }

      if (!a) {
        console.warn("No alert event found for alertId:", alertId);
        setLoadingMeta(false);
        return;
      }

      console.log("Alert event data:", a);
      setAlertRow(a as any);
      setTeamId((a as any).team_id);

      console.log("Fetching alert rule for rule_id:", (a as any).rule_id);

      const { data: r, error: ruleError } = await supabase
        .from("alert_rules")
        .select("id, team_id, kind, config")
        .eq("id", (a as any).rule_id)
        .maybeSingle();

      if (ruleError) {
        console.error("Error fetching alert rule:", ruleError);
      }

      if (!r) {
        console.warn("No rule found for rule_id:", (a as any).rule_id);
      } else {
        console.log("Alert rule data:", r);
      }

      const cfg = (r as any)?.config ?? {};
      const base = cfg?.base as { buoy_id: number; parameter_id: number };
      const compares = (cfg?.compares ?? []) as Array<{ buoy_id: number; parameter_id: number }>;

      const ps: Participant[] = [];
      if (base?.buoy_id && base?.parameter_id) ps.push({ ...base, role: "base" });
      for (const c of compares) {
        if (c?.buoy_id && c?.parameter_id) ps.push({ ...c, role: "compare" });
      }

      console.log("Participants:", ps);
      setParticipants(ps);

      const buoyIds = Array.from(new Set(ps.map(p => p.buoy_id)));
      const paramIds = Array.from(new Set(ps.map(p => p.parameter_id)));

      console.log("Fetching buoys:", buoyIds);
      console.log("Fetching parameters:", paramIds);

      const [{ data: bs, error: buoyError }, { data: psMeta, error: paramError }] = await Promise.all([
        supabase
          .from("buoys")
          .select("buoy_id,name,location_nickname")
          .in("buoy_id", buoyIds),
        supabase
          .from("parameters")
          .select("parameter_id,buoy_id,standard_name,unit,depth")
          .in("parameter_id", paramIds),
      ]);

      if (buoyError) {
        console.error("Error fetching buoys:", buoyError);
      }
      if (paramError) {
        console.error("Error fetching parameters:", paramError);
      }

      console.log("Fetched buoys:", bs);
      console.log("Fetched parameters:", psMeta);

      const bMap: Record<number, Buoy> = {};
      (bs ?? []).forEach((b: any) => {
        bMap[b.buoy_id] = b;
      });

      const pMap: Record<number, ParamMeta> = {};
      (psMeta ?? []).forEach((p: any) => {
        pMap[p.parameter_id] = p;
      });

      setBuoysById(bMap);
      setParamsById(pMap);

      setLoadingMeta(false);
      console.log("Metadata loading complete.");
    })();
  }, [alertId]);

  // Load thresholds per parameter by preferring team tile over global tile
  useEffect(() => {
    (async () => {
      if (!teamId || participants.length === 0) { setThresholds({}); return; }
      const paramIds = Array.from(new Set(participants.map(p => p.parameter_id)));
      const buoyIds = Array.from(new Set(participants.map(p => p.buoy_id)));

      // fetch team tiles then global tiles
      const [{ data: tTeam }, { data: tGlobal }] = await Promise.all([
        supabase.from("monitor_tiles")
          .select("id,team_id,buoy_id,parameter_id,thresholds_id")
          .eq("team_id", teamId)
          .in("buoy_id", buoyIds)
          .in("parameter_id", paramIds),
        supabase.from("monitor_tiles")
          .select("id,team_id,buoy_id,parameter_id,thresholds_id")
          .is("team_id", null)
          .in("buoy_id", buoyIds)
          .in("parameter_id", paramIds),
      ]);

      // Choose per (b,p) preferring team tile
      const byKey = new Map<string, TileRow>();
      (tGlobal ?? []).forEach((t: any) => byKey.set(`${t.buoy_id}-${t.parameter_id}`, t));
      (tTeam ?? []).forEach((t: any) => byKey.set(`${t.buoy_id}-${t.parameter_id}`, t)); // overwrite with team pref

      const thrIds = Array.from(new Set(Array.from(byKey.values()).map(t => t.thresholds_id).filter(Boolean))) as number[];
      let thrMap: Record<number, Threshold> = {};
      if (thrIds.length) {
        const { data: thrs } = await supabase.from("monitor_thresholds").select("*").in("id", thrIds);
        (thrs ?? []).forEach((r: any) => { thrMap[r.id] = r; });
      }

      const result: Record<number, Threshold | null> = {};
      participants.forEach((p) => {
        const key = `${p.buoy_id}-${p.parameter_id}`;
        const tile = byKey.get(key);
        result[p.parameter_id] = tile?.thresholds_id ? thrMap[tile.thresholds_id] ?? null : null;
      });
      setThresholds(result);
    })();
  }, [teamId, participants]);

  // Load cards: latest + 24h sparkline
  useEffect(() => {
    if (participants.length === 0) { setLatest({}); setSparks({}); return; }
    (async () => {
      setLoadingCards(true);
      const CUTOFF_HOURS = 24;
      const cutoffISO = new Date(Date.now() - CUTOFF_HOURS * 3600_000).toISOString();

      // latest per buoy
      const byBuoy: Record<number, Participant[]> = {};
      for (const p of participants) (byBuoy[p.buoy_id] ??= []).push(p);

      const latestOut: Record<number, LatestRow> = {};
      await Promise.all(Object.entries(byBuoy).map(async ([bStr, list]) => {
        const b = Number(bStr);
        const { data } = await supabase.rpc("get_latest_measurements", { p_buoy_id: b, p_cutoff: cutoffISO });
        const arr = (data ?? []) as any[];
        for (const p of list) {
          const row = arr.find(r => Number(r.parameter_id) === p.parameter_id);
          if (row) latestOut[p.parameter_id] = { parameter_id: p.parameter_id, value: row.value, measured_at: row.measured_at, unit: row.unit ?? null };
          else latestOut[p.parameter_id] = { parameter_id: p.parameter_id, value: null, measured_at: null, unit: null };
        }
      }));

      // 24h spark per parameter
      const sinceISO = cutoffISO;
      const endISO = new Date().toISOString();
      const sparkOut: Record<number, { t: number; v: number | null }[]> = {};
      await Promise.all(participants.map(async (p) => {
        const { data } = await supabase.rpc("get_measurement_unified", {
          param_id: p.parameter_id, start_time: sinceISO, end_time: endISO,
        });
        const series = ((data ?? []) as UnifiedRow[])
          .filter(r => Number(r.parameter_id) === p.parameter_id)
          .map(r => ({ t: new Date(r.ts).getTime(), v: r.value }));
        sparkOut[p.parameter_id] = series;
      }));

      setLatest(latestOut);
      setSparks(sparkOut);
      setLoadingCards(false);
    })();
  }, [participants]);

  // Compare chart on a 10-minute grid (24h/7d/30d) — forward-fill last value
  useEffect(() => {
    if (participants.length === 0) {
      setCompareSeries({});
      setCompareUnits({});
      setCompareGrid([]);
      return;
    }

    (async () => {
      setLoadingCompare(true);

      const hours =
        range === "24h" ? 24 : range === "7d" ? 7 * 24 : 30 * 24;
      const { startISO, endISO } = isoNowMinusHours(hours);

      // 10-minute grid
      const grid = buildTenMinuteGrid(startISO, endISO);

      const unitOut: Record<number, string> = {};
      const perParamSeries: Record<number, { ts: string; value: number | null }[]> = {};

      await Promise.all(
        participants.map(async (p) => {
          const meta = paramsById[p.parameter_id];
          const cat = getCategory(meta?.standard_name ?? null, meta?.unit ?? "");
          const { data } = await supabase.rpc("get_measurement_unified", {
            param_id: p.parameter_id,
            start_time: startISO,
            end_time: endISO,
          });

          const rows = ((data ?? []) as UnifiedRow[])
            .filter((r) => Number(r.parameter_id) === p.parameter_id)
            .map((r) => {
              if (r.value == null) return { ts: r.ts, value: null };
              const conv = convertUnit(r.value, r.unit, cat, unitPreferences);
              unitOut[p.parameter_id] = conv.unit;
              return { ts: r.ts, value: conv.value };
            })
            .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

          perParamSeries[p.parameter_id] = rows;
          if (!(p.parameter_id in unitOut)) unitOut[p.parameter_id] = meta?.unit ?? "";
        })
      );

      // Build merged rows on the common grid, with per-param keys
      const merged: Array<{ ts: string; [key: string]: number | null | string }> = grid.map((iso) => ({ ts: iso }));
      participants.forEach((p) => {
        const key = `p_${p.parameter_id}`;
        const values = forwardFillToGrid(perParamSeries[p.parameter_id] ?? [], grid);
        for (let i = 0; i < merged.length; i++) merged[i][key] = values[i] ?? null;
      });

      // Keep individual converted series if you still use it elsewhere (e.g., unitList)
      setCompareUnits(unitOut);
      setCompareSeries(perParamSeries);
      setCompareGrid(merged);
      setLoadingCompare(false);
    })();
  }, [participants, paramsById, unitPreferences, range]);

  // Derived: base & deltas
  const baseParamId = useMemo(() => participants.find(p => p.role === "base")?.parameter_id ?? null, [participants]);
  const baseLatestValue = useMemo(() => {
    if (!baseParamId) return null;
    const meta = paramsById[baseParamId];
    const cat = getCategory(meta?.standard_name ?? null, meta?.unit ?? "");
    const src = latest[baseParamId];
    if (!src || src.value == null) return null;
    return convertUnit(src.value, src.unit ?? (meta?.unit ?? ""), cat, unitPreferences).value;
  }, [baseParamId, latest, paramsById, unitPreferences]);

  // Multi-axis mapping: unique units alternating left/right
  const unitList = useMemo(() => {
    const uSet: string[] = [];
    participants.forEach(p => {
      const u = compareUnits[p.parameter_id];
      if (u && !uSet.includes(u)) uSet.push(u);
    });
    return uSet;
  }, [participants, compareUnits]);

  const axisIdForUnit = (u: string) => `y-${uListIndex(u)}`;
  const uListIndex = (u: string) => Math.max(0, unitList.findIndex(x => x === u));
  const axisOrientation = (idx: number): "left" | "right" => (idx % 2 === 0 ? "left" : "right");

  /* ------------------------------- UI ------------------------------- */
  const headerTitle = useMemo(() => {
    const label = alertRow?.context?.param_label ?? alertRow?.context?.base_param_label ?? paramsById[baseParamId ?? -1]?.standard_name ?? "Spatial difference";
    return `Spatial difference: ${label}`;
  }, [alertRow, paramsById, baseParamId]);

  return (
    <section className="mx-auto max-w-7xl px-3 py-4 space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold">{headerTitle}</div>
            <div className="pt-4 text-sm text-muted pb-2">
              {alertRow?.context?.team_name ? `${alertRow.context.team_name} • ` : ""}
              {alertRow?.context?.measured_at_fmt ?? new Date(alertRow?.measured_at ?? alertRow?.created_at ?? Date.now()).toLocaleString([], { hour12: false })}
              {typeof alertRow?.context?.delta_threshold !== "undefined" ? ` • Threshold: ${alertRow.context.delta_threshold}` : ""}
              {typeof alertRow?.context?.max_delta_abs !== "undefined" ? ` • Max Δ: ${alertRow.context.max_delta_abs}` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Cards grid (latest + 24h spark) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loadingCards && Array.from({ length: Math.max(4, participants.length || 4) }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" />
        ))}

        {!loadingCards && participants.map((p) => {
          const meta = paramsById[p.parameter_id];
          const buoy = buoysById[p.buoy_id];
          const last = latest[p.parameter_id];
          const thr = thresholds[p.parameter_id] ?? undefined;

          // threshold coloring uses raw value in its native unit; still gives the correct banding
          const color = classify(last?.value ?? null, thr || undefined);

          // display value in preferred units
          let display = "—", sub = "", when = timeAgo(last?.measured_at ?? null);
          if (last?.value != null) {
            const cat = getCategory(meta?.standard_name ?? null, meta?.unit ?? "");
            const conv = convertUnit(last.value, last.unit ?? (meta?.unit ?? ""), cat, unitPreferences);
            display = Number(conv.value).toFixed(2);
            sub = ` ${conv.unit}`;
          }

          // Δ vs base (converted)
          let deltaText = "";
          if (baseParamId && p.parameter_id !== baseParamId && baseLatestValue != null && last?.value != null) {
            const cat = getCategory(meta?.standard_name ?? null, meta?.unit ?? "");
            const conv = convertUnit(last.value, last.unit ?? (meta?.unit ?? ""), cat, unitPreferences);
            const d = Math.abs(Number(conv.value) - Number(baseLatestValue));
            deltaText = `Δ ${d.toFixed(2)} ${convertUnit(1, last.unit ?? (meta?.unit ?? ""), cat, unitPreferences).unit}`;
          }

          const spark = (sparks[p.parameter_id] ?? []).map(({ t, v }) => {
            if (v == null) return { t, v };
            const cat = getCategory(meta?.standard_name ?? null, meta?.unit ?? "");
            const conv = convertUnit(v, meta?.unit ?? "", cat, unitPreferences);
            return { t, v: conv.value };
          });

          return (
            <div key={`${p.buoy_id}-${p.parameter_id}`} className={`rounded-xl border p-3 shadow-soft ${statusClasses(color)}`}>
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold truncate">{buoy?.name ?? `Buoy ${p.buoy_id}`}</div>
                {p.role === "base" && <span className="ml-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-600">BASE</span>}
                {deltaText && <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-600">{deltaText}</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted truncate">{meta?.standard_name ?? `Param ${p.parameter_id}`}</div>

              <div className="mt-2 text-2xl font-semibold">
                {display}<span className="ml-1 text-sm text-muted">{sub}</span>
              </div>
              <div className="mt-1 text-xs text-muted">{when}</div>
              {meta?.depth != null && <div className="mt-0.5 text-[11px] text-muted">Depth: {Number(meta.depth).toFixed(1)} m</div>}
              {spark.length > 1 && <Sparkline points={spark} />}
              <div className="mt-2">
                <Link className="text-xs rounded border border-blue-500/50 border-border px-2 py-1 hover:bg-accent/30" to={`/parameter/${p.buoy_id}/${p.parameter_id}`} title="Open parameter detail">
                  Open parameter detail →
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compare block */}
      <div className="rounded-2xl border border-border p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="text-sm font-semibold">Compare ({participants.length})</div>
          <div className="ml-auto flex items-center gap-1">
            <button className={`h-8 rounded-lg border border-border px-2 text-xs ${range === "24h" ? "bg-primary text-white" : "bg-card"}`} onClick={() => setRange("24h")}>24h</button>
            <button className={`h-8 rounded-lg border border-border px-2 text-xs ${range === "7d" ? "bg-primary text-white" : "bg-card"}`} onClick={() => setRange("7d")}>7d</button>
            <button className={`h-8 rounded-lg border border-border px-2 text-xs ${range === "30d" ? "bg-primary text-white" : "bg-card"}`} onClick={() => setRange("30d")}>30d</button>
          </div>
        </div>

        {loadingCompare ? (
          <div className="grid h-[420px] place-items-center">
            <div className="h-[90%] w-[96%] rounded-xl border border-border bg-card animate-pulse" />
          </div>
        ) : participants.length === 0 ? (
          <div className="grid h-64 place-items-center text-sm text-muted">No series</div>
        ) : (
          <div className="h-[70vh] min-h-[460px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareGrid} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="category"
                  allowDuplicatedCategory={false}
                  tickFormatter={(v) => formatTick(v, range)}
                  interval="preserveStartEnd"
                  minTickGap={50}
                  angle={-20}
                  textAnchor="end"
                  height={50}
                  tick={{ fontSize: 10 }}
                >
                  <Label value="Timeline" offset={0} position="insideBottom" style={{ fontWeight: "bold" }} />
                </XAxis>

                {unitList.map((u, idx) => (
                  <YAxis
                    key={u}
                    yAxisId={axisIdForUnit(u)}
                    orientation={axisOrientation(idx)}
                    tick={{ fontSize: 10 }}
                    domain={["auto", "auto"]}
                  >
                    <Label
                      value={u}
                      angle={idx % 2 === 0 ? -90 : 90}
                      position={idx % 2 === 0 ? "insideLeft" : "insideRight"}
                      style={{ textAnchor: "middle", fontWeight: "bold" }}
                    />
                  </YAxis>
                ))}

                <RTooltip content={<MultiTooltip />} />
                <Legend />

                {participants.map((p, i) => {
                  const u = compareUnits[p.parameter_id] ?? "";
                  const meta = paramsById[p.parameter_id];
                  const name = `${buoysById[p.buoy_id]?.name ?? `Buoy ${p.buoy_id}`} (${meta?.standard_name ?? `Param ${p.parameter_id}`})`;
                  const color = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#22d3ee", "#f472b6"][i % 8];
                  const dataKey = `p_${p.parameter_id}`;
                  return (
                    <Line
                      key={p.parameter_id}
                      type="monotone"
                      dataKey={dataKey}
                      name={name}
                      yAxisId={axisIdForUnit(u)}
                      dot={false}
                      strokeWidth={2}
                      stroke={color}
                      connectNulls
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>

          </div>
        )}
      </div>

      {/* Units floating panel */}
      <UnitsFloatingPanel />
    </section>
  );
}

/* ---------------------------- Tooltip ---------------------------- */
function MultiTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
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
