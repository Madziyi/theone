import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTeam } from "@/contexts/TeamContext";
import { useSession } from "@/hooks/useSession";
import BuoyStats from "@/components/Buoy/BuoyStats";
import { Link, useNavigate } from "react-router-dom";
import AlertsPanel from "@/components/Alerts/AlertsPanel";
import {
  X as CloseIcon,
} from "lucide-react";

/** Types aligned to your schema */
type Buoy = {
  id: number;
  buoy_id: string;           // integer in your table
  name: string;
  location_nickname: string | null;
  webcam: string | null;
  latitude: number;
  longitude: number;
};
type Profile = { first_name: string; last_name: string; email: string };

/* -------------------- Webcam modal -------------------- */
function WebcamModal({ src, onClose }: { src: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isHls = /\.m3u8($|\?)/i.test(src);

  useEffect(() => {
    let hls: any;
    const video = videoRef.current;
    if (!video) return;

    // native HLS support
    if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      video.play().catch(() => {});
      return;
    }

    // hls.js for other browsers
    (async () => {
      if (isHls) {
        const Hls = (await import("hls.js")).default;
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(video);
        } else {
          video.src = src; // fallback
        }
      } else {
        video.src = src; // mp4/etc.
      }
    })();

    return () => {
      try { hls?.destroy?.(); } catch {}
    };
  }, [src, isHls]);

  return (
    <div
      className="fixed inset-0 z-[1400] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Webcam video"
    >
      <div className="relative w-full max-w-4xl">
        <button
          className="absolute -top-10 right-0 rounded-lg border border-white/40 bg-black/40 px-3 py-1 text-sm text-white hover:bg-white/10"
          onClick={onClose}
          aria-label="Close webcam"
        >
          <CloseIcon className="inline h-4 w-4 mr-1" /> Close
        </button>
        <video
          ref={videoRef}
          className="w-full max-h-[80vh] rounded-xl border border-white/30 bg-black object-contain"
          controls
          autoPlay
          muted
          playsInline
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const nav = useNavigate();
  const { session } = useSession();
  const { currentTeam, currentTeamId, isManager, loading: teamLoading } = useTeam();
  const [activeTab, setActiveTab] = useState<"buoys" | "alerts">("buoys");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [teamBuoys, setTeamBuoys] = useState<Buoy[]>([]);
  const [loading, setLoading] = useState(true);
  const [invEmail, setInvEmail] = useState("");
  const [selected, setSelected] = useState<Buoy | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);

  // Load profile (for greeting)
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

  // Load buoys for current team via team_buoys → buoys (2-step for safety if no FK)
  useEffect(() => {
    if (!currentTeamId || teamLoading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 1) get team buoy ids
      const { data: tb, error: e1 } = await supabase
        .from("team_buoys")
        .select("buoy_id")
        .eq("team_id", currentTeamId);

      if (e1 || !tb || tb.length === 0) {
        if (!cancelled) {
          setTeamBuoys([]);
          setLoading(false);
        }
        return;
      }
      const ids = tb.map((r: any) => r.buoy_id);

      // 2) get buoys
      const { data: bs } = await supabase
        .from("buoys")
        .select("buoy_id,name,location_nickname,webcam,latitude,longitude")
        .in("buoy_id", ids);

      if (!cancelled) {
        setTeamBuoys((bs as any[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTeamId, teamLoading]);

  const greeting = useMemo(() => {
    if (!profile?.first_name) return "Welcome";
    return `Welcome, ${profile.first_name}`;
  }, [profile?.first_name]);

  // Manager: call Edge Function to send invite (client-safe; service key is on server)
  const sendInvitation = async () => {
    if (!invEmail || !currentTeamId) return;
    try {
      const { error } = await supabase.functions.invoke("invite-user", {
        body: { email: invEmail, team_id: currentTeamId },
      });
      if (error) throw error;
      alert("Invitation sent!");
      setInvEmail("");
    } catch (err: any) {
      console.error(err);
      alert("Failed to send invitation.");
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      localStorage.removeItem("team_id");
      nav("/login", { replace: true });
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-3 py-4 space-y-6">
      {/* Header as-is */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-[#0b1a2b] dark:to-[#132c47] p-4">
        <div className="flex items-center gap-4">
          {/* Team logo block unchanged */}
          {currentTeam?.logo_url ? (
            <img src={currentTeam.logo_url} alt={`${currentTeam.name} logo`} className="h-14 w-14 rounded-xl border border-border object-cover bg-white" />
          ) : (
            <div className="h-14 w-14 rounded-xl border border-border bg-card grid place-items-center text-sm">
              {currentTeam?.name?.slice(0, 2).toUpperCase() ?? "TM"}
            </div>
          )}
          <div className="min-w-0">
            <div className="text-2xl font-semibold truncate">
              {greeting}
            </div>
            <div className="text-sm text-muted truncate">
              {currentTeam?.name ? `Team: ${currentTeam.name}` : "Loading team…"}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-xl border border-border bg-card p-2">
        <div className="flex gap-2">
          <button
            className={`h-9 rounded-lg px-3 text-sm border ${activeTab === "buoys" ? "bg-primary text-white border-border" : "bg-background border-border text-foreground hover:bg-accent/30"}`}
            onClick={() => setActiveTab("buoys")}
          >
            Buoys
          </button>
          <button
            className={`h-9 rounded-lg px-3 text-sm border ${activeTab === "alerts" ? "bg-primary text-white border-border" : "bg-background border-border text-foreground hover:bg-accent/30"}`}
            onClick={() => setActiveTab("alerts")}
          >
            Alerts
          </button>
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === "buoys" ? (
        <>
          {/* === Your existing Buoys section START === */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your buoys</h2>
              <Link to="/" className="text-sm text-white bg-primary rounded-lg border border-border bg-card px-3 py-1.5 hover:bg-accent/30" title="Open map">
                Open map
              </Link>
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
                      <button
                        className="rounded-lg border border-border bg-primary px-2.5 py-1 text-xs text-white hover:bg-accent/30"
                        onClick={() => setSelected(b)}
                        aria-label={`Open realtime data for ${b.name}`}
                      >
                        Realtime Data
                      </button>
                         {b.webcam ? (
                      <button className="rounded-lg border border-border bg-primary px-2.5 text-white py-1 text-xs hover:bg-accent/30"
                        onClick={() => setShowWebcam(true)}>
                        Open Webcam
                      </button>
                    ) : null}

                      {/* Webcam modal (onscreen popup) */}
                      {showWebcam && b.webcam && (
                        <WebcamModal src={b.webcam} onClose={() => setShowWebcam(false)} />
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          

          {/* Manager tools */}
          {isManager && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Manager tools</h2>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
                <label className="grid gap-1">
                  <span className="text-sm text-muted">Invite a teammate (email)</span>
                  <input
                    type="email"
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
                    placeholder="jane.doe@example.com"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                  />
                </label>
                <button
                  className="h-10 self-end rounded-lg border border-border bg-primary px-4 text-sm text-white"
                  onClick={sendInvitation}
                  disabled={!invEmail || !currentTeamId}
                >
                  Send invite
                </button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Invited users will receive a sign-up link and join <strong>{currentTeam?.name}</strong> automatically.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={signOut}
              className="text-white h-9 rounded-lg border border-border bg-card px-3 text-sm bg-primary hover:bg-accent/30"
              title="Sign out"
            >
              Sign out
            </button>
          </div>

          {/* Fullscreen overlay for selected buoy */}
          {selected && (
            <div
              className="fixed inset-0 z-[1100] bg-gradient-to-br from-[#0b1a2b] to-[#132c47] text-white"
              role="dialog"
              aria-modal="true"
            >
              <div className="absolute right-4 top-3">
                <button
                  onClick={() => setSelected(null)}
                  className="rounded-md border border-white/50 px-3 py-1 text-sm hover:bg-white/10"
                  aria-label="Back"
                >
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
                  <Link
                    to={`/trends?buoy=${selected.buoy_id}`}
                    className="rounded-xl border border-white/30 px-3 py-1 text-white hover:bg-white/10"
                  >
                    Open Trends →
                  </Link>
                </div>

                {/* Webcam, if present */}
                {selected.webcam && (
                  <div className="mx-auto w-full max-w-4xl grow">
                    <video
                      className="h-[60vh] w-full rounded-lg border border-white/30 object-cover"
                      controls
                      autoPlay
                      muted
                      playsInline
                    >
                      <source src={selected.webcam} type="video/mp4" />
                    </video>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {selected && (
            <BuoyStats
              buoy={selected}
              onClose={() => setSelected(null)}
            />
          )}

        </>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Alerts</h2>
          {currentTeamId ? (
            <AlertsPanel teamId={currentTeamId} />
          ) : (
            <div className="text-sm text-muted">Select a team to view alerts.</div>
          )}
        </div>
      )}
    </section>
  );
}