// src/components/Header/InboxButton.tsx
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useTeam } from "@/contexts/TeamContext";
import InboxDrawer from "@/components/Inbox/InboxDrawer";

export default function InboxButton() {
  const { currentTeamId } = useTeam();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  const refreshUnread = useCallback(async () => {
    if (!currentTeamId) {
      setCount(0);
      return;
    }
    const { data, error } = await supabase.rpc("inbox_unread_count", {
      p_team: currentTeamId,
    });
    if (!error) setCount(data ?? 0);
  }, [currentTeamId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await refreshUnread();
    })();
    return () => {
      mounted = false;
    };
  }, [refreshUnread]);

  // Realtime: bump badge when a new inbox message is inserted for this team
  useEffect(() => {
    if (!currentTeamId) return;
    const ch = supabase
      .channel("inbox-badge")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "inbox_messages", filter: `team_id=eq.${currentTeamId}` },
        () => {
          // Either re-count or optimistic +1. Re-count is safer if there are RLS rules.
          refreshUnread();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [currentTeamId, refreshUnread]);

  return (
    <>
      <button
        className="relative rounded-lg border border-border bg-card p-2 hover:bg-accent/30"
        onClick={() => setOpen(true)}
        aria-label="Open inbox"
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      <InboxDrawer
        open={open}
        onClose={() => setOpen(false)}
        // Called by the drawer after a successful acknowledge.
        onAcknowledge={() => setCount((c) => Math.max(0, c - 1))}
        // In case of bulk ops or external mutations inside the drawer
        onRefresh={refreshUnread}
      />
    </>
  );
}