// src/pages/AuthCallback.tsx
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const nav = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        // no session; go to login
        nav("/login", { replace: true });
        return;
      }

      // Check if user has a pending team code from signup
      const pendingTeamCode = data.user.user_metadata?.pending_team_code;
      if (pendingTeamCode) {
        try {
          const { data: joinRes, error } = await supabase.rpc("join_team_by_code", { p_code: pendingTeamCode });
          if (error) {
            console.error("Failed to join team with code:", error);
          } else if (joinRes) {
            localStorage.setItem("team_id", joinRes);
            console.log("Successfully joined team with code:", pendingTeamCode);
          }
        } catch (e) {
          console.warn("Failed to process team code during signup:", e);
        }
      }

      nav("/dashboard", { replace: true });
    })();
  }, [nav, params]);

  return <div className="p-4 text-sm text-muted">Signing you in…</div>;
}
