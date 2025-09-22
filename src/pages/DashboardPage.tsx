import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam } from "@/contexts/TeamContext";
import { useSession } from "@/hooks/useSession";
import { useAuth } from "@/contexts/AuthContext";
import BuoyStats from "@/components/Buoy/BuoyStats";
import { Link, useNavigate } from "react-router-dom";
import AlertsPanel from "@/components/Alerts/AlertsPanel";
import { X as CloseIcon } from "lucide-react";
import DownloadCenterPanel from "@/components/DownloadCenter/DownloadCenterPanel";
import OperationsPanel from "@/components/Operations/OperationsPanel";

type Buoy = {
  id: number;
  buoy_id: string;
  name: string;
  location_nickname: string | null;
  webcam: string | null;
  latitude: number;
  longitude: number;
};
type Profile = { first_name: string; last_name: string; email: string };

// Admin tool components
function JoinTeamByCodeInline() {
  const { currentTeamId } = useTeam();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<null | "ok" | "err">(null);

  const join = async () => {
    setStatus(null);
    const { data, error } = await supabase.rpc("join_team_by_code", { p_code: code.trim() });
    if (error) { setStatus("err"); return; }
    const teamId = data as string | null;
    if (teamId) {
      localStorage.setItem("team_id", teamId);
      setStatus("ok");
      // You might want to force refresh team context
      location.reload();
    }
  };

  return (
    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
      <label className="grid gap-1">
        <span className="text-sm text-muted">Join a team by code</span>
        <input
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          placeholder="e.g. ute253"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </label>
      <button
        className="h-10 self-end rounded-lg border border-border bg-primary px-4 text-sm text-white"
        onClick={join}
        disabled={!code}
      >
        Join team
      </button>
      {status === "ok" && <div className="text-xs text-emerald-600">Joined. Reloading…</div>}
      {status === "err" && <div className="text-xs text-red-500">Invalid code.</div>}
    </div>
  );
}

