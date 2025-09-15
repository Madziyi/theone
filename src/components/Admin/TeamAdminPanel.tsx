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


// AdminInvitesPanel component for email-specific invites
function AdminInvitesPanel({ teamId }: { teamId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "manager" | "admin">("member");
  const [mins, setMins] = useState(60);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ action_link: string; expires_at: string } | null>(null);
  const [rows, setRows] = useState<{
    code: string;
    email: string;
    role: string;
    expires_at: string;
    consumed_at: string | null;
    created_at: string;
  }[]>([]);
  const [loading, setLoading] = useState(false);


  const loadRows = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("team_invite_links")
      .select("code,email,role,expires_at,consumed_at,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(50);
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (teamId) loadRows(); }, [teamId]);

  const createLink = async () => {
    setBusy(true);
    setCreated(null);
    try {
      if (!teamId || typeof teamId !== 'string' || teamId.trim() === '') {
        throw new Error("No valid team ID available");
      }
      
      if (!email || email.trim() === '') {
        throw new Error("Email is required");
      }

      // Check user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        throw new Error(`Session error: ${sessionError.message}`);
      }
      
      if (!session) {
        throw new Error("No active session. Please log in again.");
      }

      // Call edge function with proper Authorization header
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-team-invite`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          team_id: teamId,
          email,
          role,
          expires_in_minutes: Number(mins) || 60,
          redirect_base: window.location.origin,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      setCreated({ action_link: result.action_link, expires_at: result.expires_at });
      setEmail("");
      await loadRows();
    } catch (e: any) {
      console.error("Create invite error:", e);
      alert(e?.message ?? "Failed to create invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Admin • Team Invites</h3>
        <button onClick={loadRows} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30">Refresh</button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <input
          type="email"
          placeholder="invitee@example.com"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="h-10 rounded-lg border border-border bg-background px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value as any)}>
          <option value="member">Member</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <input
          type="number"
          min={5}
          step={5}
          className="h-10 w-24 rounded-lg border border-border bg-background px-3 text-sm"
          value={mins}
          onChange={(e) => setMins(Number(e.target.value))}
        />
        <button className="h-10 rounded-lg border border-border bg-primary px-4 text-sm text-white" onClick={createLink} disabled={busy || !email}>
          {busy ? "Creating…" : "Create link"}
        </button>
      </div>

      {created && (
        <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Invite link (expires {new Date(created.expires_at).toLocaleString([], { hour12: false })}):
          <div className="mt-1 break-all font-mono text-xs">{created.action_link}</div>
          <button
            className="mt-2 rounded-md border border-emerald-400 px-2 py-1 text-xs"
            onClick={() => navigator.clipboard.writeText(created.action_link)}
          >
            Copy link
          </button>
        </div>
      )}

      <div className="mt-4">
        <div className="text-sm font-semibold">Recent invites</div>
        {loading ? (
          <div className="mt-2 text-xs text-muted">Loading…</div>
        ) : (
          <div className="mt-2 space-y-2">
            {rows.map((r) => (
              <div key={r.code} className="rounded-lg border border-border bg-background p-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="font-mono text-xs">{r.email}</div>
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-xs text-sky-400">{r.role}</span>
                  <span className="ml-auto text-xs text-muted">
                    {r.consumed_at
                      ? `Used ${new Date(r.consumed_at).toLocaleString([], { hour12: false })}`
                      : `Expires ${new Date(r.expires_at).toLocaleString([], { hour12: false })}`}
                  </span>
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="text-xs text-muted">No invites yet.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

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
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Role</th>
                  <th className="px-2 py-2">Joined</th>
                  <th className="px-2 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const name = [m.profile?.first_name, m.profile?.last_name].filter(Boolean).join(" ") || "—";
                  const joined = m.joined_at ? new Date(m.joined_at).toLocaleString([], { hour12: false }) : "—";
                  return (
                    <tr key={m.user_id} className="border-t border-border/60">
                      <td className="px-2 py-2">{name}</td>
                      <td className="px-2 py-2">{m.profile?.email ?? "—"}</td>
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
                      <td className="px-2 py-2">{joined}</td>
                      <td className="px-2 py-2 text-right space-x-1">
                        {m.role === "member" ? (
                          <button
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30"
                            onClick={() => promote(m.user_id)}
                          >
                            Promote to admin
                          </button>
                        ) : (
                          <button
                            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30"
                            onClick={() => demote(m.user_id)}
                            disabled={isLastAdmin(m.user_id)}
                            title={isLastAdmin(m.user_id) ? "Cannot demote last admin" : "Demote"}
                          >
                            Demote to member
                          </button>
                        )}
                        <button
                          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30"
                          onClick={() => removeMember(m.user_id)}
                          disabled={m.user_id === me && isLastAdmin(m.user_id)}
                          title={m.user_id === me && isLastAdmin(m.user_id) ? "Cannot remove last admin (you)" : "Remove from team"}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Team Invites */}
      {teamId && <AdminInvitesPanel teamId={teamId} />}
    </div>
  );
}