// src/components/DownloadCenter/DownloadCenterPanel.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam } from "@/contexts/TeamContext";

type Report = {
  id: string;
  team_id: string;
  title: string;
  period: string | null;
  description: string | null;
  storage_bucket: string;
  storage_path: string;
  is_public: boolean;
  published_at: string;
};

type RangeKey = "24h" | "7d" | "30d" | "custom";

function toISOFromLocal(localDT: string | null | undefined) {
  if (!localDT) return null;
  const d = new Date(localDT);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function deriveTag(title: string | null | undefined): "IMPORTANT" | "INFO" | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes("important")) return "IMPORTANT";
  if (t.includes("info")) return "INFO";
  return null;
}

export default function DownloadCenterPanel({
  autoOpenId,                 // e.g. from query string
  limit = 500,                // cap results client-side
  header = "Download Center", // panel title
}: {
  autoOpenId?: string | null;
  limit?: number;
  header?: string;
}) {
  const { currentTeamId } = useTeam();
  const [rows, setRows] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [showInfo, setShowInfo] = useState(true);
  const [showImportant, setShowImportant] = useState(true);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  // Compute date bounds
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

  // Prefill custom range when switching to custom
  useEffect(() => {
    if (range !== "custom") return;
    if (!customFrom || !customTo) {
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const toLocal = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
      setCustomFrom(toLocal(from));
      setCustomTo(toLocal(now));
    }
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch reports (server filters: team, time, search)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!currentTeamId) { setRows([]); return; }
      if (range === "custom" && !validRange) return; // wait until valid

      setLoading(true);

      let qry = supabase
        .from("report_files")
        .select("*")
        .eq("team_id", currentTeamId)
        .order("published_at", { ascending: false });

      if (sinceISO) qry = qry.gte("published_at", sinceISO);
      if (untilISO) qry = qry.lte("published_at", untilISO);

      if (debouncedQ) {
        const pat = `%${debouncedQ.replace(/[%_]/g, "\\$&")}%`;
        // OR across title/description (case-insensitive)
        qry = qry.or(`title.ilike.${pat},description.ilike.${pat}`);
      }

      const { data, error } = await qry.limit(limit);
      if (!cancelled) {
        setLoading(false);
        setRows(error ? [] : ((data ?? []) as Report[]));
      }
    })();
    return () => { cancelled = true; };
  }, [currentTeamId, sinceISO, untilISO, validRange, debouncedQ, limit]);

  // Client tag filter
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const tag = deriveTag(r.title);
      if (tag === "IMPORTANT" && !showImportant) return false;
      if (tag === "INFO" && !showInfo) return false;
      return true;
    });
  }, [rows, showInfo, showImportant]);

  // Download/open helper
  const openFile = async (r: Report) => {
    if (r.is_public) {
      const { data } = supabase.storage.from(r.storage_bucket).getPublicUrl(r.storage_path);
      const url = data?.publicUrl;
      if (url) window.open(url, "_blank");
      return;
    }
    const { data, error } = await supabase.storage
      .from(r.storage_bucket)
      .createSignedUrl(r.storage_path, 60 * 60);
    if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  // Auto open by id if asked (e.g., from inbox link)
  useEffect(() => {
    if (!autoOpenId || !filtered.length) return;
    const target = filtered.find(r => r.id === autoOpenId);
    if (target) openFile(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenId, filtered.length]);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className=" pt-1 flex flex-wrap items-center gap-2">
          <input
            className="h-9 w-[min(60vw,260px)] rounded-lg border border-border bg-background px-2 text-sm"
            placeholder="Search reports…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            aria-label="Time range"
          >
            <option value="24h">Last 24h</option>
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
        </div>
      </div>

      {/* Tag chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          className={`rounded-full border px-2 py-0.5 text-xs ${showImportant ? "bg-red-500/15 text-red-500 border-red-500/30" : "border-border bg-background text-foreground/70"}`}
          onClick={() => setShowImportant(s => !s)}
          title="Toggle IMPORTANT"
        >
          IMPORTANT
        </button>
        <button
          className={`rounded-full border px-2 py-0.5 text-xs ${showInfo ? "bg-sky-500/15 text-sky-500 border-sky-500/30" : "border-border bg-background text-foreground/70"}`}
          onClick={() => setShowInfo(s => !s)}
          title="Toggle INFO"
        >
          INFO
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-2">
          <div className="h-14 rounded-xl border border-border bg-background animate-pulse" />
          <div className="h-14 rounded-xl border border-border bg-background animate-pulse" />
          <div className="h-14 rounded-xl border border-border bg-background animate-pulse" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted">
          {range === "custom" && !validRange ? "Please select a valid custom range." : "No reports match your filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const tag = deriveTag(r.title);
            return (
              <article key={r.id} className="rounded-xl border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold truncate">{r.title}</div>
                  {r.period && <div className="text-xs text-muted">• {r.period}</div>}
                  {tag === "IMPORTANT" && (
                    <span className="ml-1 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-xs text-red-500">
                      IMPORTANT
                    </span>
                  )}
                  {tag === "INFO" && (
                    <span className="ml-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-xs text-sky-500">
                      INFO
                    </span>
                  )}
                  <div className="ml-auto text-xs text-muted">
                    {new Date(r.published_at).toLocaleString([], { hour12: false })}
                  </div>
                </div>
                {r.description && <p className="mt-1 text-sm text-muted">{r.description}</p>}
                <div className="mt-2 flex gap-2">
                  <button
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/30"
                    onClick={() => openFile(r)}
                  >
                    Download
                  </button>
                  <button
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent/30"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        r.is_public
                          ? (supabase.storage.from(r.storage_bucket).getPublicUrl(r.storage_path).data?.publicUrl ?? "")
                          : location.origin + `/downloads?open=${r.id}`
                      )
                    }
                  >
                    Copy link
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}