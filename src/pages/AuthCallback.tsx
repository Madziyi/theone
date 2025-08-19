// src/pages/AuthCallback.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function AuthCallback() {
  const nav = useNavigate();
  const [search] = useSearchParams();
  const [msg, setMsg] = useState("Finishing sign-in…");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Try to reuse an existing session (email confirm + auto sign-in)
        let { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        // Some flows (PKCE / deep links) may require exchanging a code from the URL.
        // If your runtime doesn’t need this it’s a no-op.
        if (!data.session) {
          const url = new URL(window.location.href);
          const hasCode = !!url.searchParams.get("code");
          const hasHashTokens = url.hash.includes("access_token");
          if (hasCode || hasHashTokens) {
            try {
              const ex = await supabase.auth.exchangeCodeForSession(window.location.href);
              if (!ex.error) data = { session: ex.data.session } as any;
            } catch {
              /* best-effort */
            }
          }
        }

        const session = data.session;
        if (!session) {
          setMsg("Email confirmed. Please sign in.");
          nav("/login", { replace: true });
          return;
        }

        const user = session.user;
        const meta = (user.user_metadata ?? {}) as Record<string, any>;

        // From metadata (set during signup) or URL (?team=)
        let pendingTeamId: string | null =
          meta.pending_team_id ?? search.get("team") ?? search.get("team_id");

        if (pendingTeamId) {
          setMsg("Joining your team…");
          await supabase
            .from("team_members")
            .upsert(
              { team_id: pendingTeamId, user_id: user.id, role: "member" },
              { onConflict: "team_id,user_id" }
            );

          localStorage.setItem("team_id", pendingTeamId);

          // Clear flag in metadata (best-effort)
          if (meta.pending_team_id) {
            try {
              await supabase.auth.updateUser({ data: { pending_team_id: null } });
            } catch {
              /* ignore */
            }
          }
        } else {
          // If no hint, pick first membership as active
          const { data: memberships } = await supabase
            .from("team_members")
            .select("team_id")
            .eq("user_id", user.id)
            .order("joined_at", { ascending: true })
            .limit(1);

          const first = memberships?.[0]?.team_id;
          if (first) localStorage.setItem("team_id", first);
        }

        setMsg("All set. Redirecting…");
        nav("/dashboard", { replace: true });
      } catch (e: any) {
        setErr(e?.message ?? "Something went wrong.");
        setTimeout(() => nav("/login", { replace: true }), 1200);
      }
    })();
  }, [nav, search]);

  return <div className="p-4 text-sm">{err ? <span className="text-red-600">{err}</span> : msg}</div>;
}
