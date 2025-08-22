import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

/* ========= Types ========= */
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
  context: any;
};

type BuoyOpt = { buoy_id: number; name: string };
type ParamOpt = { parameter_id: number; label: string; buoy_id: number };

type Props = { teamId: string };

/* ========= Labels / chips ========= */
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

/* ========= Helpers ========= */
type RangeKey = "24h" | "7d" | "30d" | "custom";
function toISOFromLocal(localDT: string | null | undefined) {
  // local "YYYY-MM-DDTHH:mm" → ISO UTC string
  if (!localDT) return null;
  const d = new Date(localDT);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function ymdKeyFromISO(iso: string) {
  const d = new Date(iso);
  // stable YYYY-MM-DD (local)
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ========= Realtime ========= */
function useAlertsRealtime(
  teamId: string | null,
  onInsert: (row: AlertEvent) => void
) {
  useEffect(() => {
    if (!teamId) return;
    const ch = supabase
      .channel("alert-events-ui")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_events", filter: `team_id=eq.${teamId}` },
        (payload) => onInsert(payload.new as AlertEvent)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") console.log("[alerts-panel] realtime: SUBSCRIBED");
        if (status === "CHANNEL_ERROR") console.warn("[alerts-panel] realtime: CHANNEL_ERROR");
        if (status === "TIMED_OUT") console.warn("[alerts-panel] realtime: TIMED_OUT");
        if (status === "CLOSED") console.warn("[alerts-panel] realtime: CLOSED");
      });
    return () => { supabase.removeChannel(ch); };
  }, [teamId, onInsert]);
}

