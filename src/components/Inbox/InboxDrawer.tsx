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
  kind: "notice" | "report" | "maintenance" | "other";
  priority: number;
  published_at: string;
  expires_at: string | null;
  report_id: string | null;
  reads?: { user_id: string }[]; // via left join
};

export default function InboxDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { currentTeamId } = useTeam();
  const [loading, setLoading] = useState(false);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  const [hasMore, setHasMore] = useState(true);

  const sinceISO = useMemo(
    () => new Date(Date.now() - 30 * 24 * 3600_000).toISOString(), // last 30 days
    []
  );

  // First page
  useEffect(() => {
    if (!open || !currentTeamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("inbox_messages")
        .select("*, reads:inbox_message_reads!left(user_id)")
        .eq("team_id", currentTeamId)
        .gte("published_at", sinceISO)
        .lte("published_at", new Date().toISOString())
        .order("priority", { ascending: false })
        .order("published_at", { ascending: false })
        .range(0, PAGE_SIZE - 1);

      if (!cancelled) {
        setLoading(false);
        if (error) {
          setMsgs([]);
          setHasMore(false);
        } else {
          const rows = (data ?? []) as Message[];
          // Only show unread (reads empty) and non-expired:
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
  }, [open, currentTeamId, sinceISO]);

  // Load more
  const loadMore = async () => {
    if (!currentTeamId || !hasMore) return;
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("inbox_messages")
      .select("*, reads:inbox_message_reads!left(user_id)")
      .eq("team_id", currentTeamId)
      .gte("published_at", sinceISO)
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

  // Acknowledge (removes for current user)
  const acknowledge = async (id: string) => {
    const { data: me } = await supabase.auth.getUser();
    const userId = me?.user?.id;
    if (!userId) return;
    const { error } = await supabase
      .from("inbox_message_reads")
      .insert({ message_id: id, user_id: userId });
    if (!error) {
      setMsgs((prev) => prev.filter((m) => m.id !== id));
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2400]">
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

        <div className="p-3 space-y-2">
          {loading && (
            <div className="rounded-xl border border-border bg-background p-3 animate-pulse">
              <div className="h-4 w-1/2 bg-border/70 rounded" />
              <div className="mt-2 h-3 w-3/4 bg-border/60 rounded" />
            </div>
          )}

          {!loading && msgs.length === 0 && (
            <div className="text-sm text-muted py-10 text-center">No new messages.</div>
          )}

          {msgs.map((m) => (
            <article key={m.id} className="rounded-xl border border-border bg-background">
              <div className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{m.title}</h3>
                  {m.kind === "report" && (
                    <span className="ml-1 rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">
                      report
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
                  {m.report_id && (
                    <a
                      href={`/downloads?open=${m.report_id}`}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30"
                    >
                      Open in Download Center
                    </a>
                  )}
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
          ))}

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
      </aside>
    </div>,
    document.body
  );
}