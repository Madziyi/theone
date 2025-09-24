// src/components/Admin/TeamAdminPanel.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type MemberRow = {
  user_id: string;
  role: "admin" | "member";
  joined_at: string | null;
  profile?: { id: string; first_name: string | null; last_name: string | null; email: string | null };
};


export default function TeamAdminPanel({ teamId }: { teamId: string | null }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [me, setMe] = useState<string | null>(null);


  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMe(data?.user?.id ?? null);
    })();
  }, []);

  // Load members (two queries: team_members then profiles)
  const loadMembers = async () => {
    if (!teamId) return;
    setLoadingMembers(true);
    try {
      const { data: tms, error: e1 } = await supabase
        .from("team_members")
        .select("user_id, role, joined_at")
        .eq("team_id", teamId)
        .order("joined_at", { ascending: true });

      if (e1) throw e1;
      const ids = (tms ?? []).map((x) => x.user_id);
      const { data: profs, error: e2 } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      if (e2) throw e2;
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const rows: MemberRow[] = (tms ?? []).map((tm: any) => ({
        user_id: tm.user_id,
        role: tm.role,
        joined_at: tm.joined_at,
        profile: map.get(tm.user_id),
      }));
      setMembers(rows);
    } catch (err) {
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const adminCount = useMemo(() => members.filter((m) => m.role === "admin").length, [members]);
  const isLastAdmin = (userId: string) => members.find((m) => m.user_id === userId)?.role === "admin" && adminCount <= 1;

  const promote = async (userId: string) => {
    if (!teamId) return;
    await supabase.from("team_members").update({ role: "admin" }).eq("team_id", teamId).eq("user_id", userId);
    await loadMembers();
  };
  const demote = async (userId: string) => {
    if (!teamId) return;
    if (isLastAdmin(userId)) return alert("You are the last admin. Assign another admin first.");
    await supabase.from("team_members").update({ role: "member" }).eq("team_id", teamId).eq("user_id", userId);
    await loadMembers();
  };
  const removeMember = async (userId: string) => {
    if (!teamId) return;
    if (isLastAdmin(userId)) return alert("You are the last admin. Assign another admin first.");
    await supabase.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    await loadMembers();
  };



  return (
    <div className="space-y-4">
      {/* Members */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Team members</h3>
          <button className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent/30" onClick={loadMembers}>
            Refresh
          </button>
        </div>

        {loadingMembers ? (
          <div className="mt-3 grid gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg border border-border bg-background" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="mt-3 text-sm text-muted">No members yet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm" style={{ minWidth: '700px' }}>
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-2 py-2 min-w-[120px]">Name</th>
                  <th className="px-2 py-2 min-w-[180px]">Email</th>
                  <th className="px-2 py-2 w-20">Role</th>
                  <th className="px-2 py-2 min-w-[120px]">Joined</th>
                  <th className="px-2 py-2 text-right min-w-[200px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const name = [m.profile?.first_name, m.profile?.last_name].filter(Boolean).join(" ") || "—";
                  const joined = m.joined_at ? new Date(m.joined_at).toLocaleString([], { hour12: false }) : "—";
                  return (
                    <tr key={m.user_id} className="border-t border-border/60">
                      <td className="px-2 py-2">
                        <div className="font-medium">{name}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="text-sm break-all">{m.profile?.email ?? "—"}</div>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                            m.role === "admin"
                              ? "border-purple-500/30 bg-purple-500/15 text-purple-400"
                              : "border-sky-500/30 bg-sky-500/15 text-sky-400"
                          }`}
                        >
                          {m.role}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <div className="text-xs">{joined}</div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex flex-col sm:flex-row gap-1 sm:space-x-1">
                          {m.role === "member" ? (
                            <button
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30 whitespace-nowrap"
                              onClick={() => promote(m.user_id)}
                            >
                              Promote
                            </button>
                          ) : (
                            <button
                              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30 whitespace-nowrap"
                              onClick={() => demote(m.user_id)}
                              disabled={isLastAdmin(m.user_id)}
                              title={isLastAdmin(m.user_id) ? "Cannot demote last admin" : "Demote"}
                            >
                              Demote
                            </button>
                          )}
                          <button
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30 whitespace-nowrap"
                            onClick={() => removeMember(m.user_id)}
                            disabled={m.user_id === me && isLastAdmin(m.user_id)}
                            title={m.user_id === me && isLastAdmin(m.user_id) ? "Cannot remove last admin (you)" : "Remove from team"}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}