// src/pages/Monitor.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useUnitPreferences } from "@/contexts/UnitPreferencesContext";
import { useTeam } from "@/contexts/TeamContext";
import OperatorsLogModal from "@/components/OperatorsLog/OperatorsLogModal";


/* ---------- types aligned to your schema ---------- */
type BuoyStatus = "active" | "inactive" | "retrieved";
type Buoy = {
  buoy_id: number;
  name: string;
  location_nickname: string | null;
  webcam: string | null;
  latitude?: number;
  longitude?: number;
  status?: BuoyStatus | null;
};

type Tile = {
  id: number;
  team_id: string | null;
  buoy_id: number;
  parameter_id: number;
  thresholds_id: number | null;
  depth: number | null;
  label: string | null;
  order_index?: number | null;
};

type Threshold = {
  id: number;
  team_id: string | null;
  name: string;
  unit: string;
  ranges: any;
};

type Param = {
  buoy_id: number;
  parameter_id: number;
  standard_name: string;
  unit: string | null;
  depth: number | null;
};

type LatestPoint = { value: number | null; measured_at: string | null };
type Spark = { t: number; v: number | null };

type Settings = {
  team_id: string;
  layout_mode: "grid" | "spotlight";
  cycle_seconds: number;
  dwell_on_alert_seconds: number;
  show_sparklines: boolean;
  show_webcam: boolean;
  tile_density: "comfortable" | "compact";
};

/* Alert events (for live toasts) */
type AlertEventKind =
  | "threshold"
  | "rate_of_change"
  | "trend"
  | "rolling_avg"
  | "vertical_gradient"
  | "cross_parameter"
  | "spatial_delta"
  | "spatial_coverage";

type AlertEventSeverity = "info" | "warning" | "critical" | string;

type AlertEvent = {
  id: string;
  team_id: string;
  rule_id: string;
  kind: AlertEventKind;
  severity: AlertEventSeverity;
  buoy_id: number | null;
  parameter_id: number | null;
  measured_at: string;
  created_at: string;
  value: number | null;
  throttled: boolean;
  notified: boolean;
  message: string;
  context: any;
};

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

/* -------------------- Unit conversions -------------------- */
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
    "°C": { K: (c) => c + 273.15, "°F": (c) => (c * 9 / 5) + 32 },
    "°F": { K: (f) => (f - 32) * 5 / 9 + 273.15, "°C": (f) => (f - 32) * 5 / 9 },
  },
  pressure: {
    Pa: { Psi: (pa) => pa * 0.000145038, kPa: (pa) => pa / 1000 },
    Psi: { Pa: (psi) => psi / 0.000145038, kPa: (psi) => psi * 6.89476 },
    kPa: { Pa: (kpa) => kpa * 1000, Psi: (kpa) => kpa * 0.145038 },
  },
  speed: {
   "m/s":  { knots: (ms) => ms * 1.94384, mph: (ms) => ms * 2.23694, "cm/s": (ms) => ms * 100 },
   knots:  { "m/s": (k) => k / 1.94384,  mph: (k) => k * 1.15078,     "cm/s": (k) => (k / 1.94384) * 100 },
   mph:    { "m/s": (m) => m / 2.23694,  knots: (m) => m / 1.15078,   "cm/s": (m) => (m / 2.23694) * 100 },
   "cm/s": { "m/s": (c) => c / 100,      knots: (c) => (c / 100) * 1.94384, mph: (c) => (c / 100) * 2.23694 },
  },
  distance: {
    m: { ft: (m) => m * 3.28084 },
    ft: { m: (f) => f / 3.28084 },
  },
  concentration: {
    "g/L": { "μg/L": (g) => g * 1_000_000 },
  },
};

type UnitPreferences = ReturnType<typeof useUnitPreferences>["unitPreferences"];
const UNIT_OPTIONS: Record<keyof UnitPreferences, string[]> = {
  temperature: ["°C", "K", "°F"],
  pressure: ["Pa", "Psi", "kPa"],
  speed: ["m/s", "cm/s", "knots", "mph"],
  distance: ["m", "ft"],
  concentration: ["g/L", "μg/L"],
};

const convertUnit = (
  value: number,
  fromUnit: string,
  category: keyof UnitConversions,
  unitPreferences: UnitPreferences
): number => {
  const preferredUnit = unitPreferences[category] as string;
  if (fromUnit === preferredUnit) return value;
  const conversions = UNIT_CONVERSIONS[category];
  return conversions?.[fromUnit]?.[preferredUnit]?.(value) ?? value;
};

