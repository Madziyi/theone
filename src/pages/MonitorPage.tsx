// src/pages/Monitor.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam } from "@/contexts/TeamContext";

/* ---------- types aligned to your schema ---------- */
type Buoy = {
  buoy_id: number;
  name: string;
  location_nickname: string | null;
  webcam: string | null;
  latitude?: number;
  longitude?: number;
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
  ranges: any; // {green:[min,max],yellow:[min,max],red:[min,max]} OR [{color,min,max}]
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
  measured_at: string; // ISO
  created_at: string;  // ISO
  value: number | null;
  throttled: boolean;
  notified: boolean;
  message: string;
  context: any; // { param_label, buoy_name, measured_at_fmt, ... }
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
    case "critical": return "bg-red-500/4 text-red-500 border-red-500/30";
    case "warning":  return "bg-amber-500/4 text-amber-500 border-amber-500/30";
    default:         return "bg-sky-500/4 text-sky-400 border-sky-500/30";
  }
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

  // object shape
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

  // array shape
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

  const [layout, setLayout] = useState<"grid" | "spotlight">("grid");
  const [cycleIndex, setCycleIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  /* --- Live alert toasts --- */
  type Toast = {
    id: string; // alert_event id
    severity: string;
    title: string;
    time: string; // local HH:MM
    message: string;
    throttled: boolean;
  };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const recentIdsRef = useRef<Set<string>>(new Set());

  const pushToast = useCallback((row: AlertEvent) => {
    // de-dupe by id
    if (recentIdsRef.current.has(row.id)) return;
    recentIdsRef.current.add(row.id);
    // prune set size
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
    ].slice(0, 5)); // cap to 5 visible
  }, []);

  // Subscribe to live alert events for this team
  useEffect(() => {
    if (!currentTeamId) return;
    const ch = supabase.channel("alert-events-monitor")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_events", filter: `team_id=eq.${currentTeamId}` },
        (payload) => pushToast(payload.new as AlertEvent)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("[monitor] realtime: SUBSCRIBED");
        if (status === "TIMED_OUT") console.warn("[monitor] realtime: TIMED_OUT");
        if (status === "CHANNEL_ERROR") console.warn("[monitor] realtime: CHANNEL_ERROR");
        if (status === "CLOSED") console.warn("[monitor] realtime: CLOSED");
      });
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
          .select("buoy_id,name,location_nickname,webcam,latitude,longitude")
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

  /* latest values: refresh ~30s */
  useEffect(() => {
    let cancelled = false;
    async function loadLatest() {
      const out: Record<number, LatestPoint> = {};
      const byBuoy: Record<number, Tile[]> = {};
      for (const t of tiles) (byBuoy[t.buoy_id] ??= []).push(t);

      for (const [bStr, ts] of Object.entries(byBuoy)) {
        const b = Number(bStr);
        for (const t of ts) {
          const { data } = await supabase
            .from("measurements")
            .select("value, timestamp")
            .eq("buoy_id", b)
            .eq("parameter_id", t.parameter_id)
            .order("timestamp", { ascending: false })
            .limit(1)
            .maybeSingle();

          out[t.id] = {
            value: (data as any)?.value ?? null,
            measured_at: (data as any)?.timestamp ?? null,
          };
        }
      }
      if (!cancelled) setLatest(out);
    }
    if (tiles.length) {
      loadLatest();
      const id = setInterval(loadLatest, 30_000);
      return () => { cancelled = true; clearInterval(id); };
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

  const criticalBuoys = useMemo(() => {
    const set = new Set<number>();
    for (const t of tiles) {
      const last = latest[t.id]?.value ?? null;
      const thr = t.thresholds_id ? thresholds[t.thresholds_id] : undefined;
      if (classify(last, thr) === "red") set.add(t.buoy_id);
    }
    return Array.from(set);
  }, [tiles, latest, thresholds]);

  /* === Spotlight scheduler (fixed) === */
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (layout !== "spotlight" || buoyIds.length === 0 || paused) return;

    const cycle = settings?.cycle_seconds ?? 15;

    const critIdxs = criticalBuoys
      .map((id) => buoyIds.indexOf(id))
      .filter((i) => i >= 0);

    const list = (critIdxs.length ? critIdxs : buoyIds.map((_, i) => i));

    let pos = list.indexOf(cycleIndex);
    if (pos < 0) pos = 0;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const tick = () => {
      pos = (pos + 1) % list.length;
      setCycleIndex(list[pos]);
      timerRef.current = window.setTimeout(tick);
    };

    timerRef.current = window.setTimeout(tick);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    layout,
    paused,
    buoyIds,
    cycleIndex,
    criticalBuoys,
    settings?.cycle_seconds,
    settings?.dwell_on_alert_seconds,
  ]);

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

  /* controls */
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
      {/* Live alert toasts (top-right) */}
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
        <Controls />
      </div>

      {/* locations row */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          {buoys.map((b) => (
            <div
              key={b.buoy_id}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5"
            >
              <span className="text-sm">{b.location_nickname ?? b.name}</span>
            </div>
          ))}
        </div>
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
        /* GRID: all buoys */
        Object.entries(groupedByBuoy).map(([bStr, list]) => {
          const b = buoysById[Number(bStr)];
          return (
            <div key={bStr} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{b?.name ?? `Buoy ${bStr}`}</h2>
                <div className="text-xs text-muted">{b?.location_nickname ?? "—"}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* webcam small tile (optional) */}
                {settings?.show_webcam && b?.webcam && (
                  <div className={`rounded-xl border border-border bg-card ${cardPad}`}>
                    <div className="mb-1 text-sm font-medium">Webcam</div>
                    <VideoTile src={b.webcam!} />
                  </div>
                )}

                {list.map((t) => {
                  const meta = params[`${t.buoy_id},${t.parameter_id}`];
                  const unit = meta?.unit ?? "";
                  const name = t.label || meta?.standard_name || `Param ${t.parameter_id}`;
                  const last = latest[t.id];
                  const thr = t.thresholds_id ? thresholds[t.thresholds_id] : undefined;
                  const color = classify(last?.value, thr);
                  const series = settings?.show_sparklines ? sparks[t.id] ?? [] : [];

                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border ${cardPad} shadow-soft ${statusClasses(color)}`}
                    >
                      <div className="text-sm font-medium truncate">{name}</div>
                      <div className="mt-1 text-2xl font-semibold">
                        {last?.value != null ? Number(last.value).toFixed(2) : "—"}
                        <span className="ml-1 text-sm text-muted">{unit}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted">{timeAgo(last?.measured_at)}</div>
                      {series.length > 1 && <Sparkline points={series} />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      ) : (
        /* SPOTLIGHT: same grid style; webcam is just another tile */
        (() => {
          const bId = buoyIds[cycleIndex] ?? buoyIds[0];
          const b = buoysById[bId];
          const list = groupedByBuoy[bId] ?? [];
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">{b?.name}</div>
                <div className="text-xs text-muted">{b?.location_nickname ?? "—"}</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {/* Webcam as a tile (if present) */}
                {settings?.show_webcam && b?.webcam && (
                  <div className={`rounded-xl border border-border bg-card ${cardPad}`}>
                    <div className="mb-1 text-sm font-medium">Webcam</div>
                    <VideoTile src={b.webcam!} />
                  </div>
                )}

                {list.map((t) => {
                  const meta = params[`${t.buoy_id},${t.parameter_id}`];
                  const unit = meta?.unit ?? "";
                  const name = t.label || meta?.standard_name || `Param ${t.parameter_id}`;
                  const last = latest[t.id];
                  const thr = t.thresholds_id ? thresholds[t.thresholds_id] : undefined;
                  const color = classify(last?.value, thr);
                  const series = settings?.show_sparklines ? sparks[t.id] ?? [] : [];

                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl border ${cardPad} text-lg shadow-soft ${statusClasses(color)}`}
                    >
                      <div className="font-medium truncate">{name}</div>
                      <div className="mt-2 text-4xl font-semibold">
                        {last?.value != null ? Number(last.value).toFixed(2) : "—"}
                        <span className="ml-2 text-base text-muted">{unit}</span>
                      </div>
                      <div className="mt-2 text-xs text-muted">{timeAgo(last?.measured_at)}</div>
                      {t.depth != null && (
                        <div className="mt-1 text-xs text-muted">
                          Depth: {Number(t.depth).toFixed(1)} m
                        </div>
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