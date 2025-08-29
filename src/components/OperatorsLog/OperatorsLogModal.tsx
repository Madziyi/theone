import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam } from "@/contexts/TeamContext";
import { useSession } from "@/hooks/useSession";
import { X, Pin, PinOff } from "lucide-react";

type LogRow = {
  id: string; team_id: string; author_id: string;
  scope: "shared" | "private";
  content: string; tags: string[];
  buoy_id: number | null; parameter_id: number | null; alert_id: string | null;
  pinned: boolean; created_at: string; updated_at: string;
};

function timeStr(iso: string) {
  return new Date(iso).toLocaleString([], { hour12: false });
}

export default function OperatorsLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { currentTeamId } = useTeam();
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [tab, setTab] = useState<"shared"|"private">("shared");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [buoyId, setBuoyId] = useState<string>("");
  const [paramId, setParamId] = useState<string>("");

  const [buoys, setBuoys] = useState<{ buoy_id: number; name: string }[]>([]);
  const [params, setParams] = useState<{ parameter_id: number; standard_name: string | null; buoy_id: number }[]>([]);

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LogRow[]>([]);

  const canSave = open && !!currentTeamId && !!userId && content.trim().length > 0;

  useEffect(() => {
    if (!open || !currentTeamId) return;
    (async () => {
      const { data: tb } = await supabase.from("team_buoys").select("buoy_id").eq("team_id", currentTeamId);
      const ids = (tb ?? []).map((r: any) => r.buoy_id);
      if (ids.length) {
        const [{ data: bs }, { data: ps }] = await Promise.all([
          supabase.from("buoys").select("buoy_id,name").in("buoy_id", ids),
          supabase.from("parameters").select("buoy_id,parameter_id,standard_name").in("buoy_id", ids),
        ]);
        setBuoys((bs ?? []) as any);
        setParams((ps ?? []) as any);
      } else {
        setBuoys([]); setParams([]);
      }
    })();
  }, [open, currentTeamId]);

  const loadLogs = async () => {
    if (!open || !currentTeamId || !userId) return;
    setLoading(true);
    const qShared = supabase
      .from("operator_logs")
      .select("*")
      .eq("team_id", currentTeamId)
      .eq("scope", "shared")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    const qPrivate = supabase
      .from("operator_logs")
      .select("*")
      .eq("scope", "private")
      .eq("author_id", userId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: shared } = await qShared;
    const { data: priv } = await qPrivate;

    setRows([...(shared ?? []), ...(priv ?? [])] as any);
    setLoading(false);
  };

  useEffect(() => { if (open) loadLogs(); }, [open]); // eslint-disable-line

  const visible = useMemo(() => rows.filter(r => r.scope === tab).sort((a,b) => (a.pinned === b.pinned) ? (a.created_at < b.created_at ? 1 : -1) : (a.pinned ? -1 : 1)), [rows, tab]);

  const save = async () => {
    if (!canSave) return;
    const insert = {
      team_id: currentTeamId,
      author_id: userId,
      scope: tab,
      content: content.trim(),
      tags: tags ? tags.split(",").map(s => s.trim()).filter(Boolean) : [],
      buoy_id: buoyId ? Number(buoyId) : null,
      parameter_id: paramId ? Number(paramId) : null,
      alert_id: null,
    };
    const { data, error } = await supabase.from("operator_logs").insert(insert).select("*").single();
    if (!error && data) {
      setRows(prev => [data as any, ...prev]);
      setContent(""); setTags(""); setBuoyId(""); setParamId("");
    }
  };

  const togglePin = async (id: string, pinned: boolean) => {
    const { data } = await supabase.from("operator_logs").update({ pinned: !pinned }).eq("id", id).select("*").single();
    if (data) setRows(prev => prev.map(r => (r.id === id ? (data as any) : r)));
  };

  const remove = async (id: string) => {
    await supabase.from("operator_logs").delete().eq("id", id);
    setRows(prev => prev.filter(r => r.id !== id));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2050] bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-3">
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <div className="font-semibold">Operators’ Log</div>
              <div className="ml-2 rounded-lg border border-border p-0.5">
                <button className={`rounded px-2 py-1 text-sm ${tab==='shared' ? 'bg-primary text-white' : 'hover:bg-accent/30'}`} onClick={() => setTab("shared")}>Shared</button>
                <button className={`rounded px-2 py-1 text-sm ${tab==='private' ? 'bg-primary text-white' : 'hover:bg-accent/30'}`} onClick={() => setTab("private")}>My notes</button>
              </div>
              <button className="ml-auto rounded-lg border border-border p-1 hover:bg-accent/30" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Composer */}
            <div className="mt-3 grid gap-2">
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-border bg-background p-2 text-sm"
                placeholder={tab === "shared" ? "Share observations for the next shift…" : "Your private note…"}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="grid gap-2 sm:grid-cols-4">
                <input
                  className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm"
                  placeholder="tags (comma-separated)"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                <select className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" value={buoyId} onChange={(e) => { setBuoyId(e.target.value); setParamId(""); }}>
                  <option value="">(optional) Link buoy</option>
                  {buoys.map(b => <option key={b.buoy_id} value={b.buoy_id}>{b.name}</option>)}
                </select>
                <select className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm" value={paramId} onChange={(e) => setParamId(e.target.value)}>
                  <option value="">(optional) Link parameter</option>
                  {params.filter(p => !buoyId || String(p.buoy_id) === String(buoyId)).map(p =>
                    <option key={p.parameter_id} value={p.parameter_id}>{p.standard_name ?? `Param ${p.parameter_id}`}</option>
                  )}
                </select>
                <button
                  className="h-9 rounded-lg border border-border bg-primary px-3 text-sm text-white disabled:opacity-60"
                  disabled={!canSave}
                  onClick={save}
                >
                  Save
                </button>
              </div>
            </div>

            {/* List */}
            <div className="mt-4 space-y-2">
              {loading && <div className="animate-pulse rounded-xl border border-border bg-card p-3 text-sm text-muted">Loading…</div>}
              {!loading && visible.length === 0 && (
                <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted">
                  No {tab === "shared" ? "shared" : "private"} notes yet.
                </div>
              )}
              {visible.map((r) => (
                <article key={r.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted">{timeStr(r.created_at)}</div>
                    {r.tags?.length ? (
                      <div className="ml-2 hidden flex-wrap gap-1 sm:flex">
                        {r.tags.map((t) => (
                          <span key={t} className="rounded-full border border-border px-2 py-0.5 text-[11px]">{t}</span>
                        ))}
                      </div>
                    ) : null}
                    <button className="ml-auto rounded-lg border border-border p-1 hover:bg-accent/30" onClick={() => togglePin(r.id, r.pinned)} title={r.pinned ? "Unpin" : "Pin"}>
                      {r.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    {r.author_id === userId && (
                      <button className="ml-1 rounded-lg border border-border px-2 py-1 text-xs hover:bg-accent/30" onClick={() => remove(r.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm">{r.content}</div>
                  {(r.buoy_id || r.parameter_id || r.alert_id) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                      {r.buoy_id ? <span>Buoy: {r.buoy_id}</span> : null}
                      {r.parameter_id ? <span>Param: {r.parameter_id}</span> : null}
                      {r.alert_id ? <span>Alert: {r.alert_id}</span> : null}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}