const getConversionCategory = (name: string): keyof UnitConversions | null => {
  const lower = name.toLowerCase();
  if (lower.includes("temperature")) return "temperature";
  if (lower.includes("pressure")) return "pressure";
  if (lower.includes("velocity") || lower.includes("speed")) return "speed";
  if (lower.includes("height")) return "distance";
  if (lower.includes("chlorophyll") || lower.includes("phycocyanin")) return "concentration";
  return null;
};

/* Small helpers for display conversion */
function resolveDisplay(
  rawValue: number | null | undefined,
  meta: Param | undefined,
  prefs: UnitPreferences
): { value: number | null; unit: string } {
  if (rawValue == null || !meta) return { value: null, unit: meta?.unit ?? "" };
  const from = meta.unit ?? "";
  const cat = getConversionCategory(meta.standard_name ?? "");
  if (!cat || !from) return { value: rawValue, unit: from };
  return {
    value: convertUnit(rawValue, from, cat, prefs),
    unit: String(prefs[cat] ?? from),
  };
}

function convertSeriesToPrefs(series: Spark[], meta: Param | undefined, prefs: UnitPreferences): Spark[] {
  if (!meta || !meta.unit) return series;
  const cat = getConversionCategory(meta.standard_name ?? "");
  if (!cat) return series;
  return series.map((p) => ({
    t: p.t,
    v: p.v == null ? null : convertUnit(p.v, meta.unit as string, cat, prefs),
  }));
}

/* ---------- utils ---------- */
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

function classify(
  value: number | null | undefined,
  thr?: Threshold
): "green" | "yellow" | "red" | "gray" {
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
    case "green":
      return "border-green-300 bg-green-50 dark:bg-green-950/30";
    case "yellow":
      return "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30";
    case "red":
      return "border-red-300 bg-red-50 dark:bg-red-950/30 alert-ring";
    default:
      return "border-border bg-card";
  }
}

/* ---------- Direction helpers ---------- */
function isDirectionParam(name?: string | null) {
  return !!name && name.toLowerCase().includes("direction");
}
function cardinalFromDeg(angle: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const idx = Math.round(((angle % 360) / 360) * 16) % 16;
  return dirs[idx];
}

/* ---------- tiny sparkline (no deps) ---------- */
function Sparkline({ points, height = 36 }: { points: Spark[]; height?: number }) {
  const width = 140;
  const pad = 4;
  const xs = points.map((p) => p.t);
  const ys = points.filter((p) => p.v != null).map((p) => p.v as number);
  const tMin = xs.length ? Math.min(...xs) : 0;
  const tMax = xs.length ? Math.max(...xs) : 1;
  const vMin = ys.length ? Math.min(...ys) : 0;
  const vMax = ys.length ? Math.max(...ys) : 1;
  const x = (t: number) =>
    tMax === tMin ? width / 2 : pad + ((width - 2 * pad) * (t - tMin)) / (tMax - tMin);
  const y = (v: number) =>
    vMax === vMin ? height / 2 : height - pad - ((height - 2 * pad) * (v - vMin)) / (vMax - vMin);

  const path = points
    .filter((p) => p.v != null)
    .map((p, i) => `${i ? "L" : "M"} ${x(p.t).toFixed(1)} ${y(Number(p.v)).toFixed(1)}`)
    .join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="mt-1">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" opacity={0.7} />
    </svg>
  );
}

/* ---------- webcam tile ---------- */
function VideoTile({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isHls = /\.m3u8($|\?)/i.test(src);

  useEffect(() => {
    if (!isHls) return;

    const video = videoRef.current;
    if (!video) return;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }

    let hls: any;
    (async () => {
      const Hls = (await import("hls.js")).default;
      if (Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(video);
      } else {
        video.src = src;
      }
    })();

    return () => {
      try { hls?.destroy?.(); } catch {}
    };
  }, [src, isHls]);

  if (isHls) {
    return (
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        controls
        className="w-full rounded-xl border border-border"
      />
    );
  }
  return (
    <video
      src={src}
      autoPlay
      muted
      loop
      playsInline
      controls
      className="w-full rounded-xl border border-border"
    />
  );
}

