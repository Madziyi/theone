import React, { useEffect, useMemo, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

function setAppilixIdentity(identity: string | null | undefined) {
  if (!identity) return;

  // Prefer updating an existing tag so we don’t append duplicates
  const existing = document.getElementById("appilix-identity-script") as
    | HTMLScriptElement
    | null;

  const js = `var appilix_push_notification_user_identity = ${JSON.stringify(identity)};`;

  if (existing) {
    // Update the contents safely
    existing.textContent = js;
  } else {
    const script = document.createElement("script");
    script.id = "appilix-identity-script";
    script.type = "text/javascript";
    script.textContent = js; // safer than innerHTML
    document.body.appendChild(script);
  }
}

type Profession =
  | "student"
  | "fisher"
  | "researcher"
  | "utility_manager"
  | "environmental_personnel";

type Mode = "signin" | "signup" | "verify";

type WelcomeState = {
  show: boolean;
  visible: boolean;
  name: string;
  team?: string | null;
  logo?: string | null;
};

export default function Login() {
  const nav = useNavigate();
  const [search] = useSearchParams();

  // Determine initial tab and prefill from invite link
  const initialMode = (search.get("mode") as Mode) || "signin";
  const [mode, setMode] = useState<Mode>(initialMode);

  const [email, setEmail] = useState(search.get("email") ?? "");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState(search.get("first_name") ?? "");
  const [lastName, setLastName] = useState(search.get("last_name") ?? "");
  const [phoneNumber, setPhoneNumber] = useState(search.get("phone") ?? "");
  const [profession, setProfession] = useState<Profession>(
    (search.get("profession") as Profession) ?? "student"
  );

  // Optional team from invite link
  const [pendingTeamId, setPendingTeamId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [verifyEmail, setVerifyEmail] = useState<string>("");
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // Welcome overlay state
  const [welcome, setWelcome] = useState<WelcomeState>({
    show: false,
    visible: false,
    name: "",
    team: null,
    logo: null,
  });

  // Where GoTrue should send users back after clicking the email confirmation link
  const redirectTo = useMemo(() => {
    const origin = window.location.origin; // "http://localhost:5173" in dev
    const invite = search.get("invite");
    // Carry invite code into the email verification deep link
    return `${origin}/auth/callback${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
  }, [search]);

  // Read any invite params from URL
  useEffect(() => {
    const t = search.get("team") || search.get("team_id") || null;
    if (t) setPendingTeamId(t);
    if (search.get("prefill") === "signup") setMode("signup");
  }, [search]);


  // NEW: resolve ?invite=ABC123 → pendingTeamId and prefill signup
  useEffect(() => {
    const inviteCode = search.get("invite");
    if (!inviteCode) return;

    (async () => {
      try {
        const { data, error } = await supabase.rpc("resolve_team_invite", { p_code: inviteCode });
        if (error) throw error;
        const row = (data as any[])?.[0];
        if (row?.valid) {
          setPendingTeamId(row.team_id);
          setInfo(`You're joining: ${row.team_name}`);
          setMode("signup");
        } else {
          setError("This invite link is invalid or expired.");
        }
      } catch (e: any) {
        setError(e?.message ?? "Could not validate invite.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After sign-in, ensure we have an active team id stored for the app
  async function ensureActiveTeamForUser(userId: string, hintTeamId?: string | null) {
    // use the hint or the metadata value purely to set local state
    const { data } = await supabase.auth.getUser();
    const metaTeam = (data?.user?.user_metadata as any)?.pending_team_id ?? null;
    const chosen = hintTeamId || metaTeam || null;

    if (chosen) {
      localStorage.setItem("team_id", chosen);
    }

    // If nothing in storage yet, pick the first membership (server trigger likely added it)
    let active = localStorage.getItem("team_id");
    if (!active) {
      const { data: memberships } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true })
        .limit(1);
      active = memberships?.[0]?.team_id ?? null;
      if (active) localStorage.setItem("team_id", active);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const user = data.user;

    // Set Appilix identity (choose email or id)
    setAppilixIdentity(user?.email ?? user?.id);

      const userId = data.user?.id;
      let userFirst = "";
      let teamLogo: string | null = null;
      let teamName: string | null = null;

      if (userId) {
        // Ensure team context is ready (and possibly join invite team)
        await ensureActiveTeamForUser(userId, pendingTeamId);

        // Load profile first name for greeting
        const { data: prof } = await supabase
          .from("profiles")
          .select("first_name")
          .eq("id", userId)
          .maybeSingle();
        userFirst = (prof as any)?.first_name ?? "";

        // Resolve active team id
        const activeTeamId = pendingTeamId || localStorage.getItem("team_id") || null;

        if (activeTeamId) {
          const { data: team } = await supabase
            .from("teams")
            .select("name, logo_url")
            .eq("id", activeTeamId)
            .maybeSingle();
          teamLogo = (team as any)?.logo_url ?? null;
          teamName = (team as any)?.name ?? null;
        }
      }

      // Show welcome overlay, then navigate
      setWelcome({
        show: true,
        visible: false,
        name: userFirst || "Welcome",
        team: teamName,
        logo: teamLogo,
      });

      // Kick off fade-in
      requestAnimationFrame(() =>
        setWelcome((w) => ({ ...w, visible: true }))
      );

      // Let it breathe, then go
      setTimeout(() => {
        nav("/dashboard", { replace: true });
      }, 2000);
    } catch (err: any) {
      setError(err?.message ?? "Failed to sign in.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
  let mounted = true;
  (async () => {
    const { data } = await supabase.auth.getUser();
    if (!mounted) return;
    const user = data?.user;
    if (user) {
      setAppilixIdentity(user.email ?? user.id);
    }
  })();
  return () => {
    mounted = false;
  };
}, []);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);


  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          // Stored into auth.users.raw_user_meta_data -> your trigger syncs to public.profiles
          data: {
            first_name: firstName,
            last_name: lastName,
            phone_number: phoneNumber,
            profession,
            // Let callback page auto-join the team
            ...(pendingTeamId ? { pending_team_id: pendingTeamId } : {}),
          },
        },
      });
      if (error) {
        console.error('[signup]', { status: (error as any)?.status, message: error.message });
        throw error;
      }
      setVerifyEmail(email);
      setMode("verify");
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Signup aborted');
        return;
      }
      setError(err?.message ?? "Failed to sign up.");
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: verifyEmail || email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setInfo("Verification email re-sent. Check your inbox (and spam).");
    } catch (err: any) {
      setError(err?.message ?? "Could not resend email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4 relative">
      {/* Welcome overlay */}
      {welcome.show && (
        <div
          className={`fixed inset-0 z-[3000] grid place-items-center bg-black/95 transition-opacity duration-700 ${
            welcome.visible ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="rounded-2xl border border-border bg-card/95 px-6 py-8 text-center shadow-xl backdrop-blur">
            {welcome.logo ? (
              <img
                src={welcome.logo}
                alt="Team logo"
                className="mx-auto mb-3 h-16 w-16 rounded-xl border border-border object-cover bg-white"
              />
            ) : null}
            <div className="text-2xl font-semibold">
              {welcome.name ? `Welcome, ${welcome.name}` : "Welcome"}
            </div>
            {welcome.team && (
              <div className="mt-1 text-sm text-muted">{welcome.team}</div>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex rounded-xl border border-border bg-card p-1 text-sm">
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 ${
            mode === "signin" ? "bg-cyan-500 font-medium text-white" : ""
          }`}
          onClick={() => {
            setMode("signin");
            setError(null);
            setInfo(null);
          }}
          disabled={busy}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-lg px-3 py-2 ${
            mode === "signup" ? "bg-cyan-500 font-medium text-white" : ""
          }`}
          onClick={() => {
            setMode("signup");
            setError(null);
            setInfo(null);
          }}
          disabled={busy}
        >
          Sign up
        </button>
      </div>

      {mode === "signin" && (
        <form onSubmit={handleSignIn} className="space-y-3 rounded-2xl border border-border p-4">
          <div className="grid gap-1">
            <label className="text-sm">Email</label>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm">Password</label>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="submit"
              className="h-10 rounded-xl border border-border bg-primary px-4 text-sm text-white"
              disabled={busy}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      )}

      {mode === "signup" && (
        <form onSubmit={handleSignUp} className="space-y-3 rounded-2xl border border-border p-4">
          {pendingTeamId && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              You're joining a team by invite. Team ID: <span className="font-mono">{pendingTeamId}</span>
            </div>
          )}
          <div className="grid gap-1">
            <label className="text-sm">First name</label>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm">Last name</label>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm">Email</label>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm">Password</label>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm">Phone number</label>
            <input
              className="h-10 rounded-lg border border-border bg-background px-3"
              type="tel"
              autoComplete="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm">Profession</label>
            <select
              className="h-10 rounded-lg border border-border bg-background px-3"
              value={profession}
              onChange={(e) => setProfession(e.target.value as Profession)}
              disabled={busy}
            >
              <option value="student">Student</option>
              <option value="fisher">Fisher</option>
              <option value="researcher">Researcher</option>
              <option value="utility_manager">Utility manager</option>
              <option value="environmental_personnel">Environmental personnel</option>
            </select>
          </div>
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              className="h-10 rounded-xl border border-border bg-card px-4 text-sm"
              onClick={() => setMode("signin")}
              disabled={busy}
            >
              Back to sign in
            </button>
            <button
              type="submit"
              className="h-10 rounded-xl border border-border bg-primary px-4 text-sm text-white"
              disabled={busy}
            >
              {busy ? "Creating account…" : "Create account"}
            </button>
          </div>
        </form>
      )}

      {mode === "verify" && (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          <h2 className="text-lg font-semibold">Confirm your email</h2>
          <p className="text-sm text-muted">
            We sent a confirmation link to <span className="font-medium">{verifyEmail}</span>. Click
            the link to verify your account and sign in.
          </p>
          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {info && (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {info}
            </div>
          )}
          <div className="flex items-center justify-between pt-2">
            <button
              className="h-10 rounded-xl border border-border bg-card px-4 text-sm"
              onClick={() => setMode("signin")}
              disabled={busy}
            >
              Back to sign in
            </button>
            <button
              className="h-10 rounded-xl border border-border bg-primary px-4 text-sm text-white"
              onClick={resendVerification}
              disabled={busy}
            >
              {busy ? "Sending…" : "Resend email"}
            </button>
          </div>
          <p className="pt-1 text-xs text-muted">Tip: Check your spam/junk folder.</p>
        </div>
      )}
      
      {/* Footer Links */}
      <div className="mt-8 pt-4 border-t border-border text-center">
        <div className="flex justify-center gap-4 text-sm text-muted">
          <a href="/support" className="hover:text-foreground">Support</a>
          <a href="/privacy" className="hover:text-foreground">Privacy Policy</a>
          <a href="/requestdelete" className="hover:text-foreground">Request Account Deletion</a>
        </div>
        <p className="mt-2 text-xs text-muted">
          © 2025 T & E Lab
        </p>
      </div>
    </div>
  );
}