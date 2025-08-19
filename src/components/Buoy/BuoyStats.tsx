import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ReactNode } from "react";
import { useUnitPreferences } from "@/contexts/UnitPreferencesContext";
import { Button } from "@/components/ui/button";
import {
  Thermometer,
  Gauge,
  Waves,
  Compass,
  Ruler,
  FlaskConical,
  Wind,
  Droplet,
  GaugeCircle,
  Clock,
} from "lucide-react";

type Buoy = {
  id: number;
  buoy_id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type LatestRow = {
  parameter_id: number;
  standard_name: string | null;
  value: number | null;
  unit: string;
  depth: number | null;
  measured_at: string;
};

/* -------------------- Unit conversions (yours, verbatim logic) -------------------- */

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

/* -------------------- Icons by category (lucide) -------------------- */

const ICONS = {
  temperature: Thermometer,
  pressure: Gauge,
  wave: Waves,
  speed: GaugeCircle,       // for derived speed
  direction: Compass,       // for derived direction
  distance: Ruler,
  concentration: FlaskConical,
  wind: Wind,
  turbidity: Droplet,
  cdom: Droplet,
  saturation: Gauge,
} as const;

type IconKey = keyof typeof ICONS;

const getIconCategory = (name: string): IconKey | null => {
  const lower = name.toLowerCase();
  if (lower.includes("temperature")) return "temperature";
  if (lower.includes("pressure")) return "pressure";
  if (lower.includes("wind")) return "wind";
  if (lower.includes("wave")) return "wave";
  if (lower.includes("speed")) return "speed";
  if (lower.includes("direction")) return "direction";
  if (lower.includes("height")) return "distance";
  if (lower.includes("turbidity")) return "turbidity";
  if (lower.includes("cdom")) return "cdom";
  if (lower.includes("saturation")) return "saturation";
  if (lower.includes("chlorophyll") || lower.includes("phycocyanin")) return "concentration";
  return null;
};

/* -------------------- Data hooks & helpers -------------------- */

function useLatestForBuoy(buoyKey: number | string | null) {
  const [rows, setRows] = useState<LatestRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (buoyKey == null || buoyKey === "") { setRows([]); return; }
    (async () => {
      setLoading(true);
      try {
        // Use buoy_id (string/number) for RPC
        const { data, error } = await supabase.rpc("get_latest_measurements", { p_buoy_id: buoyKey } as any);
        if (error) throw error;
        if (!cancelled) {
          setRows((data ?? []).map((r: any) => ({
            parameter_id: Number(r.parameter_id),
            standard_name: r.standard_name ?? null,
            value: r.value,
            unit: r.unit ?? "",
            depth: r.depth ?? null,
            measured_at: r.measured_at,
          })));
        }
      } catch {
        // Fallback: read table by buoy_id
        const { data } = await supabase
          .from("measurements")
          .select("parameter_id, value, unit, measured_at:timestamp, depth:depth, buoy_id")
          .eq("buoy_id", buoyKey)
          .order("timestamp", { ascending: false })
          .limit(1000);
        if (!cancelled) {
          const seen = new Set<number>();
          const out: LatestRow[] = [];
          for (const r of (data ?? []) as any[]) {
            const pid = Number(r.parameter_id);
            if (seen.has(pid)) continue;
            seen.add(pid);
            out.push({
              parameter_id: pid,
              standard_name: null,
              value: r.value,
              unit: r.unit ?? "",
              depth: r.depth ?? null,
              measured_at: r.measured_at,
            });
          }
          setRows(out);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [buoyKey]);

  return { rows, loading };
}

function groupByDepth(rows: LatestRow[]) {
  const by: Record<number, LatestRow[]> = {};
  for (const r of rows) {
    const d = Math.round(((r.depth ?? 0) as number) * 10) / 10;
    (by[d] ??= []).push(r);
  }
  return by;
}

// Hide eastward/northward water velocities anywhere they appear
const isENVelocity = (name: string | null) =>
  !!name && /(eastward|northward)\s+(water\s+)?velocity/i.test(name);
 

function depthLabel(depth: number | null, preferred: "m" | "ft") {
  const d = depth ?? 0;
  if (d === 0) return "Surface";
  const val = preferred === "ft" ? d * 3.28084 : d;
  return `${val.toFixed(1)}${preferred}`;
}

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Updated just now";
  if (m < 60) return `Updated ${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Updated about ${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  return `Updated about ${d} day${d === 1 ? "" : "s"} ago`;
}

/* -------------------- Component -------------------- */

export default function BuoyStats({ buoy, onClose }: { buoy: Buoy; onClose: () => void }) {
  const { rows, loading } = useLatestForBuoy(buoy?.buoy_id ?? null);
  const { unitPreferences } = useUnitPreferences();
  const visible = useMemo(() => rows.filter((r) => !isENVelocity(r.standard_name)), [rows]);
  const byDepth = useMemo(() => groupByDepth(visible), [visible]);

  return (
    <div
      className={
        "fixed inset-0 z-[1200] overflow-y-auto " +
        "bg-white text-black " +
        "dark:bg-gradient-to-br dark:from-[#0b1a2b] dark:to-[#132c47] dark:text-white"
      }
      role="dialog"
      aria-modal="true"
      aria-label={`Realtime data for ${buoy.name}`}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border/60 bg-white/80 backdrop-blur dark:bg-black/20">
        <div className="text-sm text-muted">{buoy.latitude.toFixed(4)}, {buoy.longitude.toFixed(4)}</div>
        <Button variant="outline" size="sm" onClick={onClose} aria-label="Close stats">Close</Button>
      </div>

      <div className="mx-auto max-w-6xl p-4 space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold">{buoy.name}</h2>
        </div>

        {loading && (
          <div className="h-40 grid place-items-center text-sm text-muted">Loading buoy data…</div>
        )}

        {!loading && Object.keys(byDepth).length === 0 && (
          <div className="h-40 grid place-items-center text-sm text-muted">No recent measurements.</div>
        )}

        {Object.entries(byDepth)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([depth, items]) => (
            <section key={depth} className="space-y-4">
              {/* Centered depth header with dividers */}
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-black/10 dark:bg-white/20" />
                <div className="text-sm font-semibold">
                  {depthLabel(Number(depth), unitPreferences.distance === "ft" ? "ft" : "m")}
                </div>
                <div className="h-px flex-1 bg-black/10 dark:bg-white/20" />
              </div>

              {/* Responsive cards: 2 cols mobile, scale up on larger screens */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {items.map((r) => (
                  <MetricCard key={`${r.parameter_id}-${r.depth ?? 0}`} row={r} prefs={unitPreferences} />
                ))}
              </div>
            </section>
          ))}
      </div>
    </div>
  );
}

/* -------------------- Presentational parts -------------------- */

function MetricCard({ row, prefs }: { row: LatestRow; prefs: UnitPreferences }) {
  const name = row.standard_name ?? `Parameter ${row.parameter_id}`;
  const iconKey = getIconCategory(name) ?? "gauge";
  // Fallback icon if key not found
  const Icon = (ICONS as any)[iconKey] ?? Gauge;

  // Direction special case
  const isDirection = (row.standard_name ?? "").toLowerCase().includes("direction");
  let valueEl: ReactNode;

  if (isDirection) {
    const deg = row.value ?? 0;
    valueEl = (
      <div className="text-2xl font-semibold">
        {cardinalFromDeg(deg)} <span className="text-base text-muted">({deg.toFixed(0)}°)</span>
      </div>
    );
  } else {
    const category = getConversionCategory(name);
    let val = row.value;
    let outUnit = row.unit;

    if (val != null && category) {
      val = convertUnit(val, row.unit, category, prefs);
      // Preferred unit label from preferences
      outUnit = String(prefs[category] ?? row.unit);
    }

    valueEl = (
      <div className="text-2xl font-semibold">
        {val != null ? Number(val).toFixed(2) : "—"}{" "}
        <span className="text-base text-muted">{outUnit}</span>
      </div>
    );
  }

  return (
    <article className="rounded-2xl border border-border/70 bg-card/90 shadow-soft p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 opacity-80" aria-hidden />
        <span>{name}</span>
      </div>
      <div className="mt-2">{valueEl}</div>
      <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        <Clock className="h-3.5 w-3.5" aria-hidden />
        <span>{timeAgo(row.measured_at)}</span>
      </div>
    </article>
  );
}

function cardinalFromDeg(angle: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  const idx = Math.round(((angle % 360) / 360) * 16) % 16;
  return dirs[idx];
}