// src/components/Inbox/InboxDrawer.tsx
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { useTeam } from "@/contexts/TeamContext";

type Message = {
  id: string;
  team_id: string;
  title: string;
  body: string | null;
  link_url: string | null;
  link_label: string | null;
  kind: "notice" | "report" | "maintenance" | "other" | "alerts";
  message_kind?: string | null; // chip source (e.g., 'alerts', 'report', etc.)
  priority: number;
  published_at: string;
  expires_at: string | null;
  report_id: string | null;
  reads?: { user_id: string }[]; // via left join
};

/* ===== Alerts (from alert_events) ===== */
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

export default function InboxDrawer({
  open,
  onClose,
  onAcknowledge, // notify parent to refresh badge
}: {
  open: boolean;
  onClose: () => void;
  onAcknowledge?: () => void;
}) {
  const { currentTeamId } = useTeam();

  // Messages (unread, non-expired)
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [hasMore, setHasMore] = useState(true);

  // Alerts (recent 72h)
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({}); // for alert cards

  const sinceISO_30d = useMemo(
    () => new Date(Date.now() - 30 * 24 * 3600_000).toISOString(),
    []
  );
  const sinceISO_72h = useMemo(
    () => new Date(Date.now() - 72 * 3600_000).toISOString(),
    []
  );

  const chipStyle = (k: string) => {
    const key = k.toLowerCase();
    if (key === "alerts" || key === "alert")
      return "border-red-500/30 bg-red-500/15 text-red-500";
    if (key === "report")
      return "border-sky-500/30 bg-sky-500/15 text-sky-500";
    if (key === "maintenance")
      return "border-amber-500/30 bg-amber-500/15 text-amber-500";
    if (key === "notice")
      return "border-indigo-500/30 bg-indigo-500/15 text-indigo-500";
    return "border-border text-foreground/70";
  };

  /* ---------- Load recent alerts (72h) ---------- */
  useEffect(() => {
    if (!open || !currentTeamId) return;
    let cancelled = false;
    (async () => {
      setLoadingAlerts(true);
      const { data, error } = await supabase
        .from("alert_events")
        .select("*")
        .eq("team_id", currentTeamId)
        .eq("throttled", "FALSE")
        .gte("created_at", sinceISO_72h)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!cancelled) {
        setLoadingAlerts(false);
        if (!error) setAlerts((data ?? []) as AlertEvent[]);
        else setAlerts([]);
      }
    })();

    // realtime inserts
    const ch = supabase
      .channel("inbox-alerts-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alert_events", filter: `team_id=eq.${currentTeamId}` },
        (payload) => {
          const row = payload.new as AlertEvent;
          // only show in the 72h section
          if (new Date(row.created_at).getTime() >= Date.now() - 48 * 3600_000) {
            setAlerts(prev => [row, ...prev].slice(0, 100));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); cancelled = true; };
  }, [open, currentTeamId, sinceISO_72h]);

  /* ---------- Load first page of messages ---------- */
  useEffect(() => {
    if (!open || !currentTeamId) return;
    let cancelled = false;
    (async () => {
      setLoadingMsgs(true);
      const { data, error } = await supabase
        .from("inbox_messages")
        .select("*, reads:inbox_message_reads!left(user_id)")
        .eq("team_id", currentTeamId)
        .gte("published_at", sinceISO_30d)
        .lte("published_at", new Date().toISOString())
        .order("priority", { ascending: false })
        .order("published_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (!cancelled) {
        setLoadingMsgs(false);
        if (error) {
          setMsgs([]);
          setHasMore(false);
        } else {
          const rows = (data ?? []) as Message[];
          const now = Date.now();
          const filtered = rows.filter(
            (m) =>
              (!m.reads || m.reads.length === 0) &&
              (!m.expires_at || new Date(m.expires_at).getTime() > now)
          );
          setMsgs(filtered);
          setPage(1);
          setHasMore(rows.length >= PAGE_SIZE);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [open, currentTeamId, sinceISO_30d]);

  const loadMore = async () => {
    if (!currentTeamId || !hasMore) return;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("*, reads:inbox_message_reads!left(user_id)")
      .eq("team_id", currentTeamId)
      .gte("published_at", sinceISO_30d)
      .lte("published_at", new Date().toISOString())
      .order("priority", { ascending: false })
      .order("published_at", { ascending: false })
      .range(from, to);
    if (!error) {
      const rows = (data ?? []) as Message[];
      const now = Date.now();
      const filtered = rows.filter(
        (m) =>
          (!m.reads || m.reads.length === 0) &&
          (!m.expires_at || new Date(m.expires_at).getTime() > now)
      );
      setMsgs((prev) => [...prev, ...filtered]);
      setPage((p) => p + 1);
      if (rows.length < PAGE_SIZE) setHasMore(false);
    }
  };

  // Acknowledge (messages only)
  const acknowledge = async (id: string) => {
    const { data: me } = await supabase.auth.getUser();
    const userId = me?.user?.id;
    if (!userId) return;
    const { error } = await supabase
      .from("inbox_message_reads")
      .insert({ message_id: id, user_id: userId });
    if (!error) {
      setMsgs((prev) => prev.filter((m) => m.id !== id));
      onAcknowledge?.();
    }
  };

  const toggleAlert = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }));

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[3000]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 h-full w-[min(92vw,420px)] overflow-y-auto
                   rounded-l-2xl border border-border bg-card shadow-2xl"
        role="dialog" aria-modal="true" aria-label="Inbox"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/90 px-3 py-2 backdrop-blur">
          <h2 className="text-sm font-semibold">Inbox</h2>
          <button className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* ===== Alerts section (recent 72h) ===== */}
          <div>
            <div className="mb-2 text-xs font-semibold text-muted">Recent alerts (72h)</div>

            {loadingAlerts && (
              <div className="rounded-xl border border-border bg-background p-3 animate-pulse">
                <div className="h-4 w-2/3 bg-border/70 rounded" />
                <div className="mt-2 h-3 w-5/6 bg-border/60 rounded" />
              </div>
            )}

            {!loadingAlerts && alerts.length === 0 && (
              <div className="text-xs text-muted">No recent alerts.</div>
            )}

            <div className="space-y-2">
              {alerts.map((a) => {
                const ctx = a.context || {};
                const titleParam = ctx.param_label ?? ctx.base_param_label ?? ctx.param_name ?? "—";
                const title = `${KIND_LABEL[a.kind] ?? a.kind} • ${titleParam}`;
                const t = new Date(a.measured_at || a.created_at).toLocaleString([], { hour12: false });
                const isOpen = !!expanded[a.id];

                return (
                  <article key={a.id} className="rounded-xl border border-border bg-background">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-left"
                      onClick={() => toggleAlert(a.id)}
                      aria-expanded={isOpen}
                    >
                      <h3 className="text-sm font-semibold truncate">{title}</h3>

                      {/* chips */}
                      <span className={`ml-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${chipColor(a.severity)}`}>
                        {a.severity}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs text-red-500">
                        alerts
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
                        {(a.buoy_id != null && a.parameter_id != null) && (
                          <a
                            href={`/p/${a.buoy_id}/${a.parameter_id}`}
                            className="mt-2 inline-flex rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30"
                          >
                            View parameter
                          </a>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>

          {/* ===== Messages section (unread only) ===== */}
          <div className="pt-1">
            <div className="mb-2 text-xs font-semibold text-muted">Messages</div>

            {loadingMsgs && (
              <div className="rounded-xl border border-border bg-background p-3 animate-pulse">
                <div className="h-4 w-1/2 bg-border/70 rounded" />
                <div className="mt-2 h-3 w-3/4 bg-border/60 rounded" />
              </div>
            )}

            {!loadingMsgs && msgs.length === 0 && (
              <div className="text-sm text-muted">No new messages.</div>
            )}

            <div className="space-y-2">
              {msgs.map((m) => {
                const chip = (m.message_kind ?? m.kind ?? "").toString();
                return (
                  <article key={m.id} className="rounded-xl border border-border bg-background">
                    <div className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold truncate">{m.title}</h3>

                        {chip && (
                          <span
                            className={`ml-1 rounded-full border px-2 py-0.5 text-xs ${chipStyle(chip)}`}
                            title={chip}
                          >
                            {chip.toLowerCase() === "alert" ? "alerts" : chip}
                          </span>
                        )}

                        <span className="ml-auto text-xs text-muted">
                          {new Date(m.published_at).toLocaleString([], { hour12: false })}
                        </span>
                      </div>

                      {m.body && (
                        <p className="mt-1 text-sm text-muted whitespace-pre-wrap">{m.body}</p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.link_url && (
                          <a
                            href={m.link_url}
                            target="_blank" rel="noreferrer"
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30"
                          >
                            {m.link_label ?? "Open"}
                          </a>
                        )}
                        {/* Removed: Open in Download Center */}
                        <button
                          className="ml-auto rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30"
                          onClick={() => acknowledge(m.id)}
                          title="Mark as read"
                        >
                          Acknowledge
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="pt-2">
              {hasMore ? (
                <button
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-accent/30"
                  onClick={loadMore}
                >
                  Load more
                </button>
              ) : msgs.length > 0 ? (
                <div className="text-center text-xs text-muted py-2">End of messages</div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
}