/*--------operator logs-------*/
function MonitorHeaderExtras() {
  const [logOpen, setLogOpen] = useState(false);
  return (
    <>
      <button
        className="rounded-lg border border-border bg-card px-3 py-1 text-sm hover:bg-accent/30"
        onClick={() => setLogOpen(true)}
      >
        Operators’ Log
      </button>
      <OperatorsLogModal open={logOpen} onClose={() => setLogOpen(false)} />
    </>
  );
}


/* ---------- main component ---------- */
export default function Monitor() {
  const { currentTeamId, isManager } = useTeam();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [buoys, setBuoys] = useState<Buoy[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [params, setParams] = useState<Record<string, Param>>({});
  const [thresholds, setThresholds] = useState<Record<number, Threshold>>({});
  const [latest, setLatest] = useState<Record<number, LatestPoint>>({});
  const [sparks, setSparks] = useState<Record<number, Spark[]>>({});
  const [loading, setLoading] = useState(true);

  const { unitPreferences, updatePreference } = useUnitPreferences();
  const [showUnits, setShowUnits] = useState(false);

  const [layout, setLayout] = useState<"grid" | "spotlight">("grid");
  const [cycleIndex, setCycleIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  /* --- Live alert toasts --- */
  type Toast = {
    id: string;
    severity: string;
    title: string;
    time: string;
    message: string;
    throttled: boolean;
  };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const recentIdsRef = useRef<Set<string>>(new Set());

  const pushToast = useCallback((row: AlertEvent) => {
    if (recentIdsRef.current.has(row.id)) return;
    recentIdsRef.current.add(row.id);
    if (recentIdsRef.current.size > 200) {
      recentIdsRef.current = new Set(Array.from(recentIdsRef.current).slice(-100));
    }

    const ctx = row.context ?? {};
    const titleParam = ctx.param_label ?? ctx.base_param_label ?? ctx.param_name ?? "—";
    const title = `${KIND_LABEL[row.kind] ?? row.kind} • ${titleParam}`;
    const t = new Date(row.measured_at || row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    setToasts((prev) => [
      {
        id: row.id,
        severity: row.severity,
        title,
        time: t,
        message: row.message,
        throttled: !!row.throttled,
      },
      ...prev,
    ].slice(0, 5));
  }, []);

  useEffect(() => {
    if (!currentTeamId) return;
    const ch = supabase.channel("alert-events-monitor")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_events", filter: `team_id=eq.${currentTeamId}` },
        (payload) => pushToast(payload.new as AlertEvent)
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentTeamId, pushToast]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  /* blinking CSS (drop-in) */
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

  /* settings */
  useEffect(() => {
    if (!currentTeamId) return;
    (async () => {
      const { data } = await supabase
        .from("monitor_settings")
        .select("*")
        .eq("team_id", currentTeamId)
        .maybeSingle();
      if (data) {
        setSettings(data as any);
        setLayout((data as any).layout_mode);
      } else {
        const d: Settings = {
          team_id: currentTeamId,
          layout_mode: "grid",
          cycle_seconds: 15,
          dwell_on_alert_seconds: 30,
          show_sparklines: true,
          show_webcam: true,
          tile_density: "comfortable",
        };
        setSettings(d);
      }
    })();
  }, [currentTeamId]);

  const saveSettings = async (partial: Partial<Settings>) => {
    if (!currentTeamId || !isManager) return;
    const next = { ...(settings as any), ...partial, team_id: currentTeamId } as Settings;
    setSettings(next);
    setLayout(next.layout_mode);
    await supabase.from("monitor_settings").upsert(next, { onConflict: "team_id" });
  };

  /* team buoys + tiles (team or global) */
  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: tb, error: e1 } = await supabase
        .from("team_buoys")
        .select("buoy_id")
        .eq("team_id", currentTeamId);

      if (e1 || !tb || tb.length === 0) {
        if (!cancelled) {
          setBuoys([]);
          setTiles([]);
          setLoading(false);
        }
        return;
      }
      const ids = tb.map((r) => r.buoy_id);

      const [{ data: bs }, { data: tsTeam }, { data: tsGlobal }] = await Promise.all([
        supabase
          .from("buoys")
          .select("buoy_id,name,location_nickname,webcam,latitude,longitude,status")
          .in("buoy_id", ids),
        supabase
          .from("monitor_tiles")
          .select("id,team_id,buoy_id,parameter_id,thresholds_id,depth,label,order_index")
          .eq("team_id", currentTeamId)
          .in("buoy_id", ids),
        supabase
          .from("monitor_tiles")
          .select("id,team_id,buoy_id,parameter_id,thresholds_id,depth,label,order_index")
          .is("team_id", null)
          .in("buoy_id", ids),
      ]);

      if (cancelled) return;

      const seen = new Set<string>();
      const merged: Tile[] = [];
      (tsTeam ?? []).forEach((t: any) => {
        merged.push(t);
        seen.add(`${t.buoy_id}-${t.parameter_id}-${t.depth ?? "null"}`);
      });
      (tsGlobal ?? []).forEach((t: any) => {
        const key = `${t.buoy_id}-${t.parameter_id}-${t.depth ?? "null"}`;
        if (!seen.has(key)) merged.push(t);
      });

      merged.sort((a: any, b: any) => (a.order_index ?? 9999) - (b.order_index ?? 9999));

      setBuoys((bs as any[]) ?? []);
      setTiles(merged as any[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [currentTeamId]);

  /* params for all tiles */
  useEffect(() => {
    if (tiles.length === 0) { setParams({}); return; }
    let cancelled = false;
    (async () => {
      const keyset = new Set(tiles.map((t) => `${t.buoy_id},${t.parameter_id}`));
      const byBuoy: Record<number, number[]> = {};
      for (const k of Array.from(keyset)) {
        const [b, p] = k.split(",").map(Number);
        (byBuoy[b] ??= []).push(p);
      }
      const results: Param[] = [];
      for (const [bStr, pids] of Object.entries(byBuoy)) {
        const { data } = await supabase
          .from("parameters")
          .select("buoy_id,parameter_id,standard_name,unit,depth")
          .eq("buoy_id", Number(bStr))
          .in("parameter_id", pids);
        results.push(...(((data as any[]) ?? []) as Param[]));
      }
      if (cancelled) return;
      const map: Record<string, Param> = {};
      for (const r of results) map[`${r.buoy_id},${r.parameter_id}`] = r;
      setParams(map);
    })();
    return () => { cancelled = true; };
  }, [tiles]);

  /* thresholds */
  useEffect(() => {
    const ids = Array.from(
      new Set(tiles.map((t) => t.thresholds_id).filter((x): x is number => !!x))
    );
    if (ids.length === 0) { setThresholds({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("monitor_thresholds")
        .select("id,team_id,name,unit,ranges")
        .in("id", ids);
      if (cancelled) return;
      const map: Record<number, Threshold> = {};
      for (const r of (data ?? []) as Threshold[]) map[r.id] = r;
      setThresholds(map);
    })();
    return () => { cancelled = true; };
  }, [tiles]);

  /* latest values via RPC: refresh ~30s */
  useEffect(() => {
    let cancelled = false;

    async function loadLatest() {
      const CUTOFF_HOURS = 24;
      const cutoffISO = new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000).toISOString();

      const out: Record<number, LatestPoint> = {};
      const byBuoy: Record<number, Tile[]> = {};
      for (const t of tiles) {
        (byBuoy[t.buoy_id] ??= []).push(t);
        out[t.id] = { value: null, measured_at: null };
      }

      for (const [bStr, ts] of Object.entries(byBuoy)) {
        const b = Number(bStr);
        const { data, error } = await supabase.rpc("get_latest_measurements", {
          p_buoy_id: b,
          p_cutoff: cutoffISO,
        });

        if (error) {
          console.warn("[monitor] get_latest_measurements error", { buoy: b, error: error.message });
          continue;
        }

        const latestByParam = new Map<number, { value: number | null; measured_at: string | null }>();
        for (const r of (data as any[]) ?? []) {
          latestByParam.set(Number(r.parameter_id), {
            value: r.value ?? null,
            measured_at: r.measured_at ?? null,
          });
        }

        for (const t of ts) {
          const hit = latestByParam.get(t.parameter_id);
          if (hit) out[t.id] = hit;
        }
      }

      if (!cancelled) setLatest(out);
    }

    if (tiles.length) {
      loadLatest();
      const id = setInterval(loadLatest, 30_000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    } else {
      setLatest({});
    }
  }, [tiles]);

  /* sparklines last 24h: refresh ~5m */
  useEffect(() => {
    let cancelled = false;
    async function loadSparks() {
      const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const out: Record<number, Spark[]> = {};
      const byBuoy: Record<number, Tile[]> = {};
      for (const t of tiles) (byBuoy[t.buoy_id] ??= []).push(t);

      for (const [bStr, ts] of Object.entries(byBuoy)) {
        const b = Number(bStr);
        const pids = Array.from(new Set(ts.map((t) => t.parameter_id)));
        for (const pid of pids) {
          const { data } = await supabase
            .from("measurements")
            .select("parameter_id, timestamp, value")
            .eq("buoy_id", b)
            .eq("parameter_id", pid)
            .gte("timestamp", sinceISO)
            .order("timestamp", { ascending: true });

          const rows = (data ?? []) as any[];
          const series = rows.map((r) => ({
            t: new Date(r.timestamp).getTime(),
            v: r.value as number | null,
          }));
          ts.filter((t) => t.parameter_id === pid).forEach((t) => {
            out[t.id] = series;
          });
        }
      }
      if (!cancelled) setSparks(out);
    }
    if (tiles.length) {
      loadSparks();
      const id = setInterval(loadSparks, 5 * 60_000);
      return () => { cancelled = true; clearInterval(id); };
    } else {
      setSparks({});
    }
  }, [tiles]);

  /* computed helpers */
  const buoysById = useMemo(() => {
    const m: Record<number, Buoy> = {};
    for (const b of buoys) m[b.buoy_id] = b;
    return m;
  }, [buoys]);

  const groupedByBuoy = useMemo(() => {
    const m: Record<number, Tile[]> = {};
    for (const t of tiles) (m[t.buoy_id] ??= []).push(t);
    return m;
  }, [tiles]);

  const buoyIds = useMemo(() => buoys.map((b) => b.buoy_id), [buoys]);
  const activeBuoyIds = useMemo(
    () => buoys.filter((b) => b.status !== "inactive").map((b) => b.buoy_id),
    [buoys]
  );
  const spotList = useMemo(
    () => (activeBuoyIds.length ? activeBuoyIds : buoyIds),
    [activeBuoyIds, buoyIds]
  );

  useEffect(() => {
    if (cycleIndex >= spotList.length) setCycleIndex(0);
  }, [spotList.length, cycleIndex]);

  const criticalBuoys = useMemo(() => {
    const set = new Set<number>();
    for (const t of tiles) {
      const last = latest[t.id]?.value ?? null;
      const thr = t.thresholds_id ? thresholds[t.thresholds_id] : undefined;
      if (classify(last, thr) === "red") set.add(t.buoy_id);
    }
    return Array.from(set);
  }, [tiles, latest, thresholds]);

  /* Spotlight scheduler: fixed 30s rotation, skip inactive */
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (layout !== "spotlight" || paused || spotList.length === 0) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    intervalRef.current = window.setInterval(() => {
      setCycleIndex((i) => (i + 1) % spotList.length);
    }, 30_000);
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [layout, paused, spotList.length]);

  /* hotkeys + fullscreen */
  useEffect(() => {
    const toggleFullscreen = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f") toggleFullscreen();
      if (e.key === "g") setLayout("grid");
      if (e.key === "s") setLayout("spotlight");
      if (e.key === " ") setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* UI density */
  const cardPad = settings?.tile_density === "compact" ? "p-2" : "p-3";

  const Controls = () => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="rounded-lg border border-border bg-card px-2 py-1 text-xs">
        Layout:
        <button
          className={`ml-2 rounded px-2 py-1 ${layout === "grid" ? "bg-primary text-white" : "hover:bg-accent/30"}`}
          onClick={() => (isManager ? saveSettings({ layout_mode: "grid" }) : setLayout("grid"))}
        >
          Grid (g)
        </button>
        <button
          className={`ml-1 rounded px-2 py-1 ${layout === "spotlight" ? "bg-primary text-white" : "hover:bg-accent/30"}`}
          onClick={() => (isManager ? saveSettings({ layout_mode: "spotlight" }) : setLayout("spotlight"))}
        >
          Spotlight (s)
        </button>
      </div>
      <button
        className="rounded-lg border border-border bg-card px-3 py-1 text-xs hover:bg-accent/30"
        onClick={() => setPaused((p) => !p)}
        disabled={layout !== "spotlight"}
        title="Pause/resume slideshow (space)"
      >
        {paused ? "Resume" : "Pause"}
      </button>
      <button
        className="rounded-lg border border-border bg-card px-3 py-1 text-xs hover:bg-accent/30"
        onClick={() =>
          !document.fullscreenElement
            ? document.documentElement.requestFullscreen()
            : document.exitFullscreen()
        }
        title="Fullscreen (f)"
      >
        Full screen
      </button>
    </div>
  );

  /* render */
  return (
    <section className="mx-auto max-w-[1400px] px-3 py-4 space-y-4">
      {/* Live alert toasts */}
      <div
        className="pointer-events-none fixed right-3 top-3 z-[2000] flex w-[min(92vw,420px)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border bg-card p-3 shadow-soft ${chipColor(t.severity)}`}
          >
            <div className="flex items-start gap-2">
              <div className="grid min-w-0">
                <div className="text-sm font-semibold truncate">{t.title}</div>
                <div className="mt-1 text-xs opacity-80">{t.time}{t.throttled ? " • throttled" : ""}</div>
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                className="ml-auto rounded-md border border-current/30 px-2 py-0.5 text-xs hover:bg-white/10"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-background p-2 text-[12px] leading-5">
{t.message}
            </pre>
          </div>
        ))}
      </div>

      {/* header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-semibold">Monitor</div>
        <MonitorHeaderExtras />
        <Controls />
      </div>

      {/* locations row (inactive chips in RED) */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          {buoys.map((b) => {
            const inactive = b.status === "inactive";
            return (
              <div
                key={b.buoy_id}
                className={
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 border " +
                  (inactive
                    ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:border-red-500"
                    : "border-border bg-card")
                }
                title={inactive ? "Inactive buoy (excluded from Spotlight cycle)" : ""}
              >
                <span className={"text-sm " + (inactive ? "text-red-700" : "")}>
                  {b.location_nickname ?? b.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Units floating button (bottom-right) */}
      <div className="fixed right-7 bottom-[4.5rem] z-[1300] pb-[env(safe-area-inset-bottom)]">
        <button
          className="rounded-xl border border-2 border-blue-300 border-solid border-border bg-card/80 px-3 py-2 text-sm shadow-soft backdrop-blur"
          onClick={() => setShowUnits((s) => !s)}
          aria-expanded={showUnits}
        >
          ⚙️ Units
        </button>

        {showUnits && (
          <div className="absolute right-0 bottom-full mb-2 w-64 rounded-xl border border-border bg-card/95 p-3 shadow-soft">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Unit Preferences</h3>
              <button
                className="text-sm text-muted hover:opacity-80"
                onClick={() => setShowUnits(false)}
                aria-label="Close unit panel"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              {(Object.keys(unitPreferences) as Array<keyof typeof unitPreferences>).map((key) => (
                <label key={key} className="grid grid-cols-[1fr_auto] items-center gap-2 text-sm">
                  <span className="capitalize">{key}</span>
                  <select
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                    value={unitPreferences[key]}
                    onChange={(e) => updatePreference(key, e.target.value as any)}
                  >
                    {UNIT_OPTIONS[key].map((u) => (
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

      {/* body */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : buoys.length === 0 ? (
        <div className="text-sm text-muted">No buoys configured for this team.</div>
      ) : layout === "grid" ? (
        /* GRID */
        Object.entries(groupedByBuoy).map(([bStr, list]) => {
          const b = buoysById[Number(bStr)];
          return (
            <div key={bStr} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{b?.name ?? `Buoy ${bStr}`}</h2>
                <div className="text-xs text-muted">{b?.location_nickname ?? "—"}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* webcam tile */}
                {settings?.show_webcam && b?.webcam && (
                  <div className={`rounded-xl border border-border bg-card ${cardPad}`}>
                    <div className="mb-1 text-sm font-medium">Webcam</div>
                    <VideoTile src={b.webcam!} />
                  </div>
                )}

                {list.map((t) => {
                  const meta = params[`${t.buoy_id},${t.parameter_id}`];

                  // direction formatting override
                  const isDir = isDirectionParam(meta?.standard_name);
                  const last = latest[t.id];
                  const rawVal = last?.value;

                  const name = t.label || meta?.standard_name || `Param ${t.parameter_id}`;
                  const thr = t.thresholds_id ? thresholds[t.thresholds_id] : undefined;
                  const color = classify(rawVal, thr);

                  const baseSeries = settings?.show_sparklines ? (sparks[t.id] ?? []) : [];
                  const series = convertSeriesToPrefs(baseSeries, meta, unitPreferences);

                  const depthText =
                    t.depth == null
                      ? null
                      : unitPreferences.distance === "ft"
                      ? `${(Number(t.depth) * 3.28084).toFixed(1)} ft`
                      : `${Number(t.depth).toFixed(1)} m`;

                  // compute displayed value
                  let valueEl: React.ReactNode;
                  if (isDir) {
                    const deg = typeof rawVal === "number" ? rawVal : 0;
                    valueEl = (
                      <div className="mt-1 text-2xl font-semibold">
                        {cardinalFromDeg(deg)} <span className="text-sm text-muted">({deg.toFixed(0)}°)</span>
                      </div>
                    );
                  } else {
                    const resolved = resolveDisplay(rawVal, meta, unitPreferences);
                    valueEl = (
                      <div className="mt-1 text-2xl font-semibold">
                        {resolved.value != null ? Number(resolved.value).toFixed(2) : "—"}
                        <span className="ml-1 text-sm text-muted">{resolved.unit}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border ${cardPad} shadow-soft ${statusClasses(color)}`}
                    >
                      <div className="text-sm font-medium truncate">{name}</div>
                      {valueEl}
                      <div className="mt-1 text-xs text-muted">{timeAgo(last?.measured_at)}</div>
                      {depthText && (
                        <div className="mt-0.5 text-[11px] text-muted">Depth: {depthText}</div>
                      )}
                      {series.length > 1 && <Sparkline points={series} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        /* SPOTLIGHT: same grid, cycling through spotList every 30s */
        (() => {
          const bId = spotList[cycleIndex] ?? spotList[0];
          const b = bId != null ? buoysById[bId] : undefined;
          const list = bId != null ? (groupedByBuoy[bId] ?? []) : [];

          if (!b) return null;

          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{b?.name}</div>
                <div className="text-xs text-muted">{b?.location_nickname ?? "—"}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* webcam tile */}
                {settings?.show_webcam && b?.webcam && (
                  <div className={`rounded-xl border border-border bg-card ${cardPad}`}>
                    <div className="mb-1 text-sm font-medium">Webcam</div>
                    <VideoTile src={b.webcam!} />
                  </div>
                )}

                {list.map((t) => {
                  const meta = params[`${t.buoy_id},${t.parameter_id}`];

                  const isDir = isDirectionParam(meta?.standard_name);
                  const last = latest[t.id];
                  const rawVal = last?.value;

                  const name = t.label || meta?.standard_name || `Param ${t.parameter_id}`;
                  const thr = t.thresholds_id ? thresholds[t.thresholds_id] : undefined;
                  const color = classify(rawVal, thr);

                  const baseSeries = settings?.show_sparklines ? (sparks[t.id] ?? []) : [];
                  const series = convertSeriesToPrefs(baseSeries, meta, unitPreferences);

                  const depthText =
                    t.depth == null
                      ? null
                      : unitPreferences.distance === "ft"
                      ? `${(Number(t.depth) * 3.28084).toFixed(1)} ft`
                      : `${Number(t.depth).toFixed(1)} m`;

                  let valueEl: React.ReactNode;
                  if (isDir) {
                    const deg = typeof rawVal === "number" ? rawVal : 0;
                    valueEl = (
                      <div className="mt-2 text-4xl font-semibold">
                        {cardinalFromDeg(deg)}{" "}
                        <span className="text-base text-muted">({deg.toFixed(0)}°)</span>
                      </div>
                    );
                  } else {
                    const resolved = resolveDisplay(rawVal, meta, unitPreferences);
                    valueEl = (
                      <div className="mt-2 text-4xl font-semibold">
                        {resolved.value != null ? Number(resolved.value).toFixed(2) : "—"}
                        <span className="ml-2 text-base text-muted">{resolved.unit}</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border ${cardPad} text-lg shadow-soft ${statusClasses(color)}`}
                    >
                      <div className="font-medium truncate">{name}</div>
                      {valueEl}
                      <div className="mt-2 text-xs text-muted">{timeAgo(last?.measured_at)}</div>
                      {depthText && (
                        <div className="mt-1 text-xs text-muted">Depth: {depthText}</div>
                      )}
                      {series.length > 1 && <Sparkline points={series} height={48} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()
      )}
    </section>
  );
}