/* ========= Main component ========= */
export default function AlertsPanel({ teamId }: Props) {
  // Filters
  const [range, setRange] = useState<RangeKey>("24h");
  const [severity, setSeverity] = useState<"all" | "info" | "warning" | "critical">("all");
  const [buoy, setBuoy] = useState<number | "all">("all");
  const [parameter, setParameter] = useState<number | "all">("all");

  // Custom range (datetime-local values)
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  // Options for filters
  const [buoyOpts, setBuoyOpts] = useState<BuoyOpt[]>([]);
  const [paramOpts, setParamOpts] = useState<ParamOpt[]>([]);

  // Data/paging
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [hasMore, setHasMore] = useState(true);

  // UI: track expanded cards (collapsible)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Compute time bounds
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

  // Prefill custom range when switching to "custom"
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

  // Load filter options (buoys + parameters for team)
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      const { data: tb } = await supabase
        .from("team_buoys")
        .select("buoy_id")
        .eq("team_id", teamId);
      const ids = (tb ?? []).map((r) => r.buoy_id);
      if (!ids.length) { setBuoyOpts([]); setParamOpts([]); return; }

      const { data: bs } = await supabase
        .from("buoys")
        .select("buoy_id,name")
        .in("buoy_id", ids);

      if (!cancelled) {
        setBuoyOpts((bs ?? []).map(b => ({ buoy_id: b.buoy_id, name: b.name })));
      }

      const { data: ps } = await supabase
        .from("parameters")
        .select("buoy_id, parameter_id, standard_name, depth");

      if (!cancelled) {
        const paramOptions = (ps ?? [])
          .filter(p => ids.includes(p.buoy_id))
          .map(p => ({
            buoy_id: p.buoy_id,
            parameter_id: p.parameter_id,
            label: p.depth != null ? `${p.standard_name} (${Number(p.depth).toFixed(1)} m)` : p.standard_name,
          }));
        setParamOpts(paramOptions);
      }
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  // Reset list when filters/time change
  useEffect(() => {
    setAlerts([]);
    setPage(0);
    setHasMore(true);
  }, [sinceISO, untilISO, severity, buoy, parameter, teamId, range, customFrom, customTo]);

  // Fetch paged alerts
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!teamId || !hasMore) return;
      if (range === "custom" && !validRange) return; // wait until valid
      setLoading(true);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("alert_events")
        .select("*", { count: "exact" })
        .eq("team_id", teamId)
        .gte("created_at", sinceISO);

      if (untilISO) q = q.lte("created_at", untilISO);
      if (severity !== "all") q = q.eq("severity", severity);
      if (buoy !== "all") q = q.eq("buoy_id", buoy);
      if (parameter !== "all") q = q.eq("parameter_id", parameter);

      const { data, error } = await q
        .order("created_at", { ascending: false })
        .range(from, to);

      if (cancelled) return;
      setLoading(false);
      if (error) { console.error("[alerts-panel] fetch error:", error.message); return; }

      const rows = (data as AlertEvent[]) ?? [];
      setAlerts(prev => [...prev, ...rows]);
      if (rows.length < PAGE_SIZE) setHasMore(false);
    })();
    return () => { cancelled = true; };
  }, [teamId, page, hasMore, sinceISO, untilISO, severity, buoy, parameter, range, validRange]);

  // Realtime: only append if within current bounds
  const handleInsert = useCallback((row: AlertEvent) => {
    const created = new Date(row.created_at).getTime();
    const from = new Date(sinceISO).getTime();
    const to = untilISO ? new Date(untilISO).getTime() : Number.POSITIVE_INFINITY;

    const inRange = created >= from && created <= to;
    const sevOk = (severity === "all") || (row.severity === severity);
    const buoyOk = (buoy === "all") || (row.buoy_id === buoy);
    const paramOk = (parameter === "all") || (row.parameter_id === parameter);

    if (inRange && sevOk && buoyOk && paramOk) {
      setAlerts(prev => [row, ...prev]);
    }
  }, [sinceISO, untilISO, severity, buoy, parameter]);

  useAlertsRealtime(teamId, handleInsert);

  const loadMore = () => setPage(p => p + 1);

  // Group by local date (YYYY-MM-DD key), show time only in cards
  const groups = useMemo(() => {
    const by: Record<string, AlertEvent[]> = {};
    for (const a of alerts) {
      const key = ymdKeyFromISO(a.measured_at || a.created_at);
      (by[key] ||= []).push(a);
    }
    const keys = Object.keys(by).sort((a, b) => (a < b ? 1 : -1)); // newest date first
    return { keys, by };
  }, [alerts]);

  // Parameter dropdown options scoped by chosen buoy if set
  const visibleParams = useMemo(() => {
    if (buoy === "all") return paramOpts;
    return paramOpts.filter(p => p.buoy_id === buoy);
  }, [paramOpts, buoy]);

  const toggleCard = (id: string) =>
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // Export CSV for current filters + time bounds
  const exportCsv = async () => {
    if (!teamId) return;
    if (range === "custom" && !validRange) return alert("Please set a valid custom range first.");
    const pageSize = 1000;
    let from = 0;
    const rows: AlertEvent[] = [];

    // Page through results
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let q = supabase
        .from("alert_events")
        .select("*")
        .eq("team_id", teamId)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      if (untilISO) q = q.lte("created_at", untilISO);
      if (severity !== "all") q = q.eq("severity", severity);
      if (buoy !== "all") q = q.eq("buoy_id", buoy);
      if (parameter !== "all") q = q.eq("parameter_id", parameter);

      const { data, error } = await q;
      if (error) { console.error("[alerts-panel] export error:", error.message); break; }

      const pageRows = (data as AlertEvent[]) ?? [];
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
      from += pageSize;
    }

    const header = [
      "id","created_at","measured_at","kind","severity","throttled",
      "team_id","buoy_id","parameter_id","value","message","param_label","buoy_name"
    ];
    const csv = [
      header.join(","),
      ...rows.map(r => {
        const ctx = r.context || {};
        const safe = (s: any) => {
          if (s == null) return "";
          const str = String(s).replace(/"/g, '""');
          return `"${str}"`;
        };
        return [
          safe(r.id),
          safe(r.created_at),
          safe(r.measured_at),
          safe(r.kind),
          safe(r.severity),
          safe(r.throttled),
          safe(r.team_id),
          safe(r.buoy_id),
          safe(r.parameter_id),
          safe(r.value),
          safe(r.message),
          safe(ctx.param_label ?? ctx.base_param_label ?? ""),
          safe(ctx.buoy_name ?? ctx.base_buoy_name ?? "")
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateTag = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `alerts-${dateTag}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          value={range}
          onChange={(e) => setRange(e.target.value as RangeKey)}
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

        <select
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          value={buoy}
          onChange={(e) => { const v = e.target.value; setBuoy(v === "all" ? "all" : Number(v)); setParameter("all"); }}
          aria-label="Buoy filter"
        >
          <option value="all">All buoys</option>
          {buoyOpts.map(b => (
            <option key={b.buoy_id} value={b.buoy_id}>{b.name}</option>
          ))}
        </select>

        <select
          className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
          value={parameter}
          onChange={(e) => { const v = e.target.value; setParameter(v === "all" ? "all" : Number(v)); }}
          aria-label="Parameter filter"
        >
          <option value="all">All parameters</option>
          {visibleParams.map(p => (
            <option key={`${p.buoy_id}:${p.parameter_id}`} value={p.parameter_id}>
              {p.label}{buoy === "all" ? ` — Buoy ${p.buoy_id}` : ""}
            </option>
          ))}
        </select>

        <button
          className="ml-auto h-9 rounded-lg border border-border bg-primary px-3 text-sm text-white hover:bg-accent/30"
          onClick={exportCsv}
          disabled={range === "custom" && !validRange}
          title={range === "custom" && !validRange ? "Set a valid custom range first" : "Export current results"}
        >
          Export CSV
        </button>
      </div>

      {/* Range hint for custom */}
      {range === "custom" && !validRange && (
        <div className="mt-2 text-xs text-red-400">
          Please select a valid custom range (From ≤ To).
        </div>
      )}

      {/* Groups by Date */}
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

        {/* Footer */}
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
  );
}