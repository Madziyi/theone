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

      const invite = params.get("invite");
      if (invite) {
        // server-side add to team (no client write to team_members)
        try {
          const { error, data: joinRes } = await supabase.rpc("accept_team_invite", { p_code: invite });
          if (error) console.error("accept_team_invite", error.message);
          if (joinRes?.[0]?.team_id) {
            localStorage.setItem("team_id", joinRes[0].team_id);
          }
        } catch (e) {
          console.warn("Failed to accept invite", e);
        }
      }


      nav("/dashboard", { replace: true });
    })();
  }, [nav, params]);

  return <div className="p-4 text-sm text-muted">Signing you in…</div>;
}