function TeamMembersAdminPanel() {
  const { currentTeamId, isManager: isAdmin } = useTeam();
  const [rows, setRows] = useState<Array<{user_id:string; role:'admin'|'member'; first_name:string|null; last_name:string|null; email:string}>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // profiles join for display
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          user_id, 
          role, 
          profiles!inner(first_name, last_name, email)
        `)
        .eq("team_id", currentTeamId);
      setLoading(false);
      if (cancelled) return;
      if (error) return;
      const shaped = (data as any[]).map(r => ({
        user_id: r.user_id,
        role: r.role,
        first_name: r.profiles?.first_name ?? null,
        last_name: r.profiles?.last_name ?? null,
        email: r.profiles?.email ?? "",
      }));
      setRows(shaped);
    })();
    return () => { cancelled = true; };
  }, [currentTeamId]);

  const setRole = async (userId: string, next: 'admin'|'member') => {
    if (!currentTeamId) return;
    const { error } = await supabase.rpc("admin_set_member_role", { p_team_id: currentTeamId, p_user_id: userId, p_role: next });
    if (!error) setRows(prev => prev.map(r => r.user_id === userId ? { ...r, role: next } : r));
  };

  const removeMember = async (userId: string) => {
    if (!currentTeamId || !confirm("Remove this member from the team?")) return;
    const { error } = await supabase.rpc("admin_remove_member", { p_team_id: currentTeamId, p_user_id: userId });
    if (!error) setRows(prev => prev.filter(r => r.user_id !== userId));
  };

  if (!isAdmin) return (
    <div className="mt-3 rounded-lg border border-border bg-background p-3 text-sm text-muted">
      You must be an admin to manage members.
    </div>
  );

  return (
    <div className="mt-4">
      <div className="mb-2 text-sm font-semibold">Team members</div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-card/70">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                <th className="min-w-[120px]">Name</th>
                <th className="min-w-[180px]">Email</th>
                <th className="w-28">Role</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="p-3 text-muted">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="p-3 text-muted">No members yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.user_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-sm break-all">{r.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
                      value={r.role}
                      onChange={(e) => setRole(r.user_id, e.target.value as any)}
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30 whitespace-nowrap"
                      onClick={() => removeMember(r.user_id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TeamMembersPanel() {
  const { currentTeamId } = useTeam();
  const [rows, setRows] = useState<Array<{user_id:string; role:'admin'|'member'; first_name:string|null; last_name:string|null; email:string}>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // profiles join for display
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          user_id, 
          role, 
          profiles!inner(first_name, last_name, email)
        `)
        .eq("team_id", currentTeamId);
      setLoading(false);
      if (cancelled) return;
      if (error) return;
      const shaped = (data as any[]).map(r => ({
        user_id: r.user_id,
        role: r.role,
        first_name: r.profiles?.first_name ?? null,
        last_name: r.profiles?.last_name ?? null,
        email: r.profiles?.email ?? "",
      }));
      setRows(shaped);
    })();
    return () => { cancelled = true; };
  }, [currentTeamId]);

  return (
    <div className="mt-4">
      <div className="mb-2 text-sm font-semibold">Team members</div>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[400px]">
            <thead className="bg-card/70">
              <tr className="[&>th]:px-3 [&>th]:py-2 text-left">
                <th className="min-w-[120px]">Name</th>
                <th className="min-w-[180px]">Email</th>
                <th className="w-28">Role</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3} className="p-3 text-muted">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={3} className="p-3 text-muted">No members yet.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.user_id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-sm break-all">{r.email}</div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                      r.role === "admin"
                        ? "border-purple-500/30 bg-purple-500/15 text-purple-400"
                        : "border-sky-500/30 bg-sky-500/15 text-sky-400"
                    }`}>
                      {r.role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RotateTeamCodeButton() {
  const { currentTeamId, isManager: isAdmin } = useTeam();
  const [rotating, setRotating] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const rotate = async () => {
    if (!isAdmin || !currentTeamId) return;
    setRotating(true);
    const { data, error } = await supabase.rpc("admin_rotate_join_code", { p_team_id: currentTeamId });
    setRotating(false);
    if (!error) setCode(data as string);
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <button
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/30 whitespace-nowrap"
        onClick={rotate}
        disabled={rotating}
      >
        {rotating ? "Rotating…" : "Rotate team code"}
      </button>
      {code && (
        <span className="text-xs text-muted">
          <span className="hidden sm:inline">New code: </span>
          <b className="font-mono">{code}</b>
        </span>
      )}
    </div>
  );
}

function WebcamModal({ src, onClose }: { src: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isHls = /\.m3u8($|\?)/i.test(src);
  useEffect(() => {
    let hls: any;
    const video = videoRef.current;
    if (!video) return;
    if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }
    (async () => {
      if (isHls) {
        const Hls = (await import("hls.js")).default;
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(video);
        } else {
          video.src = src;
        }
      } else {
        video.src = src;
      }
    })();
    return () => { try { hls?.destroy?.(); } catch {} };
  }, [src, isHls]);

  return (
    <div className="fixed inset-0 z-[1400] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Webcam video">
      <div className="relative w-full max-w-4xl">
        <button className="absolute -top-10 right-0 rounded-lg border border-white/40 bg-black/40 px-3 py-1 text-sm text-white hover:bg-white/10" onClick={onClose} aria-label="Close webcam">
          <CloseIcon className="inline h-4 w-4 mr-1" /> Close
        </button>
        <video ref={videoRef} className="w-full max-h-[80vh] rounded-xl border border-white/30 bg-black object-contain" controls autoPlay muted playsInline />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();
  const { session } = useSession();
  const { deleteAccount } = useAuth();
  const { currentTeam, currentTeamId, isManager, loading: teamLoading, teams } = useTeam(); // isManager == admin
  const isAdmin = !!isManager;

  const [activeTab, setActiveTab] = useState<"buoys" | "alerts" | "downloads" | "operations" | "team" | "admin">("buoys");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamBuoys, setTeamBuoys] = useState<Buoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Buoy | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,email")
        .eq("id", session.user.id)
        .maybeSingle();
      setProfile((data as any) ?? null);
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!currentTeamId || teamLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: tb, error: e1 } = await supabase
        .from("team_buoys")
        .select("buoy_id")
        .eq("team_id", currentTeamId);
      if (e1 || !tb || tb.length === 0) {
        if (!cancelled) { setTeamBuoys([]); setLoading(false); }
        return;
      }
      const ids = tb.map((r: any) => r.buoy_id);
      const { data: bs } = await supabase
        .from("buoys")
        .select("buoy_id,name,location_nickname,webcam,latitude,longitude")
        .in("buoy_id", ids);
      if (!cancelled) { setTeamBuoys((bs as any[]) ?? []); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [currentTeamId, teamLoading]);

  const greeting = useMemo(() => {
    if (!profile?.first_name) return "Welcome";
    return `Welcome, ${profile.first_name}`;
  }, [profile?.first_name]);

  const signOut = async () => {
    try { await supabase.auth.signOut(); }
    finally {
      localStorage.removeItem("team_id");
      nav("/login", { replace: true });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
      // After successful deletion, the user will be signed out and redirected
    } catch (error) {
      console.error("Failed to delete account:", error);
      alert("Failed to delete account. Please try again.");
    }
  };

  const openDownloadId = new URLSearchParams(location.search).get("open");

  return (
    <section className="mx-auto max-w-7xl px-3 py-4 space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-[#0b1a2b] dark:to-[#132c47] p-4">
        <div className="flex items-center gap-4">
          {currentTeam?.logo_url ? (
            <img src={currentTeam.logo_url} alt={`${currentTeam.name} logo`} className="h-14 w-14 rounded-xl border border-border object-cover bg-white" />
          ) : (
            <div className="h-14 w-14 rounded-xl border border-border bg-card grid place-items-center text-sm">
              {currentTeam?.name?.slice(0, 2).toUpperCase() ?? "TM"}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-2xl font-semibold truncate">{greeting}</div>
            <div className="text-sm text-muted truncate">
              {teamLoading ? "Loading team…" : 
               currentTeam?.name ? `Team: ${currentTeam.name}` : 
               "You are not a member of any team yet."}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-border bg-card p-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["buoys","alerts","downloads","team"] as const).map((t) => (
            <button key={t}
              className={`h-9 rounded-lg px-3 text-sm border whitespace-nowrap flex-shrink-0 ${
                activeTab === t ? "bg-primary text-white border-border" : "bg-background border-border text-foreground hover:bg-accent/30"
              }`}
              onClick={() => setActiveTab(t)}
            >
              {t === "buoys" ? "Buoys" : t === "alerts" ? "Alerts" : t === "downloads" ? "Documents" : "Team"}
            </button>
          ))}
          {currentTeam?.is_operations && (
            <button
              className={`h-9 rounded-lg px-3 text-sm border whitespace-nowrap flex-shrink-0 ${
                activeTab === "operations" ? "bg-primary text-white border-border" : "bg-background border-border text-foreground hover:bg-accent/30"
              }`}
              onClick={() => setActiveTab("operations")}
            >
              Operations
            </button>
          )}
          {isAdmin && (
            <button
              className={`h-9 rounded-lg px-3 text-sm border whitespace-nowrap flex-shrink-0 ${
                activeTab === "admin" ? "bg-primary text-white border-border" : "bg-background border-border text-foreground hover:bg-accent/30"
              }`}
              onClick={() => setActiveTab("admin")}
            >
              Admin
            </button>
          )}
        </div>
      </div>

      {/* Panels */}
      {activeTab === "buoys" && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your buoys</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-card" />
                ))
              ) : teamBuoys.length === 0 ? (
                <div className="text-sm text-muted">No buoys linked to this team yet.</div>
              ) : (
                teamBuoys.map((b) => (
                  <div key={b.buoy_id} className="rounded-xl border border-border bg-card p-3 shadow-soft">
                    <div className="text-sm font-medium truncate">{b.name}</div>
                    <div className="mt-0.5 text-xs text-muted truncate">
                      {b.location_nickname ?? `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}`}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to={`/trends?buoy=${b.buoy_id}`} className="rounded-lg border border-border bg-primary px-2.5 py-1 text-xs text-white hover:bg-accent/30">
                        Trends
                      </Link>
                      <button className="rounded-lg border border-border bg-primary px-2.5 py-1 text-xs text-white hover:bg-accent/30"
                        onClick={() => setSelected(b)} aria-label={`Open realtime data for ${b.name}`}>
                        Realtime Data
                      </button>
                      {b.webcam ? (
                        <button className="rounded-lg border border-border bg-primary px-2.5 text-white py-1 text-xs hover:bg-accent/30"
                          onClick={() => setShowWebcam(true)}>
                          Open Webcam
                        </button>
                      ) : null}
                      {showWebcam && b.webcam && (
                        <WebcamModal src={b.webcam} onClose={() => setShowWebcam(false)} />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex gap-4 text-sm">
                <Link to="/support" className="text-muted hover:text-foreground">Support</Link>
                <Link to="/privacy" className="text-muted hover:text-foreground">Privacy</Link>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowDeleteConfirm(true)} 
                  className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 whitespace-nowrap" 
                  title="Delete account"
                >
                  Delete Account
                </button>
                <button onClick={signOut} className="text-white h-9 rounded-lg border border-border bg-card px-3 text-sm bg-primary hover:bg-accent/30 whitespace-nowrap" title="Sign out">
                  Sign out
                </button>
              </div>
            </div>

            {selected && (
              <div className="fixed inset-0 z-[1100] bg-gradient-to-br from-[#0b1a2b] to-[#132c47] text-white" role="dialog" aria-modal="true">
                <div className="absolute right-4 top-3">
                  <button onClick={() => setSelected(null)} className="rounded-md border border-white/50 px-3 py-1 text-sm hover:bg-white/10" aria-label="Back">
                    ← Back
                  </button>
                </div>
                <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-4 pt-14">
                  <div className="text-center">
                    <h2 className="text-xl font-semibold">{selected.name}</h2>
                    <div className="mt-1 text-sm text-white/80">
                      <b>Lat:</b> {selected.latitude}, <b>Lon:</b> {selected.longitude}
                    </div>
                    {selected.location_nickname && (
                      <div className="mt-1 text-sm text-white/80">{selected.location_nickname}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-white/80">
                    <Link to={`/trends?buoy=${selected.buoy_id}`} className="rounded-xl border border-white/30 px-3 py-1 text-white hover:bg-white/10">
                      Open Trends →
                    </Link>
                  </div>
                  {selected.webcam && (
                    <div className="mx-auto w-full max-w-4xl grow">
                      <video className="h-[60vh] w-full rounded-lg border border-white/30 object-cover" controls autoPlay muted playsInline>
                        <source src={selected.webcam} type="video/mp4" />
                      </video>
                    </div>
                  )}
                </div>
              </div>
            )}
            {selected && <BuoyStats buoy={selected} onClose={() => setSelected(null)} />}
          </div>
        </>
      )}

      {activeTab === "alerts" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Alerts</h2>
          {currentTeamId ? (
            <AlertsPanel teamId={currentTeamId} />
          ) : (
            <div className="text-sm text-muted">You are not a member of any teams.</div>
          )}
        </div>
      )}

      {activeTab === "downloads" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Download Center</h2>
          {currentTeamId ? (
            <DownloadCenterPanel autoOpenId={openDownloadId} />
          ) : (
            <div className="text-sm text-muted">You are not a member of any teams.</div>
          )}
        </div>
      )}

      {activeTab === "operations" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Operations</h2>
          {currentTeamId && currentTeam?.is_operations ? (
            <OperationsPanel />
          ) : (
            <div className="text-sm text-muted">Operations access not available for this team.</div>
          )}
        </div>
      )}

      {activeTab === "team" && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Team</h2>
          {currentTeamId ? (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              {/* Join by team code */}
              <JoinTeamByCodeInline />
              
              {/* Team members list */}
              <TeamMembersPanel />
            </div>
          ) : (
            <div className="text-sm text-muted">You are not a member of any teams.</div>
          )}
        </div>
      )}

      {activeTab === "admin" && isAdmin && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Admin</h2>
          
          {/* Admin tools */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-semibold">Admin tools</h2>
              {/* Optional: rotate team code */}
              <RotateTeamCodeButton />
            </div>

            {/* Members management (admin only) */}
            <TeamMembersAdminPanel />
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[1200] bg-black/50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-border p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Delete Account
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              Are you sure you want to delete your account? This action cannot be undone. You will be removed from all teams and your profile will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}